import { describe, expect, test } from "vitest";
import { marqueeOffsetPx } from "../../../src/domain/scroll";

const base = {
	compositeWidthPx: 100,
	textWidthPx: 50,
	speedPxPerSec: 100, // travelPx=150 → durationMs=1500
	pauseMs: 500,
	direction: "left" as const,
};

describe("marqueeOffsetPx", () => {
	test("starts fully hidden past the right edge for a left-moving marquee", () => {
		expect(marqueeOffsetPx(0, base)).toBe(100);
	});

	test("is fully hidden past the left edge exactly at the end of the travel duration", () => {
		expect(marqueeOffsetPx(1500, base)).toBeCloseTo(-50);
	});

	test("holds at the end position during the pause", () => {
		expect(marqueeOffsetPx(1500 + 250, base)).toBeCloseTo(-50);
		expect(marqueeOffsetPx(1500 + 499, base)).toBeCloseTo(-50);
	});

	test("loops back to the start after the pause", () => {
		expect(marqueeOffsetPx(2000, base)).toBe(100);
	});

	test("moves in the opposite direction when direction is 'right'", () => {
		const rightward = { ...base, direction: "right" as const };
		expect(marqueeOffsetPx(0, rightward)).toBe(-50);
		expect(marqueeOffsetPx(1500, rightward)).toBeCloseTo(100);
	});

	test("halfway through travel is halfway between start and end", () => {
		expect(marqueeOffsetPx(750, base)).toBeCloseTo(25);
	});
});
