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
export function resolveScreenRender(state: WallState, screenId: string): AppliedRender | null {
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
