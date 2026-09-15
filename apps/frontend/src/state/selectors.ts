import { PITCH_MM_PER_PX } from "../domain/layout";
import { computeDisplayComposite } from "../domain/mapping";
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
				source: "local",
				content: state.draft,
				compositeWidthPx: composite.widthPx,
				compositeHeightPx: composite.heightPx,
				offsetXPx: slot.offsetXPx,
				offsetYPx: slot.offsetYPx,
			};
		}
	}

	return state.applied[screenId] ?? null;
}

/**
 * Whether the current draft actually differs from what's already applied to
 * every screen in the selection — "Speichern" should only be enabled when
 * there's a real change to save, not just because a field was touched (see
 * CONTEXT.md "Content": simply selecting/re-touching fields isn't itself a
 * change). If any selected screen has no local baseline to compare against
 * (never edited this session, or only hydrated as a remote bitmap with no
 * reconstructable content), we can't prove nothing changed, so we treat the
 * draft as a real change.
 */
export function draftHasChanges(state: WallState): boolean {
	if (!state.selection || !state.draft) {
		return false;
	}

	const draftJson = JSON.stringify(state.draft);
	let baselineJson: string | null = null;

	for (const screenId of state.selection.screenIds) {
		const applied = state.applied[screenId];
		if (!applied || applied.source !== "local") {
			return true;
		}
		const contentJson = JSON.stringify(applied.content);
		if (baselineJson === null) {
			baselineJson = contentJson;
		} else if (baselineJson !== contentJson) {
			// Selected screens don't even agree with each other — definitely
			// not a no-op save.
			return true;
		}
	}

	return draftJson !== baselineJson;
}
