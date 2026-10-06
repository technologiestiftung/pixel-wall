import { DEFAULT_LAYOUT, PITCH_MM_PER_PX } from "../domain/layout";
import {
	computeDisplayComposite,
	layersForGroup,
	referenceScreenId,
	selectionGroups,
} from "../domain/mapping";
import { EMPTY_LAYERS, withEdit } from "../domain/types";
import type { Content, ScreenLayers, SelectionGroup } from "../domain/types";
import type { AppliedRender, WallState } from "./reducer";

type DraftFields = Pick<
	WallState,
	"draftText" | "draftAnimation" | "draftColor"
>;

/** Everything the preview's per-screen renders depend on. */
export type RenderInputs = DraftFields &
	Pick<WallState, "specs" | "selection" | "applied">;

/**
 * The in-progress content edits currently drafted, in the order they should
 * be folded onto a screen's layers. Text/Animation and Hintergrund write
 * different layers (see `withEdit`), so both can be present and applied
 * together — at most one of draftText/draftAnimation is ever set, though
 * (see `WallState`).
 */
export function activeContentDrafts(state: DraftFields): Content[] {
	return [state.draftColor, state.draftText ?? state.draftAnimation].filter(
		(content): content is Content => content !== null,
	);
}

export function hasContentDraft(state: DraftFields): boolean {
	return activeContentDrafts(state).length > 0;
}

function foldDrafts(layers: ScreenLayers, drafts: Content[]): ScreenLayers {
	return drafts.reduce(withEdit, layers);
}

/** The edits folded into what the selection already shows — this is what
 * keeps a Hintergrund change from flattening the text on top of it. One
 * screen stands for the rest: a selection is edited as one unit, so they
 * all end up with the same layers anyway. */
export function selectionEditedLayers(state: WallState): ScreenLayers {
	if (!state.selection) {
		return EMPTY_LAYERS;
	}
	return foldDrafts(
		state.applied[referenceScreenId(state.specs, state.selection)]?.layers ??
			EMPTY_LAYERS,
		activeContentDrafts(state),
	);
}

/**
 * What each screen of one selected group shows with the draft(s) folded in.
 * Composite geometry is computed in real device pixels (not preview display
 * px) — see domain/layout.ts displayScaleForKind and render/ContentLayer.tsx
 * for how that gets magnified for the on-screen preview.
 */
function draftRendersForGroup(
	state: RenderInputs,
	group: SelectionGroup,
	drafts: Content[],
): Map<string, AppliedRender> {
	const devicePxPerMm = 1 / PITCH_MM_PER_PX[group.kind];
	const composite = computeDisplayComposite(
		{ specs: state.specs, positions: DEFAULT_LAYOUT },
		group,
		devicePxPerMm,
	);
	// A mixed selection is one picture, so it folds onto one shared base.
	const sharedBaseId =
		state.selection?.kind === "mixed"
			? referenceScreenId(state.specs, state.selection)
			: null;
	const renders = new Map<string, AppliedRender>();
	for (const slot of composite.slots) {
		renders.set(slot.screenId, {
			// The edits folded into what this screen already shows, so a
			// Hintergrund change keeps its text and vice versa.
			layers: layersForGroup(
				foldDrafts(
					state.applied[sharedBaseId ?? slot.screenId]?.layers ?? EMPTY_LAYERS,
					drafts,
				),
				group,
			),
			compositeWidthPx: composite.widthPx,
			compositeHeightPx: composite.heightPx,
			offsetXPx: slot.offsetXPx,
			offsetYPx: slot.offsetYPx,
			bitmap: null,
		});
	}
	return renders;
}

/**
 * Resolves what a single screen should currently render: the live draft(s)
 * (if this screen is part of the selection being edited), otherwise
 * whatever was last applied to it, otherwise nothing.
 */
export function resolveScreenRender(
	state: RenderInputs,
	screenId: string,
): AppliedRender | null {
	const drafts = activeContentDrafts(state);
	if (state.selection && drafts.length > 0) {
		const group = selectionGroups(state.specs, state.selection).find((g) =>
			g.screenIds.includes(screenId),
		);
		const render =
			group && draftRendersForGroup(state, group, drafts).get(screenId);
		if (render) {
			return render;
		}
	}
	return state.applied[screenId] ?? null;
}

/**
 * `resolveScreenRender` for every screen on the wall at once, so the
 * selection's groups and composites are computed once rather than per tile.
 * Screens outside the selection keep the very same `applied` object, which
 * lets memoized tiles skip re-rendering while a draft is edited.
 */
export function resolveScreenRenders(
	state: RenderInputs,
): Map<string, AppliedRender | null> {
	const renders = new Map<string, AppliedRender | null>(
		DEFAULT_LAYOUT.map(({ screenId }) => [
			screenId,
			state.applied[screenId] ?? null,
		]),
	);
	const drafts = activeContentDrafts(state);
	if (!state.selection || drafts.length === 0) {
		return renders;
	}
	for (const group of selectionGroups(state.specs, state.selection)) {
		for (const [screenId, render] of draftRendersForGroup(
			state,
			group,
			drafts,
		)) {
			renders.set(screenId, render);
		}
	}
	return renders;
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

/** Whether the unsaved-changes dialog should ask about a held-back intent.
 * While a save is in flight the intent is just waiting for it to land (see
 * the reducer's request-intent), so there is nothing to ask. */
export function needsUnsavedConfirmation(state: WallState): boolean {
	return state.pendingIntent !== null && state.applyStatus !== "pending";
}
