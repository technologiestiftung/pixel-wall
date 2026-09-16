// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { SCREEN_SPECS, DEFAULT_LAYOUT } from "../../../src/domain/layout";
import { initialWallState, wallReducer } from "../../../src/state/reducer";
import type { StateResponse, WireContentDto } from "../../../src/api/types";
import { createMask, encodeMaskBase64, setBit } from "../../../src/domain/mask";

function wireContent(): WireContentDto {
	const mask = createMask(32, 32);
	setBit(mask, 1, 1);
	return {
		format: "mask1",
		widthPx: 32,
		heightPx: 32,
		color: [255, 0, 128],
		data: encodeMaskBase64(mask),
	};
}

describe("wallReducer: hydrated", () => {
	test("converts server state into 'remote' applied entries, keyed by screen id", () => {
		const remote: StateResponse["screens"] = {
			"03": {
				window: { offsetXPx: 4, offsetYPx: 2, widthPx: 32, heightPx: 32 },
				content: wireContent(),
			},
		};

		const next = wallReducer(initialWallState, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
			remote,
			brightness: { small: 40, large: 80 },
		});

		const applied = next.applied["03"];
		expect(applied?.source).toBe("remote");
		expect(applied).toMatchObject({ offsetXPx: 4, offsetYPx: 2 });
		expect(next.brightness).toEqual({ small: 40, large: 80 });
		expect(next.syncStatus).toBe("ready");
	});

	test("an empty server state clears previously-applied screens", () => {
		const seeded = wallReducer(initialWallState, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
			remote: {
				"03": {
					window: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
					content: wireContent(),
				},
			},
			brightness: { small: 60, large: 60 },
		});

		const next = wallReducer(seeded, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
			remote: {},
			brightness: { small: 60, large: 60 },
		});

		expect(next.applied).toEqual({});
	});
});

describe("wallReducer: apply-success", () => {
	test("uses the selection/content captured at request time, not current state", () => {
		// Simulate the exact race this guards against: the selection has
		// already been cleared by the time apply-success is dispatched.
		const cleared = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "02",
			additive: false,
		});
		const afterClear = wallReducer(cleared, { type: "clear-selection" });
		expect(afterClear.selection).toBeNull();

		const next = wallReducer(afterClear, {
			type: "apply-success",
			selection: { kind: "large", screenIds: ["02"] },
			content: { type: "color", hex: "#FE4441" },
			specs: SCREEN_SPECS,
			layout: DEFAULT_LAYOUT,
		});

		expect(next.applied["02"]).toMatchObject({
			source: "local",
			content: { type: "color", hex: "#FE4441" },
		});
	});
});

describe("wallReducer: toggle-screen", () => {
	test("a plain click always replaces the selection with just that screen", () => {
		const withFour = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "04",
			additive: false,
		});
		expect(withFour.selection).toEqual({ kind: "large", screenIds: ["04"] });

		// Plain-clicking a different screen replaces, it doesn't extend —
		// even though 04+07 are a valid adjacent pair.
		const withSeven = wallReducer(withFour, {
			type: "toggle-screen",
			screenId: "07",
			additive: false,
		});
		expect(withSeven.selection).toEqual({ kind: "large", screenIds: ["07"] });
	});

	test("shift+click adds an adjacent same-kind screen to the selection", () => {
		const withFour = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "04",
			additive: false,
		});
		const withBoth = wallReducer(withFour, {
			type: "toggle-screen",
			screenId: "07",
			additive: true,
		});
		expect(withBoth.selection?.screenIds.sort()).toEqual(["04", "07"]);
	});

	test("shift+click on an already-selected screen removes it", () => {
		const withFour = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "04",
			additive: false,
		});
		const withBoth = wallReducer(withFour, {
			type: "toggle-screen",
			screenId: "07",
			additive: true,
		});
		const backToOne = wallReducer(withBoth, {
			type: "toggle-screen",
			screenId: "07",
			additive: true,
		});
		expect(backToOne.selection).toEqual({ kind: "large", screenIds: ["04"] });
	});

	test("shift+click that would mix kinds or break contiguity is a no-op", () => {
		const withSmall = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "01",
			additive: false,
		});
		const attempted = wallReducer(withSmall, {
			type: "toggle-screen",
			screenId: "04",
			additive: true,
		});
		expect(attempted.selection).toEqual({ kind: "small", screenIds: ["01"] });
	});

	test("any click clears the in-progress draft", () => {
		const withFour = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "04",
			additive: false,
		});
		const withDraft = wallReducer(withFour, {
			type: "set-draft-content",
			content: { type: "color", hex: "#FE4441" },
		});
		expect(withDraft.draft).not.toBeNull();

		const afterShiftClick = wallReducer(withDraft, {
			type: "toggle-screen",
			screenId: "07",
			additive: true,
		});
		expect(afterShiftClick.draft).toBeNull();
	});
});

describe("wallReducer: discard-draft", () => {
	test("clears the draft without touching the selection", () => {
		const withFour = wallReducer(initialWallState, {
			type: "toggle-screen",
			screenId: "04",
			additive: false,
		});
		const withDraft = wallReducer(withFour, {
			type: "set-draft-content",
			content: { type: "color", hex: "#FE4441" },
		});

		const next = wallReducer(withDraft, { type: "discard-draft" });
		expect(next.draft).toBeNull();
		expect(next.selection).toEqual({ kind: "large", screenIds: ["04"] });
	});
});
