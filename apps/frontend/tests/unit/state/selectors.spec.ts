import { describe, expect, test } from "vitest";
import { draftHasChanges } from "../../../src/state/selectors";
import { initialWallState } from "../../../src/state/reducer";
import type { AppliedRender, WallState } from "../../../src/state/reducer";

const colorA = { type: "color" as const, hex: "#FE4441" };
const colorB = { type: "color" as const, hex: "#B4B9FF" };
const text = {
	type: "text" as const,
	mode: "static" as const,
	value: "HI",
	fontSizePx: 16,
	fontFamily: "monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	hAlign: "center" as const,
	vAlign: "center" as const,
};

function stateWith(overrides: Partial<WallState>): WallState {
	return { ...initialWallState, ...overrides };
}

/** A screen showing these layers, at a single-screen composite. */
function showing(layers: Partial<AppliedRender["layers"]>): AppliedRender {
	return {
		layers: { background: null, foreground: null, ...layers },
		compositeWidthPx: 64,
		compositeHeightPx: 64,
		offsetXPx: 0,
		offsetYPx: 0,
		bitmap: null,
	};
}

describe("draftHasChanges", () => {
	test("false with no selection or no draft", () => {
		expect(draftHasChanges(stateWith({}))).toBe(false);
		expect(
			draftHasChanges(
				stateWith({ selection: { kind: "large", screenIds: ["04"] } }),
			),
		).toBe(false);
	});

	test("true for a freshly-selected screen with no applied baseline yet", () => {
		const state = stateWith({
			selection: { kind: "large", screenIds: ["04"] },
			draft: colorA,
		});
		expect(draftHasChanges(state)).toBe(true);
	});

	test("false once the draft matches what's already applied to every selected screen", () => {
		const state = stateWith({
			selection: { kind: "large", screenIds: ["04"] },
			draft: colorA,
			applied: {
				"04": showing({ background: colorA.hex }),
			},
		});
		expect(draftHasChanges(state)).toBe(false);
	});

	test("true once the draft diverges again from the applied baseline", () => {
		const state = stateWith({
			selection: { kind: "large", screenIds: ["04"] },
			draft: colorB,
			applied: {
				"04": showing({ background: colorA.hex }),
			},
		});
		expect(draftHasChanges(state)).toBe(true);
	});

	test("true when a selected screen's baseline is a remote bitmap (can't prove no change)", () => {
		const state = stateWith({
			selection: { kind: "large", screenIds: ["04"] },
			draft: colorA,
			applied: {
				"04": {
					...showing({}),
					bitmap: "data:image/png;base64,x",
				},
			},
		});
		expect(draftHasChanges(state)).toBe(true);
	});

	test("true when selected screens don't already agree with each other", () => {
		const state = stateWith({
			selection: { kind: "large", screenIds: ["04", "07"] },
			draft: colorA,
			applied: {
				"04": showing({ background: colorA.hex }),
				"07": showing({ background: colorB.hex }),
			},
		});
		expect(draftHasChanges(state)).toBe(true);
	});
});
