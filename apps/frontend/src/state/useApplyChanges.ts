import { applyChanges } from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import { useControl } from "../auth/ControlContext";
import { buildApplyRequest } from "../domain/apply";
import { DEFAULT_LAYOUT } from "../domain/layout";
import { selectionGroups } from "../domain/mapping";
import { ApiError } from "../lib/api";
import {
	draftHasChanges,
	hasContentDraft,
	selectionEditedLayers,
} from "./selectors";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const state = useWallState();
	const { specs, selection, applyStatus, applyError } = state;
	const dispatch = useWallDispatch();
	const { request } = useAuth();
	const { isController } = useControl();
	const hasChanges = draftHasChanges(state);
	const busy = applyStatus === "pending";
	const canApply = !busy && hasChanges && isController;

	/** Returns whether the save actually succeeded, so callers that need to
	 * sequence further action afterwards (e.g. switching tabs) can wait for it. */
	async function handleApply(): Promise<boolean> {
		if (busy || !selection || !hasContentDraft(state)) {
			return false;
		}

		const layers = selectionEditedLayers(state);
		dispatch({ type: "apply-pending" });
		try {
			// The backend takes one screen kind per request, so a mixed
			// selection is saved as one request per kind.
			const payloads = await Promise.all(
				selectionGroups(specs, selection).map((group) =>
					buildApplyRequest({ specs, positions: DEFAULT_LAYOUT }, group, {
						layers,
					}),
				),
			);
			await Promise.all(
				payloads.map((payload) => applyChanges(request, payload)),
			);
			dispatch({
				type: "apply-success",
				selection,
				layers,
				specs,
			});
			return true;
		} catch (error) {
			dispatch({
				type: "apply-error",
				message:
					error instanceof ApiError && error.status === 423
						? error.message
						: "Änderungen konnten nicht übertragen werden.",
			});
			return false;
		}
	}

	return {
		canApply,
		hasChanges,
		applyStatus,
		applyError,
		handleApply,
		hasSelection: selection !== null,
		isController,
	};
}
