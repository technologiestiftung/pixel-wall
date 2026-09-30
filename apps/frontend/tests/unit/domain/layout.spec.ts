import { describe, expect, test } from "vitest";
import {
	displayScaleForKind,
	MM_TO_PX,
	pitchMmPerPx,
	rectsOverlap,
	wouldOverlapAny,
} from "../../../src/domain/layout";
import type { ScreenSpec } from "../../../src/domain/types";

const large: ScreenSpec = {
	id: "02",
	kind: "large",
	pixelSize: 64,
	physicalSizeMm: 192,
};
const small: ScreenSpec = {
	id: "01",
	kind: "small",
	pixelSize: 32,
	physicalSizeMm: 128,
};

describe("pitchMmPerPx", () => {
	test("large screens are 3mm per pixel", () => {
		expect(pitchMmPerPx(large)).toBe(3);
	});

	test("small screens are 4mm per pixel", () => {
		expect(pitchMmPerPx(small)).toBe(4);
	});
});

describe("displayScaleForKind", () => {
	test("scaling a screen's own device-px size by it reproduces the screen's display size", () => {
		// A device-px quantity (e.g. a chosen font size) scaled up by this
		// factor must land in the same space as MM_TO_PX-based display
		// geometry — verified end to end via each screen kind's own numbers.
		expect(
			small.pixelSize * displayScaleForKind("small", MM_TO_PX),
		).toBeCloseTo(small.physicalSizeMm * MM_TO_PX);
		expect(
			large.pixelSize * displayScaleForKind("large", MM_TO_PX),
		).toBeCloseTo(large.physicalSizeMm * MM_TO_PX);
	});
});

describe("rectsOverlap", () => {
	test("touching rects do not overlap", () => {
		const a = { xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 };
		const b = { xMm: 100, yMm: 0, widthMm: 100, heightMm: 100 };
		expect(rectsOverlap(a, b)).toBe(false);
	});

	test("intersecting rects overlap", () => {
		const a = { xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 };
		const b = { xMm: 50, yMm: 50, widthMm: 100, heightMm: 100 };
		expect(rectsOverlap(a, b)).toBe(true);
	});
});

describe("wouldOverlapAny", () => {
	const specs = [
		{ id: "a", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
		{ id: "b", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
	];
	const positions = [
		{ screenId: "a", xMm: 0, yMm: 0 },
		{ screenId: "b", xMm: 300, yMm: 0 },
	];

	test("true when the candidate position would overlap another screen", () => {
		expect(
			wouldOverlapAny({ specs, positions }, "b", { xMm: 100, yMm: 0 }),
		).toBe(true);
	});

	test("false when the candidate position is clear", () => {
		expect(
			wouldOverlapAny({ specs, positions }, "b", { xMm: 500, yMm: 500 }),
		).toBe(false);
	});

	test("a screen never overlaps against its own current position", () => {
		expect(wouldOverlapAny({ specs, positions }, "a", { xMm: 0, yMm: 0 })).toBe(
			false,
		);
	});
});
