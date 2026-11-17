import { describe, expect, test } from "vitest";
import {
	displayScaleForKind,
	isAllLargeScreensSelection,
	MM_TO_PX,
	pitchMmPerPx,
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

describe("isAllLargeScreensSelection", () => {
	test("is true for the 4 large ids in any order", () => {
		expect(isAllLargeScreensSelection(["04", "05", "06", "07"])).toBe(true);
		expect(isAllLargeScreensSelection(["07", "04", "06", "05"])).toBe(true);
	});

	test("is false for a subset", () => {
		expect(isAllLargeScreensSelection(["04", "05", "06"])).toBe(false);
	});

	test("is false for the 4 large ids plus a small screen", () => {
		expect(isAllLargeScreensSelection(["04", "05", "06", "07", "01"])).toBe(
			false,
		);
	});

	test("is false for a small-only selection", () => {
		expect(isAllLargeScreensSelection(["01", "02", "03"])).toBe(false);
	});

	test("is false for an empty selection", () => {
		expect(isAllLargeScreensSelection([])).toBe(false);
	});
});
