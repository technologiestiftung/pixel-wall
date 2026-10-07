import { describe, expect, test } from "vitest";
import {
	SMALL_SCREEN_MAX_ANIMATION_LOOP_MS,
	TEMPLATES,
	isMovingAnimation,
	templatesFor,
} from "../../../src/domain/content";
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

describe("templatesFor", () => {
	test("large screens get every template, still and animated", () => {
		expect(templatesFor("large")).toEqual(TEMPLATES);
	});

	test("a mixed selection drops every animated template", () => {
		const templates = templatesFor("mixed");
		expect(templates.length).toBeGreaterThan(0);
		expect(templates.every((template) => !template.animated)).toBe(true);
	});

	test("a small-only selection drops animated templates longer than the loop cap, but keeps still ones and short animations", () => {
		const templates = templatesFor("small");
		const stillTemplates = TEMPLATES.filter((template) => !template.animated);
		const longAnimated = TEMPLATES.filter(
			(template) =>
				template.animated &&
				(template.loopMs ?? 0) > SMALL_SCREEN_MAX_ANIMATION_LOOP_MS,
		);
		const shortAnimated = TEMPLATES.filter(
			(template) =>
				template.animated &&
				(template.loopMs ?? 0) <= SMALL_SCREEN_MAX_ANIMATION_LOOP_MS,
		);

		expect(longAnimated.length).toBeGreaterThan(0);
		expect(shortAnimated.length).toBeGreaterThan(0);
		for (const template of stillTemplates) {
			expect(templates).toContain(template);
		}
		for (const template of shortAnimated) {
			expect(templates).toContain(template);
		}
		for (const template of longAnimated) {
			expect(templates).not.toContain(template);
		}
	});
});
