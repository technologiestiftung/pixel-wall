import { applyChanges } from "../api/client";
import { buildApplyRequest } from "../domain/apply";
import { draftHasChanges } from "./selectors";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const state = useWallState();
	const { specs, layout, selection, draft, applyStatus, applyError } = state;
	const dispatch = useWallDispatch();
	const canApply = applyStatus !== "pending" && draftHasChanges(state);

	/** Returns whether the save actually succeeded, so callers that need to
	 * sequence further action afterwards (e.g. switching tabs) can wait for it. */
	async function handleApply(): Promise<boolean> {
		if (!selection || !draft) {
			return false;
		}
		dispatch({ type: "apply-pending" });
		try {
			const request = buildApplyRequest(
				{ specs, positions: layout },
				selection,
				draft,
			);
			await applyChanges(request);
			dispatch({
				type: "apply-success",
				selection,
				content: draft,
				specs,
				layout,
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
