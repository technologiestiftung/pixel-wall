/*
 * Decoder for the mask1 / pal4 bitmap blocks and the binary MQTT envelope —
 * docs/wire-format.md is the normative spec.
 *
 * Deliberately free of Arduino headers so it can be compiled and run on a
 * host against docs/wire-format-fixtures.json (see apps/esp32/tests/), which
 * is the only way to check this against the Python and TypeScript codecs
 * without a wall attached.
 */

#ifndef PIXEL_WALL_WIRE_DECODE_H
#define PIXEL_WALL_WIRE_DECODE_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define ENVELOPE_MAGIC 0x57
#define ENVELOPE_VERSION 0x01
#define ENVELOPE_HEADER 21
#define FLAG_SCROLL 0x01

#define MASK1_MAGIC 0x50
#define PAL4_MAGIC 0x51
#define BLOCK_VERSION 0x01
#define MASK1_HEADER 7
#define PAL4_HEADER 8
#define ENCODING_RAW 0x00
#define ENCODING_RLE 0x01
#define PAL4_MAX_COLORS 16

/* A 256-char Lauftext filmstrip decodes to ~9.2 KB; above this the payload is
 * dropped and the last good frame kept rather than exhausting the heap. */
#ifndef MAX_PIXELS_BYTES
#define MAX_PIXELS_BYTES 12288
#endif

typedef struct {
	bool valid;
	uint8_t format;
	uint16_t widthPx;
	uint16_t heightPx;
	uint16_t stride;
	uint8_t *pixels;     /* unpacked block body, rows padded as on the wire */
	size_t pixelsLen;

	uint8_t r, g, b;
	uint8_t palette[PAL4_MAX_COLORS][3];
	uint8_t paletteCount;

	uint16_t winX, winY;

	bool scrolling;
	uint8_t direction;   /* 0 = left, 1 = right */
	uint16_t speedPxPerSec;
	uint16_t pauseMs;
	uint16_t compositeWidthPx;
} PixelWallScreen;

static inline void pixelWallScreenInit(PixelWallScreen *screen) {
	memset(screen, 0, sizeof(*screen));
	screen->format = MASK1_MAGIC;
	screen->r = 255;
	screen->g = 255;
	screen->b = 255;
}

static inline void pixelWallScreenFree(PixelWallScreen *screen) {
	free(screen->pixels);
	screen->pixels = NULL;
	screen->pixelsLen = 0;
	screen->valid = false;
}

static inline uint16_t pixelWallReadU16(const uint8_t *buffer) {
	return (uint16_t)((buffer[0] << 8) | buffer[1]);
}

/* Expands a block body into the padded row buffer the render loop indexes.
 * Both encodings land in the same layout, so rendering never has to care which
 * one arrived. Returns false on anything malformed; the caller keeps the last
 * good frame rather than blanking the wall. */
static inline bool pixelWallDecodeBody(PixelWallScreen *screen, const uint8_t *body,
                                       size_t bodyLen, uint8_t encoding,
                                       size_t expected, bool nibbles) {
	if (expected == 0 || expected > MAX_PIXELS_BYTES) {
		return false;
	}

	uint8_t *buffer = (uint8_t *)calloc(expected, 1);
	if (buffer == NULL) {
		return false;
	}

	if (encoding == ENCODING_RAW) {
		if (bodyLen != expected) {
			free(buffer);
			return false;
		}
		memcpy(buffer, body, expected);
	} else if (encoding == ENCODING_RLE) {
		size_t total = expected * (nibbles ? 2 : 8);
		size_t cursor = 0;
		size_t index = 0;
		uint8_t value = 0; /* mask1 runs alternate, starting clear */

		while (cursor < bodyLen) {
			if (nibbles) {
				value = body[cursor++];
				if (value > 0x0F || cursor >= bodyLen) {
					free(buffer);
					return false;
				}
			}

			uint32_t run = 0;
			uint8_t shift = 0;
			bool complete = false;
			while (cursor < bodyLen) {
				uint8_t byte = body[cursor++];
				run |= (uint32_t)(byte & 0x7F) << shift;
				if ((byte & 0x80) == 0) {
					complete = true;
					break;
				}
				shift += 7;
			}
			if (!complete || index + run > total) {
				free(buffer);
				return false;
			}

			if (nibbles) {
				for (uint32_t i = 0; i < run; i++) {
					size_t at = index + i;
					buffer[at >> 1] |= (at % 2 == 0) ? (uint8_t)(value << 4) : value;
				}
			} else if (value) {
				for (uint32_t i = 0; i < run; i++) {
					size_t at = index + i;
					buffer[at >> 3] |= (uint8_t)(0x80 >> (at & 7));
				}
			}

			index += run;
			if (!nibbles) value ^= 1;
		}

		if (index != total) {
			free(buffer);
			return false;
		}
	} else {
		free(buffer);
		return false;
	}

	free(screen->pixels);
	screen->pixels = buffer;
	screen->pixelsLen = expected;
	return true;
}

