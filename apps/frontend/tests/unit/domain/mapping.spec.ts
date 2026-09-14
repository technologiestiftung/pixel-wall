import { describe, expect, test } from "vitest";
import { DEFAULT_LAYOUT, MM_TO_PX, SCREEN_SPECS } from "../../../src/domain/layout";
import { computeDisplayComposite, validateSelection } from "../../../src/domain/mapping";

describe("validateSelection", () => {
	test("empty selection is valid", () => {
		expect(validateSelection(SCREEN_SPECS, DEFAULT_LAYOUT, [])).toEqual({ valid: true });
	});

	test("a single screen is always valid", () => {
		expect(validateSelection(SCREEN_SPECS, DEFAULT_LAYOUT, ["04"])).toEqual({ valid: true });
	});

	test("mixing small and large screens is invalid", () => {
		expect(validateSelection(SCREEN_SPECS, DEFAULT_LAYOUT, ["01", "04"])).toEqual({
			valid: false,
			reason: "mixed-kind",
		});
	});

	test("multiple small screens are always valid (never combined)", () => {
		expect(validateSelection(SCREEN_SPECS, DEFAULT_LAYOUT, ["01", "02", "03"])).toEqual({ valid: true });
	});

	test("adjacent large screens (04 + 07 in the default layout) are valid", () => {
		expect(validateSelection(SCREEN_SPECS, DEFAULT_LAYOUT, ["04", "07"])).toEqual({ valid: true });
	});

	test("non-contiguous large screens are invalid", () => {
		const specs = [
			{ id: "a", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
			{ id: "b", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
		];
		const positions = [
			{ screenId: "a", xMm: 0, yMm: 0 },
			{ screenId: "b", xMm: 800, yMm: 800 },
		];
		const result = validateSelection(specs, positions, ["a", "b"]);
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("not-contiguous");
	});

	test("a chain of adjacent large screens is valid even if not all pairwise-adjacent", () => {
		// synthetic layout: three large screens in a row, only neighbours touch
		const specs = [
			{ id: "a", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
			{ id: "b", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
			{ id: "c", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
		];
		const positions = [
			{ screenId: "a", xMm: 0, yMm: 0 },
			{ screenId: "b", xMm: 192, yMm: 0 },
			{ screenId: "c", xMm: 384, yMm: 0 },
		];
		expect(validateSelection(specs, positions, ["a", "c", "b"])).toEqual({ valid: true });
	});
});

describe("computeDisplayComposite", () => {
	const specs = [
		{ id: "a", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
		{ id: "b", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
	];

	test("large selection: composite spans the full bounding box, offsets are relative to it", () => {
		const positions = [
			{ screenId: "a", xMm: 0, yMm: 0 },
			{ screenId: "b", xMm: 200, yMm: 0 }, // 8mm real gap after the 192mm-wide screen "a"
		];
		const composite = computeDisplayComposite({ specs, positions }, { kind: "large", screenIds: ["a", "b"] }, 2);

		expect(composite.widthPx).toBeCloseTo(392 * 2);
		expect(composite.heightPx).toBeCloseTo(192 * 2);
		expect(composite.slots).toEqual([
			{ screenId: "a", offsetXPx: 0, offsetYPx: 0 },
			{ screenId: "b", offsetXPx: 400, offsetYPx: 0 },
		]);
	});

	test("small selection: every screen is an independent full-size copy at offset 0,0", () => {
		const smallSpecs = [
			{ id: "x", kind: "small" as const, pixelSize: 32, physicalSizeMm: 128 },
			{ id: "y", kind: "small" as const, pixelSize: 32, physicalSizeMm: 128 },
		];
		const positions = [
			{ screenId: "x", xMm: 0, yMm: 0 },
			{ screenId: "y", xMm: 500, yMm: 500 },
		];
		const composite = computeDisplayComposite(
			{ specs: smallSpecs, positions },
			{ kind: "small", screenIds: ["x", "y"] },
			2,
		);

		expect(composite.widthPx).toBe(256);
		expect(composite.heightPx).toBe(256);
		expect(composite.slots).toEqual([
			{ screenId: "x", offsetXPx: 0, offsetYPx: 0 },
			{ screenId: "y", offsetXPx: 0, offsetYPx: 0 },
		]);
	});

	test("uses the real default-layout geometry end to end", () => {
		const composite = computeDisplayComposite(
			{ specs: SCREEN_SPECS, positions: DEFAULT_LAYOUT },
			{ kind: "large", screenIds: ["04", "07"] },
			MM_TO_PX,
		);
		expect(composite.slots.map((s) => s.screenId)).toEqual(["04", "07"]);
		expect(composite.heightPx).toBeGreaterThan(192 * MM_TO_PX);
	});
});
