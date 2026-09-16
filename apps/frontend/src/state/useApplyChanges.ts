import { applyChanges, putBrightness } from "../api/wall";
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
	const { specs, layout, selection, draft, applyStatus, applyError } = state;
	const dispatch = useWallDispatch();
	const { request } = useAuth();
	const canApply = applyStatus !== "pending" && draftHasChanges(state);

	/** Returns whether the save actually succeeded, so callers that need to
	 * sequence further action afterwards (e.g. switching tabs) can wait for it. */
	async function handleApply(): Promise<boolean> {
		const brightness = effectiveBrightness(state);

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
		applyStatus,
		applyError,
		handleApply,
		hasSelection: selection !== null,
	};
}
