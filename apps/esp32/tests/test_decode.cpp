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
		/* A plain v1 envelope must leave the v2-only fields at their
		 * zero/false defaults, exactly as before this phase existed. */
		check(!screen.hasBackground, "no background on v1", "envelope");
		check(!screen.animating, "no animating on v1", "envelope");
	} else {
		printf("FAIL envelope: decode returned false\n");
		failures++;
	}
	pixelWallScreenFree(&screen);

	/* v2: a static background behind scrolling text. */
	pixelWallScreenInit(&screen);
	if (pixelWallDecodeFrame(&screen, ENVELOPE_SAMPLE_BACKGROUND, ENVELOPE_SAMPLE_BACKGROUND_LEN)) {
		check(screen.scrolling, "scroll flag", "envelope-background");
		check(screen.hasBackground, "background flag", "envelope-background");
		check(screen.bgR == 30 && screen.bgG == 55 && screen.bgB == 145,
		      "background colour", "envelope-background");
		check(!screen.animating, "no animating alongside background", "envelope-background");
	} else {
		printf("FAIL envelope-background: decode returned false\n");
		failures++;
	}
	pixelWallScreenFree(&screen);

	/* v2: an animated template's stepped frame strip. */
	pixelWallScreenInit(&screen);
	if (pixelWallDecodeFrame(&screen, ENVELOPE_SAMPLE_FRAMES, ENVELOPE_SAMPLE_FRAMES_LEN)) {
		check(screen.animating, "animating flag", "envelope-frames");
		check(screen.frameCount == 12, "frameCount", "envelope-frames");
		check(screen.frameDurationMs == 83, "frameDurationMs", "envelope-frames");
		check(screen.frameWidthPx == 8, "frameWidthPx", "envelope-frames");
		check(!screen.scrolling, "no scroll alongside frames", "envelope-frames");
		check(!screen.hasBackground, "no background on this sample", "envelope-frames");
	} else {
		printf("FAIL envelope-frames: decode returned false\n");
		failures++;
	}
	pixelWallScreenFree(&screen);

	/* v2: native Game of Life — no block, no window/scroll/background/frames,
	 * just the flag and brightness. */
	pixelWallScreenInit(&screen);
	if (pixelWallDecodeFrame(&screen, ENVELOPE_SAMPLE_GAMEOFLIFE, ENVELOPE_SAMPLE_GAMEOFLIFE_LEN)) {
		check(screen.nativeGameOfLife, "gameOfLife flag", "envelope-gameoflife");
		check(screen.brightness == 75, "brightness", "envelope-gameoflife");
		check(!screen.scrolling, "no scroll alongside gameOfLife", "envelope-gameoflife");
		check(!screen.hasBackground, "no background alongside gameOfLife", "envelope-gameoflife");
		check(!screen.animating, "no animating alongside gameOfLife", "envelope-gameoflife");
	} else {
		printf("FAIL envelope-gameoflife: decode returned false\n");
		failures++;
	}
	pixelWallScreenFree(&screen);

	/* A v2 decoder that has never heard of FLAG_GAMEOFLIFE must still reject
	 * a headerless gameOfLife payload safely (as an undersized block) rather
	 * than misinterpret it — this is what makes it safe to add the flag
	 * without a version bump (docs/wire-format.md "Game of Life"). Simulated
	 * here by decoding straight into pixelWallDecodeBlock, since an "old"
	 * decoder is exactly today's pixelWallDecodeFrame minus the flag check. */
	pixelWallScreenInit(&screen);
	check(!pixelWallDecodeBlock(&screen, ENVELOPE_SAMPLE_GAMEOFLIFE + ENVELOPE_HEADER_V2,
	                            ENVELOPE_SAMPLE_GAMEOFLIFE_LEN - ENVELOPE_HEADER_V2),
	      "a headerless gameOfLife payload is rejected as an undersized block",
	      "envelope-gameoflife-old-decoder");
	pixelWallScreenFree(&screen);

	/* A trailing block on a gameOfLife-flagged message is malformed — the
	 * encoder must never emit one, so a decoder should say so rather than
	 * silently ignore it. */
	pixelWallScreenInit(&screen);
	uint8_t gameOfLifeWithTrailingByte[ENVELOPE_HEADER_V2 + 1];
	memcpy(gameOfLifeWithTrailingByte, ENVELOPE_SAMPLE_GAMEOFLIFE, ENVELOPE_HEADER_V2);
	gameOfLifeWithTrailingByte[ENVELOPE_HEADER_V2] = 0x00;
	check(!pixelWallDecodeFrame(&screen, gameOfLifeWithTrailingByte, sizeof(gameOfLifeWithTrailingByte)),
	      "a gameOfLife frame with a trailing byte must be rejected", "malformed");
	pixelWallScreenFree(&screen);

	/* An unknown version must be rejected, same as an unknown magic. */
	pixelWallScreenInit(&screen);
	const uint8_t badEnvelopeVersion[] = {0x57, 0x03, 0x00, 0, 0, 0, 0, 0, 0, 0,
	                                      0,    0,    0,    0, 0, 0, 0, 0, 0, 0,
	                                      0,    0};
	check(!pixelWallDecodeFrame(&screen, badEnvelopeVersion, sizeof(badEnvelopeVersion)),
	      "unknown envelope version must be rejected", "malformed");
	pixelWallScreenFree(&screen);

	if (failures == 0) {
		printf("ok: %zu fixtures, both encodings\n", FIXTURE_COUNT);
		return 0;
	}
	printf("%d failure(s)\n", failures);
	return 1;
}
