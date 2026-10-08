import { describe, expect, test } from "vitest";
import {
	buildPathThroughPoints,
	DEFAULT_PFADTEXT_PATH_ID,
	PFADTEXT_PATHS,
	pfadtextPathOption,
} from "../../../src/domain/pfadtextPath";

describe("buildPathThroughPoints", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 10, y: 10 },
		{ x: 20, y: 0 },
		{ x: 30, y: 10 },
	];
	const path = buildPathThroughPoints(points);

	test("passes through the first point at distance 0", () => {
		const p = path.pointAt(0);
		expect(p.x).toBeCloseTo(points[0].x, 5);
		expect(p.y).toBeCloseTo(points[0].y, 5);
	});

	test("passes through the last point at the full length", () => {
		const p = path.pointAt(path.lengthPx);
		expect(p.x).toBeCloseTo(points[3].x, 1);
		expect(p.y).toBeCloseTo(points[3].y, 1);
	});

	test("the midpoint by arc length lies between the first and last point", () => {
		const p = path.pointAt(path.lengthPx / 2);
		expect(p.x).toBeGreaterThan(points[0].x);
		expect(p.x).toBeLessThan(points[3].x);
	});

	test("has a positive length", () => {
		expect(path.lengthPx).toBeGreaterThan(0);
	});

	test("extrapolates linearly before the start instead of clamping", () => {
		const start = path.pointAt(0);
		const before = path.pointAt(-10);
		// A point 10px "before" the start is a further 10px away from distance
		// 0 than the start itself is, along its own tangent — not equal to it.
		const dist = Math.hypot(before.x - start.x, before.y - start.y);
		expect(dist).toBeCloseTo(10, 1);
	});

	test("extrapolates linearly past the end instead of clamping", () => {
		const end = path.pointAt(path.lengthPx);
		const after = path.pointAt(path.lengthPx + 10);
		const dist = Math.hypot(after.x - end.x, after.y - end.y);
		expect(dist).toBeCloseTo(10, 1);
	});

	test("rejects fewer than 2 points", () => {
		expect(() => buildPathThroughPoints([{ x: 0, y: 0 }])).toThrow();
	});
});

describe("PFADTEXT_PATHS", () => {
	test("has exactly 4 named paths, each with a unique id", () => {
		expect(PFADTEXT_PATHS).toHaveLength(4);
		expect(new Set(PFADTEXT_PATHS.map((o) => o.id)).size).toBe(4);
	});

	test("every path is a fixed, positive-length path with a deterministic pointAt", () => {
		for (const option of PFADTEXT_PATHS) {
			expect(option.path.lengthPx).toBeGreaterThan(0);
			expect(option.path.pointAt(10)).toEqual(option.path.pointAt(10));
		}
	});

	test("every path's off-canvas margin is positive and smaller than the path itself", () => {
		// A sanity bound, not an exact value: this is derived from the real
		// wall layout (domain/layout.ts's DEFAULT_LAYOUT) via a ray/box exit
		// distance (see offCanvasMarginPx), so it must stay well under the
		// path's own length — a value anywhere near or above it would mean the
		// exit-distance calculation regressed back to overshooting (see the
		// Math.max/Math.min bug this guards against).
		for (const option of PFADTEXT_PATHS) {
			expect(option.offCanvasMarginPx).toBeGreaterThan(0);
			expect(option.offCanvasMarginPx).toBeLessThan(option.path.lengthPx);
		}
	});
});

describe("the 'welle' path", () => {
	const option = PFADTEXT_PATHS.find((o) => o.id === "welle");

	test("starts and ends exactly at a screen centre, in its own named order (06 then 05)", () => {
		expect(option).toBeDefined();
		if (!option) {
			return;
		}
		const start = option.path.pointAt(0);
		const end = option.path.pointAt(option.path.lengthPx);
		expect(start.x).toBeCloseTo(32, 1); // 06
		expect(start.y).toBeCloseTo(74.33333333333333, 1);
		expect(end.x).toBeCloseTo(167, 1); // 05
		expect(end.y).toBeCloseTo(57, 1);
	});

	test("passes near both 07 and 04 along the way, visiting 07 before 04", () => {
		// The point of a *named* order (as opposed to a derived one like
		// perimeterOrder/nearestNeighborOrder) is that it visits screens in a
		// specific sequence — 06, 07, 04, 05 — rather than whatever a general
		// strategy would pick. This checks that sequence actually holds by
		// finding each screen's closest approach along the curve.
		expect(option).toBeDefined();
		if (!option) {
			return;
		}
		const { path } = option;
		const sampleCount = 200;
		const distances = Array.from({ length: sampleCount + 1 }, (_, i) => {
			const d = (path.lengthPx * i) / sampleCount;
			return { d, point: path.pointAt(d) };
		});
		function closestApproachD(target: { x: number; y: number }): number {
			return distances.reduce((best, s) =>
				Math.hypot(s.point.x - target.x, s.point.y - target.y) <
				Math.hypot(best.point.x - target.x, best.point.y - target.y)
					? s
					: best,
			).d;
		}
		const d07 = closestApproachD({ x: 99.33333333333333, y: 32 });
		const d04 = closestApproachD({ x: 99.66666666666667, y: 99.33333333333333 });
		expect(d07).toBeLessThan(d04);
	});
});

describe("pfadtextPathOption", () => {
	test("resolves a known id to its path", () => {
		const diagonal = PFADTEXT_PATHS.find((o) => o.id === "diagonal");
		expect(pfadtextPathOption("diagonal")).toBe(diagonal);
	});

	test("falls back to the default path for undefined (older saved content)", () => {
		expect(pfadtextPathOption(undefined).id).toBe(DEFAULT_PFADTEXT_PATH_ID);
	});

	test("falls back to the default path for an unrecognised id", () => {
		expect(pfadtextPathOption("not-a-real-path").id).toBe(DEFAULT_PFADTEXT_PATH_ID);
	});
});
