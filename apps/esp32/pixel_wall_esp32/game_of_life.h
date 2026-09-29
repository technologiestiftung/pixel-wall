/*
 * Conway's Game of Life, native on the ESP32 — no bitmap ever crosses the
 * wire for this content (docs/wire-format.md "Game of Life"). Deliberately
 * free of Arduino headers, same discipline as wire_decode.h, so this can be
 * compiled and run on a host (see apps/esp32/tests/test_game_of_life.cpp).
 *
 * Board size is fixed at 32x32 — this firmware only ever drives 32x32 panels
 * (PANEL_RES_X/Y in pixel_wall_esp32.ino) — with each row packed into one
 * uint32_t so a whole row's neighbour counts fall out of plain bit shifts.
 */

#ifndef PIXEL_WALL_GAME_OF_LIFE_H
#define PIXEL_WALL_GAME_OF_LIFE_H

#include <stdint.h>
#include <string.h>

#define GOL_SIZE 32

typedef struct {
	uint32_t rows[GOL_SIZE]; /* bit x of rows[y] set = cell (x, y) is alive */
	uint32_t previousHash;
	uint32_t secondPreviousHash;
	uint16_t generation;
} GameOfLifeBoard;

/* Injected rather than called directly, so this header stays host-testable
 * (a fixed sequence in a test) and so each of the three independently
 * addressed small screens seeds from its own draw of the caller's RNG —
 * see pixel_wall_esp32.ino, which wires this to esp_random(). Must return a
 * value across the full uint32_t range. */
typedef uint32_t (*GolRandomFn)(void);

/* ~30% alive is the density that keeps a 32x32 toroidal board lively without
 * dying out almost immediately (much sparser boards tend to go extinct in a
 * handful of generations; much denser ones collapse to a static grid) —
 * chosen for an interesting starting state, since the reference
 * (hzeller/rpi-rgb-led-matrix's demo-main.cc) does not fix one canonical
 * value either. */
#define GOL_SEED_DENSITY_PERCENT 30

/* A still life or short (period <=2) oscillator reads to a viewer as "this
 * board isn't doing anything new any more" and is treated as stagnation. A
 * longer-period oscillator, or a glider (itself periodic on a toroidal
 * board, just over a much longer period), is instead caught by this
 * generation ceiling, so the display is never more than this many
 * generations away from a fresh board even in the cases the cheap hash
 * check misses. */
#define GOL_MAX_GENERATIONS 2000

static inline bool golGet(const GameOfLifeBoard *board, int x, int y) {
	return ((board->rows[y & (GOL_SIZE - 1)] >> (x & (GOL_SIZE - 1))) & 1u) != 0;
}

static inline void golSet(GameOfLifeBoard *board, int x, int y) {
	board->rows[y] |= (1u << x);
}

/* Cheap FNV-1a over the 32 row words. Used only to notice "this generation
 * looks like one we already saw" — a false positive just costs an
 * occasional early reseed, never a wrong pixel, so this doesn't need to be a
 * strong hash. */
static inline uint32_t golHash(const GameOfLifeBoard *board) {
	uint32_t hash = 0x811C9DC5u;
	for (int y = 0; y < GOL_SIZE; y++) {
		uint32_t word = board->rows[y];
		for (int b = 0; b < 4; b++) {
			hash ^= (word >> (b * 8)) & 0xFF;
			hash *= 0x01000193u;
		}
	}
	return hash;
}

/* A fresh random board — called whenever a screen (re)selects Game of Life
 * (see pixel_wall_esp32.ino's onMessage) and again whenever golStep reports
 * the board has stagnated. */
static inline void golSeed(GameOfLifeBoard *board, GolRandomFn random) {
	memset(board, 0, sizeof(*board));
	for (int y = 0; y < GOL_SIZE; y++) {
		for (int x = 0; x < GOL_SIZE; x++) {
			if ((random() % 100) < GOL_SEED_DENSITY_PERCENT) {
				golSet(board, x, y);
			}
		}
	}
}

typedef struct {
	/* True when the caller should golSeed() again rather than keep
	 * stepping — the board died out, settled into a still life, or has been
	 * running long enough that it's due a fresh start regardless. */
	bool stagnated;
} GolStepResult;

/* Advances the board by exactly one generation, toroidal (wraparound) Moore
 * neighbourhood, standard B3/S23 rules — same conventions as the reference
 * this feature is modelled on (hzeller/rpi-rgb-led-matrix's demo-main.cc). */
static inline GolStepResult golStep(GameOfLifeBoard *board) {
	uint32_t nextRows[GOL_SIZE];
	for (int y = 0; y < GOL_SIZE; y++) {
		uint32_t yAbove = board->rows[(y + GOL_SIZE - 1) % GOL_SIZE];
		uint32_t yThis = board->rows[y];
		uint32_t yBelow = board->rows[(y + 1) % GOL_SIZE];
		uint32_t next = 0;

		for (int x = 0; x < GOL_SIZE; x++) {
			int xLeft = (x + GOL_SIZE - 1) % GOL_SIZE;
			int xRight = (x + 1) % GOL_SIZE;
			int count = (int)((yAbove >> xLeft) & 1) + (int)((yAbove >> x) & 1) +
			            (int)((yAbove >> xRight) & 1) + (int)((yThis >> xLeft) & 1) +
			            (int)((yThis >> xRight) & 1) + (int)((yBelow >> xLeft) & 1) +
			            (int)((yBelow >> x) & 1) + (int)((yBelow >> xRight) & 1);
			bool alive = ((yThis >> x) & 1) != 0;
			bool nextAlive = alive ? (count == 2 || count == 3) : (count == 3);
			if (nextAlive) next |= (1u << x);
		}

		nextRows[y] = next;
	}
	memcpy(board->rows, nextRows, sizeof(nextRows));
	board->generation++;

	uint32_t hash = golHash(board);
	GolStepResult result;
	result.stagnated = hash == board->previousHash || hash == board->secondPreviousHash ||
	                    board->generation >= GOL_MAX_GENERATIONS;
	board->secondPreviousHash = board->previousHash;
	board->previousHash = hash;
	return result;
}

#endif /* PIXEL_WALL_GAME_OF_LIFE_H */
