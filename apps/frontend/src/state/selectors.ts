import { PITCH_MM_PER_PX } from "../domain/layout";
import { computeDisplayComposite } from "../domain/mapping";
import { EMPTY_LAYERS, withEdit } from "../domain/types";
import type { Content } from "../domain/types";
import type { AppliedRender, WallState } from "./reducer";

/**
 * Resolves what a single screen should currently render: the live draft
 * (if this screen is part of the selection being edited), otherwise
 * whatever was last applied to it, otherwise nothing. Composite geometry
 * is computed in real device pixels (not preview display px) — see
 * domain/layout.ts displayScaleForKind and render/ContentLayer.tsx for how
 * that gets magnified for the on-screen preview.
 */
export function resolveScreenRender(
	state: WallState,
	screenId: string,
): AppliedRender | null {
	const inSelection = state.selection?.screenIds.includes(screenId) ?? false;

	if (inSelection && state.draft && state.selection) {
		const devicePxPerMm = 1 / PITCH_MM_PER_PX[state.selection.kind];
		const composite = computeDisplayComposite(
			{ specs: state.specs, positions: state.layout },
			state.selection,
			devicePxPerMm,
		);
		const slot = composite.slots.find((s) => s.screenId === screenId);
		if (slot) {
			return {
				// The edit folded into what this screen already shows, so a
				// Hintergrund change keeps its text and vice versa.
				layers: withEdit(
					state.applied[screenId]?.layers ?? EMPTY_LAYERS,
					state.draft,
				),
				compositeWidthPx: composite.widthPx,
				compositeHeightPx: composite.heightPx,
				offsetXPx: slot.offsetXPx,
				offsetYPx: slot.offsetYPx,
				bitmap: null,
			};
		}
	}

	return state.applied[screenId] ?? null;
}

/**
 * Whether the draft would actually change any selected screen — "Speichern"
 * should only be enabled when there is something to save, not because a field
 * was touched (see CONTEXT.md "Content"). Folding the edit into a screen's
 * layers and comparing against those same layers answers that per screen: an
 * edit that sets the background to the colour it already is changes nothing.
 *
 * A screen hydrated without layers is only a flattened picture, so there is no
 * baseline to compare against and the draft has to count as a change.
 */
export function draftHasChanges(state: WallState): boolean {
	// Brightness is a wall-level setting rather than part of the content draft,
	// but it is committed by the same Speichern button, so an otherwise
	// untouched panel with a moved slider still has something to save.
	if (brightnessHasChanges(state)) {
		return true;
	}

	if (!state.selection || !state.draft) {
		return false;
	}

	return state.selection.screenIds.some((screenId) => {
		const applied = state.applied[screenId];
		if (!applied || applied.bitmap !== null) {
			return true;
		}
		return (
			JSON.stringify(withEdit(applied.layers, state.draft as Content)) !==
			JSON.stringify(applied.layers)
		);
	});
}

export function brightnessHasChanges(state: WallState): boolean {
	const draft = state.draftBrightness;
	return (
		draft !== null &&
		(draft.small !== state.brightness.small ||
			draft.large !== state.brightness.large)
	);
}

/** What the brightness controls should currently show: the unsaved edit if
 * there is one, otherwise what the wall is actually set to. */
export function effectiveBrightness(state: WallState) {
	return state.draftBrightness ?? state.brightness;
}
