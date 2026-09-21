import { useCallback } from "react";
import {
	applyChanges,
	previewChanges,
	putBrightness,
	revertPreview,
} from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import { buildApplyRequest } from "../domain/apply";
import { EMPTY_LAYERS, withEdit } from "../domain/types";
import {
	activeContentDrafts,
	brightnessHasChanges,
	draftHasChanges,
	effectiveBrightness,
	hasContentDraft,
} from "./selectors";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const state = useWallState();
	const {
		specs,
		layout,
		selection,
		applied,
		applyStatus,
		applyError,
		previewStatus,
		previewError,
	} = state;
	const dispatch = useWallDispatch();
	const { request } = useAuth();
	const hasChanges = draftHasChanges(state);
	const busy = applyStatus === "pending" || previewStatus === "pending";
	const canApply = !busy && hasChanges;
	const canPreview =
		!busy && hasChanges && selection !== null && hasContentDraft(state);
	const isPreviewing = previewStatus === "active";

	/** The edits folded into what the selection already shows — this is what
	 * keeps a Hintergrund change from flattening the text on top of it. The
	 * first screen stands for the rest: a selection is edited as one unit, so
	 * they all end up with the same layers anyway. */
	function editedLayers() {
		if (!selection) {
			return EMPTY_LAYERS;
		}
		return activeContentDrafts(state).reduce(
			withEdit,
			applied[selection.screenIds[0]]?.layers ?? EMPTY_LAYERS,
		);
	}

	/** Restores what the state file says on every screen a preview touched.
	 * Harmless when nothing is being previewed, so callers that just want to
	 * leave the panels in a saved state can fire it unconditionally. */
	const handleRevertPreview = useCallback(async (): Promise<boolean> => {
		dispatch({ type: "set-preview", status: "pending" });
		try {
			await revertPreview(request);
			dispatch({ type: "set-preview", status: "idle" });
			return true;
		} catch {
			dispatch({
				type: "set-preview",
				status: "error",
				message: "Vorschau konnte nicht zurückgesetzt werden.",
			});
			return false;
		}
	}, [dispatch, request]);

	/** Pushes the draft(s) to the real panels without saving them. */
	async function handlePreview(): Promise<boolean> {
		if (!selection || !hasContentDraft(state)) {
			return false;
		}
		dispatch({ type: "set-preview", status: "pending" });
		try {
			const payload = await buildApplyRequest(
				{ specs, positions: layout },
				selection,
				{ layers: editedLayers(), brightness: effectiveBrightness(state) },
			);
			await previewChanges(request, payload);
			dispatch({ type: "set-preview", status: "active" });
			return true;
		} catch {
			dispatch({
				type: "set-preview",
				status: "error",
				message: "Vorschau konnte nicht übertragen werden.",
			});
			return false;
		}
	}

	/** Returns whether the save actually succeeded, so callers that need to
	 * sequence further action afterwards (e.g. switching tabs) can wait for it. */
	async function handleApply(): Promise<boolean> {
		const brightness = effectiveBrightness(state);
		const wasPreviewing = previewStatus === "active";

		// Moving only the slider is a legitimate save with nothing to rasterise,
		// so it goes to the brightness endpoint rather than through an apply.
		if (!selection || !hasContentDraft(state)) {
			if (!brightnessHasChanges(state)) {
				return false;
			}
			dispatch({ type: "apply-pending" });
			try {
				await putBrightness(request, brightness);
				dispatch({ type: "brightness-applied", brightness });
				return true;
			} catch {
				dispatch({
					type: "apply-error",
					message: "Helligkeit konnte nicht übertragen werden.",
				});
				return false;
			}
		}

		dispatch({ type: "apply-pending" });
		try {
			const payload = await buildApplyRequest(
				{ specs, positions: layout },
				selection,
				{ layers: editedLayers(), brightness },
			);
			await applyChanges(request, payload);
			dispatch({
				type: "apply-success",
				selection,
				layers: editedLayers(),
				specs,
				layout,
				brightness,
			});
			// A preview may have reached screens this save does not cover (an
			// earlier, wider selection, or another board at the previewed
			// brightness). Reverting now that the state file holds the new
			// content leaves those showing what is actually saved.
			if (wasPreviewing) {
				await revertPreview(request).catch(() => undefined);
			}
			return true;
		} catch {
			dispatch({
				type: "apply-error",
				message: "Änderungen konnten nicht übertragen werden.",
			});
			return false;
		}
	}

	return {
		canApply,
		canPreview,
		hasChanges,
		isPreviewing,
		applyStatus,
		applyError,
		previewStatus,
		previewError,
		handleApply,
		handlePreview,
		handleRevertPreview,
		hasSelection: selection !== null,
	};
}
