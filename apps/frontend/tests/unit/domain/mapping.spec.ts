import { describe, expect, test } from "vitest";
import {
	DEFAULT_LAYOUT,
	MM_TO_PX,
	SCREEN_SPECS,
} from "../../../src/domain/layout";
import {
	computeDisplayComposite,
	layersForGroup,
	referenceScreenId,
	selectionGroups,
	selectionKindOf,
} from "../../../src/domain/mapping";

describe("selectionKindOf", () => {
	test("is the shared kind for a single-kind selection", () => {
		expect(selectionKindOf(SCREEN_SPECS, ["04", "06"])).toBe("large");
		expect(selectionKindOf(SCREEN_SPECS, ["01", "02"])).toBe("small");
	});

	test("is mixed when small and large screens are selected together", () => {
		expect(selectionKindOf(SCREEN_SPECS, ["01", "04"])).toBe("mixed");
	});
});

describe("selectionGroups", () => {
	test("keeps a single-kind selection as one group", () => {
		expect(selectionGroups(SCREEN_SPECS, { screenIds: ["05", "06"] })).toEqual([
			{ kind: "large", screenIds: ["05", "06"] },
		]);
	});

	test("splits a mixed selection into one group per kind", () => {
		expect(
			selectionGroups(SCREEN_SPECS, { screenIds: ["04", "01", "06", "03"] }),
		).toEqual([
			{
				kind: "large",
				screenIds: ["04", "06"],
				canvasScreenIds: ["04", "01", "06", "03"],
			},
			{
				kind: "small",
				screenIds: ["01", "03"],
				canvasScreenIds: ["04", "01", "06", "03"],
			},
		]);
	});
});

describe("referenceScreenId", () => {
	test("is the first screen of a single-kind selection", () => {
		expect(
			referenceScreenId(SCREEN_SPECS, {
				kind: "small",
				screenIds: ["02", "01"],
			}),
		).toBe("02");
	});

	test("is a large screen in a mixed selection", () => {
		expect(
			referenceScreenId(SCREEN_SPECS, {
				kind: "mixed",
				screenIds: ["01", "06", "04"],
			}),
		).toBe("06");
	});
});

