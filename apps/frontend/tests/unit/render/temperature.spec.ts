import { describe, expect, test } from "vitest";
import { createMask } from "../../../src/domain/mask";
import type { TemperatureStyle } from "../../../src/domain/types";
import { DEFAULT_TEMPERATURE_STYLE } from "../../../src/domain/weather";
import {
	TEMPERATURE_GLYPHS,
	formatTemperature,
	layoutTemperature,
	type TemperatureGlyphs,
} from "../../../src/render/temperature";

/** 3px-wide, 5px-tall glyphs, so a layout is easy to work out by hand. */
const glyphs: TemperatureGlyphs = Object.fromEntries(
	[...TEMPERATURE_GLYPHS].map((char) => [char, createMask(3, 5)]),
);
const frame = { widthPx: 64, heightPx: 64 };

function layout(text: string, changes: Partial<TemperatureStyle>) {
	return layoutTemperature(
		{ text, glyphs, style: { ...DEFAULT_TEMPERATURE_STYLE, ...changes } },
		frame,
	);
}

describe("formatTemperature", () => {
	test("rounds half up, matching the backend's whole_degrees", () => {
		expect(formatTemperature(17.5)).toBe("18°");
		expect(formatTemperature(-2.5)).toBe("-2°");
		expect(formatTemperature(-0.4)).toBe("0°");
	});
});

describe("layoutTemperature", () => {
	test("bottom-centre ignores the horizontal padding, keeps the vertical one", () => {
		// "18°" is 9px wide: (64 - 9) / 2 = 27.5 rounds up, like the backend.
		expect(
			layout("18°", {
				hAlign: "center",
				vAlign: "bottom",
				paddingXPx: 5,
				paddingYPx: 2,
			}),
		).toEqual({
			x: 28,
			y: 64 - 5 - 2,
		});
	});

	test("top-right, inset by each axis's own padding", () => {
		expect(
			layout("-3°", {
				hAlign: "right",
				vAlign: "top",
				paddingXPx: 4,
				paddingYPx: 1,
			}),
		).toEqual({
			x: 64 - 9 - 4,
			y: 1,
		});
	});
});
