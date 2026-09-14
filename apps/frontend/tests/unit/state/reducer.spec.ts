import { describe, expect, test } from "vitest";
import { SCREEN_SPECS, DEFAULT_LAYOUT } from "../../../src/domain/layout";
import { initialWallState, wallReducer } from "../../../src/state/reducer";
import type { StateResponse } from "../../../src/api/types";

describe("wallReducer: hydrated", () => {
	test("converts server state into 'remote' applied entries, keyed by screen id", () => {
		const remote: StateResponse["screens"] = {
			"03": {
				geometry: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
				content: { bitmap: "data:image/png;base64,AAA" },
			},
		};

		const next = wallReducer(initialWallState, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
			remote,
		});

		expect(next.applied["03"]).toEqual({
			source: "remote",
			bitmap: "data:image/png;base64,AAA",
			offsetXPx: 0,
			offsetYPx: 0,
		});
		expect(next.syncStatus).toBe("ready");
	});

	test("an empty server state clears previously-applied screens", () => {
		const seeded = wallReducer(initialWallState, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
			remote: {
				"03": { geometry: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 }, content: { bitmap: "x" } },
			},
		});

		const next = wallReducer(seeded, { type: "hydrated", specs: SCREEN_SPECS, layout: DEFAULT_LAYOUT, remote: {} });

		expect(next.applied).toEqual({});
	});
});

describe("wallReducer: apply-success", () => {
	test("uses the selection/content captured at request time, not current state", () => {
		// Simulate the exact race this guards against: the selection has
		// already been cleared by the time apply-success is dispatched.
		const cleared = wallReducer(initialWallState, { type: "toggle-screen", screenId: "02" });
		const afterClear = wallReducer(cleared, { type: "clear-selection" });
		expect(afterClear.selection).toBeNull();

		const next = wallReducer(afterClear, {
			type: "apply-success",
			selection: { kind: "large", screenIds: ["02"] },
			content: { type: "color", hex: "#FE4441" },
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
		});

		expect(next.applied["02"]).toMatchObject({ source: "local", content: { type: "color", hex: "#FE4441" } });
	});
});
