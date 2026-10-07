// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { pfadtextPathOption } from "../../../src/domain/pfadtextPath";
import { pathTextTiming } from "../../../src/render/pathText";
import type { TextContent } from "../../../src/domain/types";

const base: TextContent = {
	type: "text",
	mode: "path",
	value: "Hallo CityLAB",
	fontSizePx: 16,
	fontFamily: "monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	hAlign: "center",
	vAlign: "center",
	speedPxPerSec: 40,
	pauseMs: 2000,
};

// `base` doesn't set pathId, so pathText.ts resolves it to the default path —
// match that here rather than hardcoding which one that is.
const { path: defaultPath, offCanvasMarginPx: defaultMarginPx } = pfadtextPathOption(
	base.pathId,
);

describe("pathTextTiming", () => {
	test("is null for static Pfadtext", () => {
		expect(pathTextTiming({ ...base, pathRunning: false })).toBeNull();
	});

	test("is null when mode isn't path", () => {
		expect(
			pathTextTiming({ ...base, mode: "static", pathRunning: true }),
		).toBeNull();
	});

	test("is null for empty text", () => {
		expect(
			pathTextTiming({ ...base, pathRunning: true, value: "   " }),
		).toBeNull();
	});

	test("reproduces the expected loop length for running Pfadtext", () => {
		const timing = pathTextTiming({ ...base, pathRunning: true });
		expect(timing).not.toBeNull();
		if (!timing) {
			return;
		}
		// textWidthPx falls back to a fixed estimate without a real canvas
		// context (jsdom without the optional `canvas` package) — see
		// render/text.ts's measureTextWidthPx — so this only checks the loop
		// reproduces *some* positive travel + the configured pause, without
		// hardcoding PFADTEXT_PATH.lengthPx's exact pixel value.
		const loopMs = timing.frameCount * timing.frameDurationMs;
		expect(loopMs).toBeGreaterThan(base.pauseMs as number);
		const travelMs = loopMs - (base.pauseMs as number);
		const travelPx = (travelMs / 1000) * (base.speedPxPerSec as number);
		expect(travelPx).toBeGreaterThan(defaultPath.lengthPx);
	});

	test("pads both ends of the loop with the off-canvas margin, not just one", () => {
		// marqueeOffsetPx's two hold positions are `compositeWidthPx` and
		// `-textWidthPx` — whichever one the path's own lengthPx itself maps to
		// (depending on `direction`) must also carry the margin, or that one
		// hold position sits exactly at the path's unbuffered end, still
		// visibly on a screen there (see render/pathText.ts's
		// effectiveCompositeWidthPx). Checking both directions' travel catches
		// a regression that pads only the `textWidthPx` side back.
		for (const direction of ["left", "right"] as const) {
			const timing = pathTextTiming({ ...base, pathRunning: true, direction });
			expect(timing).not.toBeNull();
			if (!timing) {
				continue;
			}
			const loopMs = timing.frameCount * timing.frameDurationMs;
			const travelMs = loopMs - (base.pauseMs as number);
			const travelPx = (travelMs / 1000) * (base.speedPxPerSec as number);
			// Both ends padded means travel is at least the path length plus
			// *two* margins (padding only one end would only ever clear one).
			expect(travelPx).toBeGreaterThanOrEqual(defaultPath.lengthPx + 2 * defaultMarginPx);
		}
	});

	test("never exceeds the wire format's 1-255 frameCount ceiling, even for a long slow loop", () => {
		// A long travel at a slow speed easily asks for more than 255 samples at
		// ANIMATION_FPS — the backend's FramesModel rejects anything past 255
		// with a 422 (this reproduces a real one: a wide, default-speed text on
		// the actual wall). frameCountFor's clamp (render/animatedTemplate.ts)
		// must keep this under the ceiling by sampling more coarsely, not by
		// shortening the loop itself.
		const longSlow = pathTextTiming({
			...base,
			pathRunning: true,
			value: "Heute Maptime 19 Uhr",
			fontSizePx: 30,
			speedPxPerSec: 10,
		});
		expect(longSlow).not.toBeNull();
		if (!longSlow) {
			return;
		}
		expect(longSlow.frameCount).toBeLessThanOrEqual(255);
		// The clamp must not silently shorten the loop — only sample it coarser:
		// its real travel+pause duration (well over 25.5s here) must still be
		// reflected in a correspondingly longer frameDurationMs.
		const loopMs = longSlow.frameCount * longSlow.frameDurationMs;
		expect(loopMs).toBeGreaterThan(25_500);
	});

	test("different pathId values use their own path geometry", () => {
		// Each PFADTEXT_PATHS entry has its own lengthPx/margin, so the same
		// text/speed/pause must produce different timings per path — otherwise
		// pathTextTiming would be silently ignoring content.pathId.
		const timings = ["rund", "diagonal", "schwung"].map(
			(pathId) => pathTextTiming({ ...base, pathRunning: true, pathId })?.frameCount,
		);
		expect(new Set(timings).size).toBeGreaterThan(1);
	});

	test("a faster speed produces a shorter loop", () => {
		const slow = pathTextTiming({ ...base, pathRunning: true, speedPxPerSec: 20 });
		const fast = pathTextTiming({ ...base, pathRunning: true, speedPxPerSec: 200 });
		expect(slow).not.toBeNull();
		expect(fast).not.toBeNull();
		if (!slow || !fast) {
			return;
		}
		expect(fast.frameCount * fast.frameDurationMs).toBeLessThan(
			slow.frameCount * slow.frameDurationMs,
		);
	});
});
