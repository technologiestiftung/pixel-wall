import { useCallback } from "react";
import {
	applyChanges,
	previewChanges,
	putBrightness,
	revertPreview,
} from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import { buildApplyRequest } from "../domain/apply";
import {
	brightnessHasChanges,
	draftHasChanges,
	effectiveBrightness,
} from "./selectors";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const state = useWallState();
	const {
		specs,
		layout,
		selection,
		draft,
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
		!busy && hasChanges && selection !== null && draft !== null;
	const isPreviewing = previewStatus === "active";

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

	/** Pushes the draft to the real panels without saving it. */
	async function handlePreview(): Promise<boolean> {
		if (!selection || !draft) {
			return false;
		}
		dispatch({ type: "set-preview", status: "pending" });
		try {
			const payload = await buildApplyRequest(
				{ specs, positions: layout },
				selection,
				{ content: draft, brightness: effectiveBrightness(state) },
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
		if (!selection || !draft) {
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
				{
					content: draft,
					brightness,
				},
			);
			await applyChanges(request, payload);
			dispatch({
				type: "apply-success",
				selection,
				content: draft,
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
