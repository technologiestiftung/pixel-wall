/*
 * Standalone host test for game_of_life.h — no shared fixtures needed (unlike
 * test_decode.cpp), since this logic has no other language implementation to
 * stay in sync with. Driven by apps/backend/tests/test_esp32_game_of_life.py.
 */

#include <stdio.h>
#include <string.h>

#include "../pixel_wall_esp32/game_of_life.h"

static int failures = 0;

static void check(bool condition, const char *what) {
	if (!condition) {
		printf("FAIL: %s\n", what);
		failures++;
	}
}

static void setCells(GameOfLifeBoard *board, const int cells[][2], int count) {
	memset(board, 0, sizeof(*board));
	for (int i = 0; i < count; i++) {
		golSet(board, cells[i][0], cells[i][1]);
	}
}

static uint32_t constantRandom0() { return 0; }
static uint32_t constantRandom99() { return 99; }

int main(void) {
	/* A glider in the interior, well away from any edge, evolves exactly as
	 * the textbook pattern says — this is the ordinary (non-wraparound)
	 * B3/S23 case. */
	{
		GameOfLifeBoard board;
		const int glider[][2] = {{11, 10}, {12, 11}, {10, 12}, {11, 12}, {12, 12}};
		setCells(&board, glider, 5);

		golStep(&board);

		const int expected[][2] = {{10, 11}, {12, 11}, {11, 12}, {12, 12}, {11, 13}};
		GameOfLifeBoard want;
		setCells(&want, expected, 5);
		check(memcmp(board.rows, want.rows, sizeof(board.rows)) == 0,
		      "glider evolves to the textbook next generation");
	}

	/* A 2x2 block straddling the top-left corner (columns 31/0, rows 31/0)
	 * is a still life only if neighbour counting actually wraps — this is
	 * the toroidal case demo-main.cc also relies on. The initial board is
	 * never itself hashed (only post-step boards are), so a period-1 still
	 * life needs two steps before its hash has anything stored to match
	 * against — the first step's result lands in `previousHash`, and only
	 * the second step compares against that. */
	{
		GameOfLifeBoard board;
		const int block[][2] = {{31, 31}, {0, 31}, {31, 0}, {0, 0}};
		setCells(&board, block, 4);

		GameOfLifeBoard before = board;
		GolStepResult first = golStep(&board);
		check(memcmp(board.rows, before.rows, sizeof(board.rows)) == 0,
		      "a block straddling the wraparound edge is a still life");
		check(!first.stagnated, "nothing to compare against yet on the first step");
		GolStepResult second = golStep(&board);
		check(second.stagnated, "a still life is caught by its second step");
	}

	/* A blinker (period-2 oscillator): by the same one-step lag as above, its
	 * hash sequence from step 1 onward is H(vertical), H(horizontal),
	 * H(vertical), ... — the repeat isn't visible until step 3, when the
	 * current hash matches what step 1 stored in secondPreviousHash. */
	{
		GameOfLifeBoard board;
		const int blinker[][2] = {{4, 5}, {5, 5}, {6, 5}};
		setCells(&board, blinker, 3);

		GolStepResult first = golStep(&board);
		check(!first.stagnated, "a blinker's first step has nothing to compare against");
		GolStepResult second = golStep(&board);
		check(!second.stagnated, "a blinker's second step only matches the *first* stored hash's slot with a different value");
		GolStepResult third = golStep(&board);
		check(third.stagnated, "a blinker's third step repeats what step 1 stored");

		// 3 steps is 1.5 periods, not 2: step 1 -> vertical, step 2 ->
		// horizontal (the original state), step 3 -> vertical again — the
		// same phase step 1 produced, which is exactly what makes the hash
		// match step 1's stored value.
		const int vertical[][2] = {{5, 4}, {5, 5}, {5, 6}};
		GameOfLifeBoard want;
		setCells(&want, vertical, 3);
		check(memcmp(board.rows, want.rows, sizeof(board.rows)) == 0,
		      "a period-2 oscillator is in the same phase step 1 produced");
	}

	/* An empty board stays empty. Same one-step lag: the first step has
	 * nothing stored yet to match; the second step matches what the first
	 * one stored. */
	{
		GameOfLifeBoard board;
		memset(&board, 0, sizeof(board));

		GolStepResult first = golStep(&board);
		bool allDead = true;
		for (int y = 0; y < GOL_SIZE; y++) {
			if (board.rows[y] != 0) allDead = false;
		}
		check(allDead, "an empty board stays empty");
		check(!first.stagnated, "nothing to compare against yet on the first step");

		GolStepResult second = golStep(&board);
		check(second.stagnated, "an empty board is caught by its second step");
	}

	/* Seeding is exactly a per-cell density draw against the injected RNG:
	 * a source that always reads low seeds every cell alive, one that always
	 * reads high seeds none. */
	{
		GameOfLifeBoard board;
		golSeed(&board, constantRandom0);
		bool allAlive = true;
		for (int y = 0; y < GOL_SIZE; y++) {
			if (board.rows[y] != 0xFFFFFFFFu) allAlive = false;
		}
		check(allAlive, "a constantly-low RNG seeds every cell alive");

		golSeed(&board, constantRandom99);
		bool allDead = true;
		for (int y = 0; y < GOL_SIZE; y++) {
			if (board.rows[y] != 0) allDead = false;
		}
		check(allDead, "a constantly-high RNG seeds every cell dead");
	}

	/* The generation ceiling fires even when the hash genuinely doesn't
	 * match, so a very-long-period board can never run forever. */
	{
		GameOfLifeBoard board;
		const int glider[][2] = {{11, 10}, {12, 11}, {10, 12}, {11, 12}, {12, 12}};
		setCells(&board, glider, 5);
		board.generation = GOL_MAX_GENERATIONS - 1;
		board.previousHash = 0xFFFFFFFFu;
		board.secondPreviousHash = 0xFFFFFFFEu;

		GolStepResult result = golStep(&board);
		check(result.stagnated, "the generation ceiling forces a reseed on its own");
	}

	if (failures == 0) {
		printf("ok: game of life\n");
		return 0;
	}
	printf("%d failure(s)\n", failures);
	return 1;
}
