/*
 * Runs the firmware's decoder against the shared fixtures, on a host.
 *
 * The C++ decoder is the one implementation that cannot be exercised by the
 * Python or TypeScript suites, and checking it against the panels means
 * checking it against the slowest possible feedback loop. Driven by
 * apps/backend/tests/test_esp32_decoder.py, which generates fixtures.h from
 * docs/wire-format-fixtures.json.
 */

#include <stdio.h>
#include <string.h>

#include "../pixel_wall_esp32/wire_decode.h"
#include "fixtures.h"

static int failures = 0;

static void check(bool condition, const char *what, const char *name) {
	if (!condition) {
		printf("FAIL %s: %s\n", name, what);
		failures++;
	}
}

static void runCase(const FixtureCase &fixture, const uint8_t *block, size_t length) {
	PixelWallScreen screen;
	pixelWallScreenInit(&screen);

	if (!pixelWallDecodeBlock(&screen, block, length)) {
		printf("FAIL %s: decode returned false\n", fixture.name);
		failures++;
		pixelWallScreenFree(&screen);
		return;
	}

	check(screen.widthPx == fixture.widthPx, "width", fixture.name);
	check(screen.heightPx == fixture.heightPx, "height", fixture.name);
	check(screen.stride == fixture.stride, "stride", fixture.name);

	for (uint16_t y = 0; y < fixture.heightPx; y++) {
		for (uint16_t x = 0; x < fixture.widthPx; x++) {
			uint8_t r = 0, g = 0, b = 0;
			bool lit = pixelWallSample(&screen, x, y, &r, &g, &b);
			char expected = fixture.rows[y][x];

			if (fixture.isPal4) {
				uint8_t index = (expected >= 'a') ? (uint8_t)(expected - 'a' + 10)
				                                  : (uint8_t)(expected - '0');
				if (index == 0) {
					check(!lit, "expected background", fixture.name);
				} else {
					check(lit, "expected a lit pixel", fixture.name);
					check(r == fixture.palette[index][0] &&
					          g == fixture.palette[index][1] &&
					          b == fixture.palette[index][2],
					      "palette colour", fixture.name);
				}
			} else {
				check(lit == (expected == '#'), "mask coverage", fixture.name);
			}
		}
	}

	pixelWallScreenFree(&screen);
}

int main(void) {
	for (size_t i = 0; i < FIXTURE_COUNT; i++) {
		const FixtureCase &fixture = FIXTURES[i];
		/* Both encodings must decode to the same image. */
		runCase(fixture, fixture.rawBytes, fixture.rawLen);
		runCase(fixture, fixture.rleBytes, fixture.rleLen);
	}

	/* Malformed input must be rejected rather than rendered. */
	PixelWallScreen screen;
	pixelWallScreenInit(&screen);
	const uint8_t badMagic[] = {0x99, 0x01, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00};
	check(!pixelWallDecodeBlock(&screen, badMagic, sizeof(badMagic)),
	      "unknown magic must be rejected", "malformed");
	const uint8_t badVersion[] = {0x50, 0x09, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00};
	check(!pixelWallDecodeBlock(&screen, badVersion, sizeof(badVersion)),
	      "unknown version must be rejected", "malformed");
	const uint8_t tooShort[] = {0x50, 0x01};
	check(!pixelWallDecodeBlock(&screen, tooShort, sizeof(tooShort)),
	      "truncated header must be rejected", "malformed");
	const uint8_t shortFrame[] = {0x57, 0x01, 0x00};
	check(!pixelWallDecodeFrame(&screen, shortFrame, sizeof(shortFrame)),
	      "truncated envelope must be rejected", "malformed");
	pixelWallScreenFree(&screen);

	/* A whole envelope round-trips its metadata. */
	pixelWallScreenInit(&screen);
	if (pixelWallDecodeFrame(&screen, ENVELOPE_SAMPLE, ENVELOPE_SAMPLE_LEN)) {
		check(screen.r == 254 && screen.g == 68 && screen.b == 65, "colour", "envelope");
		check(screen.winX == 84 && screen.winY == 0, "window", "envelope");
		check(screen.scrolling, "scroll flag", "envelope");
		check(screen.direction == 0, "direction", "envelope");
		check(screen.speedPxPerSec == 60, "speed", "envelope");
		check(screen.pauseMs == 2000, "pause", "envelope");
		check(screen.compositeWidthPx == 148, "compositeWidthPx", "envelope");
		check(screen.brightness == 85, "brightness", "envelope");
	} else {
		printf("FAIL envelope: decode returned false\n");
		failures++;
	}
	pixelWallScreenFree(&screen);

	if (failures == 0) {
		printf("ok: %zu fixtures, both encodings\n", FIXTURE_COUNT);
		return 0;
	}
	printf("%d failure(s)\n", failures);
	return 1;
}
