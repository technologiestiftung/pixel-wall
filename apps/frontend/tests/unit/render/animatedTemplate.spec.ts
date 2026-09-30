import { describe, expect, it } from "vitest";
import { animationTiming } from "../../../src/render/animatedTemplate";
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