describe("layersForGroup", () => {
	const layers = {
		background: "#000000",
		foreground: {
			type: "text" as const,
			mode: "scrolling" as const,
			value: "Hallo",
			fontSizePx: 16,
			fontFamily: "sans-serif",
			fontWeight: "400",
			color: "#FFFFFF",
			speedPxPerSec: 60,
			hAlign: "center" as const,
			vAlign: "center" as const,
			paddingPx: 4,
		},
	};

	test("leaves single-kind groups untouched", () => {
		expect(layersForGroup(layers, { kind: "small", screenIds: ["01"] })).toBe(
			layers,
		);
	});

	describe("across a mixed selection", () => {
		const animationOf = (templateId: string) => ({
			background: "#FE4441",
			foreground: {
				type: "animation" as const,
				mode: "template" as const,
				templateId,
				scalePercent: 100,
				hAlign: "center" as const,
				vAlign: "center" as const,
			},
		});
		const mixedGroups = [
			{
				kind: "large" as const,
				screenIds: ["04"],
				canvasScreenIds: ["01", "04"],
			},
			{
				kind: "small" as const,
				screenIds: ["01"],
				canvasScreenIds: ["01", "04"],
			},
		];

		test("drops a moving animation, keeping the background", () => {
			for (const group of mixedGroups) {
				expect(
					layersForGroup(animationOf("pfeil-rund-animiert"), group),
				).toEqual({ background: "#FE4441", foreground: null });
			}
		});

		test("keeps a still image", () => {
			const still = animationOf("logo");
			for (const group of mixedGroups) {
				expect(layersForGroup(still, group)).toBe(still);
			}
		});

		test("leaves single-kind selections' animations alone", () => {
			const moving = animationOf("pfeil-rund-animiert");
			expect(layersForGroup(moving, { kind: "large", screenIds: ["04"] })).toBe(
				moving,
			);
		});
	});

	describe("path-mode text (Pfadtext)", () => {
		const pathTextOf = () => ({
			background: "#000000",
			foreground: {
				type: "text" as const,
				mode: "path" as const,
				pathRunning: false,
				pathPosition: "middle" as const,
				value: "Hallo",
				fontSizePx: 16,
				fontFamily: "sans-serif",
				fontWeight: "400",
				color: "#FFFFFF",
				hAlign: "center" as const,
				vAlign: "center" as const,
			},
		});

		test("drops Pfadtext when the selection is fewer than all 4 large screens", () => {
			const layers = pathTextOf();
			expect(
				layersForGroup(layers, {
					kind: "large",
					screenIds: ["04", "05", "06"],
				}),
			).toEqual({ background: "#000000", foreground: null });
		});

		test("drops Pfadtext across a mixed canvas", () => {
			const layers = pathTextOf();
			expect(
				layersForGroup(layers, {
					kind: "large",
					screenIds: ["04", "05", "06", "07"],
					canvasScreenIds: ["04", "05", "06", "07", "01"],
				}),
			).toEqual({ background: "#000000", foreground: null });
		});

		test("keeps Pfadtext for exactly the 4 large screens, in any order", () => {
			const layers = pathTextOf();
			expect(
				layersForGroup(layers, {
					kind: "large",
					screenIds: ["07", "04", "06", "05"],
				}),
			).toBe(layers);
		});
	});

	test("rescales text to the small pitch within a mixed canvas", () => {
		const scaled = layersForGroup(layers, {
			kind: "small",
			screenIds: ["01"],
			canvasScreenIds: ["01", "04"],
		});
		expect(scaled.foreground).toMatchObject({
			fontSizePx: 12,
			paddingPx: 3,
			speedPxPerSec: 45,
		});
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
		const composite = computeDisplayComposite(
			{ specs, positions },
			{ kind: "large", screenIds: ["a", "b"] },
			2,
		);

		expect(composite.widthPx).toBeCloseTo(392 * 2);
		expect(composite.heightPx).toBeCloseTo(192 * 2);
		expect(composite.slots).toEqual([
			{ screenId: "a", offsetXPx: 0, offsetYPx: 0 },
			{ screenId: "b", offsetXPx: 400, offsetYPx: 0 },
		]);
	});

	test("small selection: screens are windows into one shared canvas", () => {
		const smallSpecs = [
			{ id: "x", kind: "small" as const, pixelSize: 32, physicalSizeMm: 128 },
			{ id: "y", kind: "small" as const, pixelSize: 32, physicalSizeMm: 128 },
		];
		const positions = [
			{ screenId: "x", xMm: 0, yMm: 0 },
			{ screenId: "y", xMm: 500, yMm: 100 },
		];
		const composite = computeDisplayComposite(
			{ specs: smallSpecs, positions },
			{ kind: "small", screenIds: ["x", "y"] },
			2,
		);

		expect(composite.widthPx).toBe(628 * 2);
		expect(composite.heightPx).toBe(228 * 2);
		expect(composite.slots).toEqual([
			{ screenId: "x", offsetXPx: 0, offsetYPx: 0 },
			{ screenId: "y", offsetXPx: 1000, offsetYPx: 200 },
		]);
	});

	test("mixed selection: small screens are windows into the shared canvas", () => {
		const mixedSpecs = [
			{ id: "a", kind: "large" as const, pixelSize: 64, physicalSizeMm: 192 },
			{ id: "s", kind: "small" as const, pixelSize: 32, physicalSizeMm: 128 },
		];
		const positions = [
			{ screenId: "a", xMm: 0, yMm: 0 },
			{ screenId: "s", xMm: 200, yMm: 40 },
		];
		const composite = computeDisplayComposite(
			{ specs: mixedSpecs, positions },
			{ kind: "small", screenIds: ["s"], canvasScreenIds: ["a", "s"] },
			1 / 4,
		);

		expect(composite.widthPx).toBeCloseTo(328 / 4);
		expect(composite.heightPx).toBeCloseTo(192 / 4);
		expect(composite.slots).toEqual([
			{ screenId: "s", offsetXPx: 50, offsetYPx: 10 },
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
