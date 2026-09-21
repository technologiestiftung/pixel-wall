import { useEffect, useRef } from "react";
import { hasContentDraft } from "./selectors";
import { useApplyChanges } from "./useApplyChanges";
import { useWallState } from "./WallProvider";

/**
 * Takes an unsaved preview back off the panels as soon as the user walks away
 * from the edit that produced it — changing the selection, discarding every
 * draft, or leaving layout-edit mode. Without this, abandoning a preview
 * would leave the wall showing something that was never saved.
 */
export function usePreviewGuard() {
	const state = useWallState();
	const {
		selection,
		draftText,
		draftAnimation,
		previewStatus,
		layoutEditMode,
	} = state;
	const { handleRevertPreview } = useApplyChanges();

	// Text and Animation/Bild share one foreground layer, so editing one
	// silently drops the other (see reducer.ts "set-draft-content") — a
	// previewed animation can turn into previewed text, or vice versa,
	// without ever going through discard/apply. That swap has to revert the
	// stale hardware preview just like a changed selection would.
	let foregroundKind = "none";
	if (draftText) {
		foregroundKind = "text";
	} else if (draftAnimation) {
		foregroundKind = "animation";
	}
	const key = selection
		? `${selection.kind}:${[...selection.screenIds].sort().join(",")}:${foregroundKind}`
		: null;
	const abandoned = key === null || !hasContentDraft(state) || layoutEditMode;
	const previousKey = useRef(key);

	useEffect(() => {
		const changed = previousKey.current !== key;
		previousKey.current = key;
		if (previewStatus === "active" && (changed || abandoned)) {
			void handleRevertPreview();
		}
	}, [key, abandoned, previewStatus, handleRevertPreview]);
}
