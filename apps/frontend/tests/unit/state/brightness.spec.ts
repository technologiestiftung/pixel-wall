import { describe, expect, test } from "vitest";
import { initialWallState, wallReducer } from "../../../src/state/reducer";
import {
	brightnessHasChanges,
	draftHasChanges,
	effectiveBrightness,
} from "../../../src/state/selectors";

function withDraftBrightness(kind: "small" | "large", value: number) {
	return wallReducer(initialWallState, {
		type: "set-draft-brightness",
		kind,
		value,
	});
}

describe("brightness draft", () => {
	test("starts with no unsaved edit", () => {
		expect(initialWallState.draftBrightness).toBeNull();
		expect(brightnessHasChanges(initialWallState)).toBe(false);
		expect(effectiveBrightness(initialWallState)).toEqual({
			small: 60,
			large: 60,
		});
	});

	test("editing one kind leaves the other alone", () => {
		const next = withDraftBrightness("large", 85);
		expect(next.draftBrightness).toEqual({ small: 60, large: 85 });
		expect(effectiveBrightness(next)).toEqual({ small: 60, large: 85 });
	});

	test("a changed slider is a saveable change even with no content draft", () => {
		const next = withDraftBrightness("small", 30);
		expect(brightnessHasChanges(next)).toBe(true);
		expect(draftHasChanges(next)).toBe(true);
	});

	test("setting a slider back to its applied value is not a change", () => {
		const next = withDraftBrightness("small", 60);
		expect(brightnessHasChanges(next)).toBe(false);
		expect(draftHasChanges(next)).toBe(false);
	});

	test("discarding the draft clears the brightness edit too", () => {
		const edited = withDraftBrightness("large", 20);
		const discarded = wallReducer(edited, { type: "discard-draft" });
		expect(discarded.draftBrightness).toBeNull();
	});

	test("clearing the selection is confirmed first, then clears the brightness edit", () => {
		// An unsaved brightness edit is a change like any other, so dropping
		// the selection asks before throwing it away.
		const edited = withDraftBrightness("large", 20);
		const asked = wallReducer(edited, {
			type: "request-intent",
			intent: { kind: "clear-selection" },
		});
		expect(asked.pendingIntent).toEqual({ kind: "clear-selection" });
		expect(asked.draftBrightness).toEqual({ small: 60, large: 20 });

		const cleared = wallReducer(asked, {
			type: "resolve-intent",
			commit: true,
		});
		expect(cleared.selection).toBeNull();
		expect(cleared.draftBrightness).toBeNull();
	});

	test("hydrating adopts the wall's brightness", () => {
		const next = wallReducer(initialWallState, {
			type: "hydrated",
			specs: initialWallState.specs,
			layout: initialWallState.layout,
			remote: {},
			brightness: { small: 25, large: 95 },
		});
		expect(next.brightness).toEqual({ small: 25, large: 95 });
		expect(effectiveBrightness(next)).toEqual({ small: 25, large: 95 });
	});
});
