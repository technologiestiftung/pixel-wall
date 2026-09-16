import { describe, expect, it } from "vitest";
import {
	clampChannel,
	hexToRgb,
	rgbToHex,
	type Rgb,
} from "../../../src/domain/color";
import { PALETTE } from "../../../src/domain/content";

describe("clampChannel", () => {
	it("holds values inside 0-255", () => {
		expect(clampChannel(128)).toBe(128);
		expect(clampChannel(-5)).toBe(0);
		expect(clampChannel(999)).toBe(255);
	});

	it("rounds fractional input", () => {
		expect(clampChannel(12.6)).toBe(13);
	});

	it("treats unparseable input as 0 rather than NaN", () => {
		expect(clampChannel(Number.NaN)).toBe(0);
		expect(clampChannel(Number.POSITIVE_INFINITY)).toBe(255);
	});
});

describe("hexToRgb", () => {
	it("parses six-digit hex", () => {
		expect(hexToRgb("#FE4441")).toEqual([254, 68, 65]);
	});

	it("expands three-digit hex", () => {
		expect(hexToRgb("#f08")).toEqual([255, 0, 136]);
	});

	it("tolerates a missing hash", () => {
		expect(hexToRgb("000000")).toEqual([0, 0, 0]);
	});

	it("reads a half-typed value as zeros rather than throwing", () => {
		expect(hexToRgb("#")).toEqual([0, 0, 0]);
		expect(hexToRgb("#12")).toEqual([18, 0, 0]);
	});
});

describe("rgbToHex", () => {
	it("pads single digits", () => {
		expect(rgbToHex([0, 8, 16])).toBe("#000810");
	});

	it("clamps out-of-range channels", () => {
		expect(rgbToHex([-1, 300, 128] as Rgb)).toBe("#00FF80");
	});
});

describe("round trip", () => {
	it("survives every palette preset", () => {
		for (const hex of PALETTE) {
			expect(rgbToHex(hexToRgb(hex))).toBe(hex.toUpperCase());
		}
	});

	it("survives arbitrary channel values", () => {
		const cases: Rgb[] = [
			[0, 0, 0],
			[255, 255, 255],
			[1, 2, 3],
			[254, 68, 65],
		];
		for (const rgb of cases) {
			expect(hexToRgb(rgbToHex(rgb))).toEqual(rgb);
		}
	});
});
