// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { SCREEN_SPECS } from "../../../src/domain/layout";
import { initialWallState, wallReducer } from "../../../src/state/reducer";
import type { StateResponse } from "../../../src/api/types";
import { draftHasChanges } from "../../../src/state/selectors";

function selectSix() {
	return wallReducer(initialWallState, {
		type: "request-intent",
		intent: { kind: "toggle-screen", screenId: "06", additive: false },
	});
}

/**
 * Reproduces the reported bug directly against the reducer: a background poll
 * that was already in flight when a save landed must not be allowed to revert
 * that save and re-open the "unsaved changes" prompt — see CONTEXT.md
 * "Client sync".
 */
describe("wallReducer: hydrated vs. a newer local save", () => {
	test("a stale poll response for a just-saved screen doesn't revert it or resurrect the draft", () => {
		const withDraft = wallReducer(selectSix(), {
			type: "set-draft-content",
			content: { type: "color", hex: "#FE4441" },
		});

		// The poll's snapshot, taken before the save below.
		const sinceGeneration = withDraft.generation;

		const saved = wallReducer(withDraft, {
			type: "apply-success",
			selection: { kind: "large", screenIds: ["06"] },
			layers: { background: "#FE4441", foreground: null },
			specs: SCREEN_SPECS,
		});
		expect(draftHasChanges(saved)).toBe(false);

		// The slow poll, sent before the save, finally resolves — with the
		// pre-save colour, since that's what the server had when it was asked.
		const remote: StateResponse["screens"] = {
			"06": {
				window: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
				content: {
					format: "mask1",
					widthPx: 32,
					heightPx: 32,
					data: "",
				},
				source: { background: null, foreground: null },
			},
		};

		const afterStaleHydrate = wallReducer(saved, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			remote,
			sinceGeneration,
		});

		// The save is kept, not reverted to what the stale poll saw...
		expect(afterStaleHydrate.applied["06"]).toMatchObject({
			layers: { background: "#FE4441", foreground: null },
		});
		// ...and switching screens still doesn't ask to save-or-discard.
		expect(draftHasChanges(afterStaleHydrate)).toBe(false);
	});

	test("a poll response that started after the save is not treated as stale", () => {
		const saved = wallReducer(selectSix(), {
			type: "apply-success",
			selection: { kind: "large", screenIds: ["06"] },
			layers: { background: "#FE4441", foreground: null },
			specs: SCREEN_SPECS,
		});

		// A poll that started after the save observes the post-save generation.
		const sinceGeneration = saved.generation;

		const remote: StateResponse["screens"] = {
			"06": {
				window: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
				content: {
					format: "mask1",
					widthPx: 32,
					heightPx: 32,
					data: "",
				},
				source: { background: "#B4B9FF", foreground: null },
			},
		};

		const afterHydrate = wallReducer(saved, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			remote,
			sinceGeneration,
		});

		// Not stale relative to this poll, so the (newer, server-confirmed)
		// remote value wins, same as before the guard existed.
		expect(afterHydrate.applied["06"]).toMatchObject({
			layers: { background: "#B4B9FF", foreground: null },
		});
	});

	test("a stale response for one screen doesn't block a fresh remote update to another", () => {
		const saved = wallReducer(selectSix(), {
			type: "apply-success",
			selection: { kind: "large", screenIds: ["06"] },
			layers: { background: "#FE4441", foreground: null },
			specs: SCREEN_SPECS,
		});
		const sinceGeneration = initialWallState.generation; // predates the save

		const remote: StateResponse["screens"] = {
			"06": {
				window: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
				content: { format: "mask1", widthPx: 32, heightPx: 32, data: "" },
				source: { background: null, foreground: null },
			},
			"07": {
				window: { offsetXPx: 0, offsetYPx: 0, widthPx: 32, heightPx: 32 },
				content: { format: "mask1", widthPx: 32, heightPx: 32, data: "" },
				source: { background: "#00FF00", foreground: null },
			},
		};

		const afterHydrate = wallReducer(saved, {
			type: "hydrated",
			specs: SCREEN_SPECS,
			remote,
			sinceGeneration,
		});

		// Screen 06 keeps the save the stale poll doesn't know about...
		expect(afterHydrate.applied["06"]).toMatchObject({
			layers: { background: "#FE4441", foreground: null },
		});
		// ...but screen 07, untouched locally, still adopts the poll's value.
		expect(afterHydrate.applied["07"]).toMatchObject({
			layers: { background: "#00FF00", foreground: null },
		});
	});
});
