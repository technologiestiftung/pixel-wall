import { describe, expect, it } from "vitest";
import {
	animationTiming,
	frameCountFor,
} from "../../../src/render/animatedTemplate";
import type { AnimationContent } from "../../../src/domain/types";

const base: AnimationContent = {
	type: "animation",
	mode: "template",
	templateId: "logo",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const upload = {
	name: "x.gif",
	sheetDataUrl: "data:image/png;base64,AAAA",
	frameWidthPx: 32,
	frameHeightPx: 32,
	columns: 2,
	frameDurationMs: 62.5,
};

describe("animationTiming", () => {
	it("is null for a static template", () => {
		expect(animationTiming(base)).toBeNull();
	});

	it("samples an animated template at ANIMATION_FPS", () => {
		expect(animationTiming({ ...base, templateId: "raute-animiert" })).toEqual({
			frameCount: 64,
			frameDurationMs: 62.5,
		});
	});

	it("uses an animated upload's own frames", () => {
		expect(
			animationTiming({
				...base,
				mode: "upload",
				upload: { ...upload, frameCount: 4 },
			}),
		).toEqual({ frameCount: 4, frameDurationMs: 62.5 });
	});

	it("treats a single-frame upload as a still image", () => {
		expect(
			animationTiming({
				...base,
				mode: "upload",
				upload: { ...upload, frameCount: 1 },
			}),
		).toBeNull();
	});

	it("is null for Game of Life", () => {
		expect(animationTiming({ ...base, mode: "gameOfLife" })).toBeNull();
	});
});

describe("frameCountFor", () => {
	it("samples at the given fps for a short loop", () => {
		expect(frameCountFor(4000, 16)).toBe(64);
	});

	it("never exceeds the wire format's 255-frame ceiling (docs/wire-format.md, backend FramesModel)", () => {
		// A loop long enough to want far more than 255 samples at 16fps — the
		// backend rejects frameCount above 255 with a 422 (this is what running
		// Pfadtext hit for a slow/long configuration before this clamp existed).
		expect(frameCountFor(60_000, 16)).toBe(255);
	});

	it("is always at least 1", () => {
		expect(frameCountFor(0, 16)).toBe(1);
	});
});
