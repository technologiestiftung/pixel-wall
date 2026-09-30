import { PITCH_MM_PER_PX } from "../domain/layout";
import {
	computeDisplayComposite,
	layersForGroup,
	referenceScreenId,
	selectionGroups,
} from "../domain/mapping";
import { EMPTY_LAYERS, withEdit } from "../domain/types";
import type { Content, ScreenLayers } from "../domain/types";
import type { AppliedRender, WallState } from "./reducer";

/**
 * The in-progress content edits currently drafted, in the order they should
 * be folded onto a screen's layers. Text/Animation and Hintergrund write
 * different layers (see `withEdit`), so both can be present and applied
 * together — at most one of draftText/draftAnimation is ever set, though
 * (see `WallState`).
 */
export function activeContentDrafts(state: WallState): Content[] {
	return [state.draftColor, state.draftText ?? state.draftAnimation].filter(
		(content): content is Content => content !== null,
	);
}

export function hasContentDraft(state: WallState): boolean {
	return activeContentDrafts(state).length > 0;
}

function foldDrafts(layers: ScreenLayers, drafts: Content[]): ScreenLayers {
	return drafts.reduce(withEdit, layers);
}

/**
 * Resolves what a single screen should currently render: the live draft(s)
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
	const drafts = activeContentDrafts(state);
	const group =
		state.selection &&
		selectionGroups(state.specs, state.selection).find((g) =>
			g.screenIds.includes(screenId),
		);

	if (state.selection && group && drafts.length > 0) {
		const devicePxPerMm = 1 / PITCH_MM_PER_PX[group.kind];
		const composite = computeDisplayComposite(
			{ specs: state.specs, positions: state.layout },
			group,
			devicePxPerMm,
		);
		const slot = composite.slots.find((s) => s.screenId === screenId);
		if (slot) {
			return {
				// The edits folded into what this screen already shows, so a
				// Hintergrund change keeps its text and vice versa. A mixed
				// selection is one picture, so it folds onto one shared base.
				layers: layersForGroup(
					foldDrafts(
						state.applied[
							state.selection.kind === "mixed"
								? referenceScreenId(state.specs, state.selection)
								: screenId
						]?.layers ?? EMPTY_LAYERS,
						drafts,
					),
					group,
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
 * Whether the draft(s) would actually change any selected screen —
 * "Speichern" should only be enabled when there is something to save, not
 * because a field was touched (see CONTEXT.md "Content"). Folding the edits
 * into a screen's layers and comparing against those same layers answers
 * that per screen: an edit that sets the background to the colour it already
 * is changes nothing.
 *
 * A screen hydrated without layers is only a flattened picture, so there is no
 * baseline to compare against and the draft has to count as a change.
 */
export function draftHasChanges(state: WallState): boolean {
	const drafts = activeContentDrafts(state);
	if (!state.selection || drafts.length === 0) {
		return false;
	}

	return state.selection.screenIds.some((screenId) => {
		const applied = state.applied[screenId];
		if (!applied || applied.bitmap !== null) {
			return true;
		}
		return (
			JSON.stringify(foldDrafts(applied.layers, drafts)) !==
			JSON.stringify(applied.layers)
		);
	});
}
