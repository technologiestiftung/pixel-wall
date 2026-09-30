import { describe, expect, test } from "vitest";
import { isSvgFile, loopDurationMs } from "../../../src/render/animatedSvg";

describe("loopDurationMs", () => {
	test("is the single duration when there is only one animation", () => {
		expect(loopDurationMs([1200], 8000)).toBe(1200);
	});

	test("is the least common multiple so every animation lines up at the seam", () => {
		expect(loopDurationMs([1000, 1500], 8000)).toBe(3000);
	});

	test("falls back to the longest duration when the multiple exceeds the cap", () => {
		expect(loopDurationMs([1300, 1700], 8000)).toBe(1700);
	});

	test("never exceeds the cap", () => {
		expect(loopDurationMs([12000], 8000)).toBe(8000);
	});

	test("is 0 when nothing has a usable duration", () => {
		expect(loopDurationMs([0, 0], 8000)).toBe(0);
		expect(loopDurationMs([], 8000)).toBe(0);
	});
});

describe("isSvgFile", () => {
	test("recognises SVGs by type or extension", () => {
		expect(isSvgFile(new File([""], "a.svg", { type: "image/svg+xml" }))).toBe(
			true,
		);
		expect(isSvgFile(new File([""], "Spinner.SVG", { type: "" }))).toBe(true);
		expect(isSvgFile(new File([""], "a.gif", { type: "image/gif" }))).toBe(
			false,
		);
	});
});
