import { describe, expect, test } from "vitest";
import { isMovingAnimation } from "../../../src/domain/content";
import type { AnimationContent } from "../../../src/domain/types";

const base: AnimationContent = {
	type: "animation",
	mode: "template",
	templateId: "logo",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const upload = (frameCount: number) => ({
	name: "a.gif",
	sheetDataUrl: "data:image/png;base64,",
	frameWidthPx: 32,
	frameHeightPx: 32,
	frameCount,
	columns: 1,
	frameDurationMs: 62.5,
});

describe("isMovingAnimation", () => {
	test("is false for a still template and true for an animated one", () => {
		expect(isMovingAnimation(base)).toBe(false);
		expect(
			isMovingAnimation({ ...base, templateId: "pfeil-rund-animiert" }),
		).toBe(true);
	});

	test("depends on an upload's frame count", () => {
		expect(
			isMovingAnimation({ ...base, mode: "upload", upload: upload(1) }),
		).toBe(false);
		expect(
			isMovingAnimation({ ...base, mode: "upload", upload: upload(12) }),
		).toBe(true);
	});

	test("counts Game of Life as moving", () => {
		expect(isMovingAnimation({ ...base, mode: "gameOfLife" })).toBe(true);
	});
});
