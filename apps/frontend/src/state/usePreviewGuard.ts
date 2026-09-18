import { useEffect, useRef } from "react";
import { useApplyChanges } from "./useApplyChanges";
import { useWallState } from "./WallProvider";

/**
 * Takes an unsaved preview back off the panels as soon as the user walks away
 * from the edit that produced it — changing the selection, discarding the
 * draft, or leaving layout-edit mode. Without this, abandoning a preview would
 * leave the wall showing something that was never saved.
 */
export function usePreviewGuard() {
	const { selection, draft, previewStatus, layoutEditMode } = useWallState();
	const { handleRevertPreview } = useApplyChanges();

	const key = selection
		? `${selection.kind}:${[...selection.screenIds].sort().join(",")}`
		: null;
	const abandoned = key === null || draft === null || layoutEditMode;
	const previousKey = useRef(key);

	useEffect(() => {
		const changed = previousKey.current !== key;
		previousKey.current = key;
		if (previewStatus === "active" && (changed || abandoned)) {
			void handleRevertPreview();
		}
	}, [key, abandoned, previewStatus, handleRevertPreview]);
}