static inline bool pixelWallDecodeBlock(PixelWallScreen *screen, const uint8_t *block,
                                        size_t length) {
	if (length < MASK1_HEADER) return false;
	if (block[1] != BLOCK_VERSION) return false;

	uint8_t encoding = block[2];
	uint16_t width = pixelWallReadU16(block + 3);
	uint16_t height = pixelWallReadU16(block + 5);
	if (width == 0 || height == 0) return false;

	if (block[0] == MASK1_MAGIC) {
		uint16_t stride = (uint16_t)((width + 7) / 8);
		if (!pixelWallDecodeBody(screen, block + MASK1_HEADER, length - MASK1_HEADER,
		                         encoding, (size_t)stride * height, false)) {
			return false;
		}
		screen->format = MASK1_MAGIC;
		screen->stride = stride;
	} else if (block[0] == PAL4_MAGIC) {
		if (length < PAL4_HEADER) return false;
		uint8_t count = block[7];
		if (count < 1 || count > PAL4_MAX_COLORS) return false;
		size_t paletteEnd = PAL4_HEADER + (size_t)count * 3;
		if (length < paletteEnd) return false;

		uint16_t stride = (uint16_t)((width + 1) / 2);
		if (!pixelWallDecodeBody(screen, block + paletteEnd, length - paletteEnd,
		                         encoding, (size_t)stride * height, true)) {
			return false;
		}
		for (uint8_t i = 0; i < count; i++) {
			screen->palette[i][0] = block[PAL4_HEADER + i * 3];
			screen->palette[i][1] = block[PAL4_HEADER + i * 3 + 1];
			screen->palette[i][2] = block[PAL4_HEADER + i * 3 + 2];
		}
		screen->paletteCount = count;
		screen->format = PAL4_MAGIC;
		screen->stride = stride;
	} else {
		/* An unknown format must be rejected, never guessed at. */
		return false;
	}

	screen->widthPx = width;
	screen->heightPx = height;
	return true;
}

/* Parses a whole retained MQTT message: the fixed envelope header plus the
 * block it carries. */
static inline bool pixelWallDecodeFrame(PixelWallScreen *screen, const uint8_t *payload,
                                        size_t length) {
	if (length < ENVELOPE_HEADER) return false;
	if (payload[0] != ENVELOPE_MAGIC || payload[1] != ENVELOPE_VERSION) return false;

	if (!pixelWallDecodeBlock(screen, payload + ENVELOPE_HEADER,
	                          length - ENVELOPE_HEADER)) {
		return false;
	}

	screen->r = payload[3];
	screen->g = payload[4];
	screen->b = payload[5];
	screen->winX = pixelWallReadU16(payload + 6);
	screen->winY = pixelWallReadU16(payload + 8);
	screen->scrolling = (payload[2] & FLAG_SCROLL) != 0;
	if (screen->scrolling) {
		screen->direction = payload[14];
		screen->speedPxPerSec = pixelWallReadU16(payload + 15);
		screen->pauseMs = pixelWallReadU16(payload + 17);
		screen->compositeWidthPx = pixelWallReadU16(payload + 19);
	}
	screen->valid = true;
	return true;
}

/* Colour of one pixel, or false where nothing is lit. */
static inline bool pixelWallSample(const PixelWallScreen *screen, int x, int y,
                                   uint8_t *r, uint8_t *g, uint8_t *b) {
	if (x < 0 || y < 0 || x >= (int)screen->widthPx || y >= (int)screen->heightPx) {
		return false;
	}

	if (screen->format == MASK1_MAGIC) {
		size_t at = (size_t)y * screen->stride + (size_t)(x >> 3);
		if (at >= screen->pixelsLen) return false;
		if ((screen->pixels[at] & (0x80 >> (x & 7))) == 0) return false;
		*r = screen->r;
		*g = screen->g;
		*b = screen->b;
		return true;
	}

	size_t at = (size_t)y * screen->stride + (size_t)(x >> 1);
	if (at >= screen->pixelsLen) return false;
	uint8_t index = (x % 2 == 0) ? (uint8_t)((screen->pixels[at] >> 4) & 0x0F)
	                             : (uint8_t)(screen->pixels[at] & 0x0F);
	if (index == 0 || index >= screen->paletteCount) return false;
	*r = screen->palette[index][0];
	*g = screen->palette[index][1];
	*b = screen->palette[index][2];
	return true;
}

#endif /* PIXEL_WALL_WIRE_DECODE_H */
