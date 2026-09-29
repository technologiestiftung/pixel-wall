import { applyChanges } from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import { buildApplyRequest } from "../domain/apply";
import { EMPTY_LAYERS, withEdit } from "../domain/types";
import {
	activeContentDrafts,
	draftHasChanges,
	hasContentDraft,
} from "./selectors";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const state = useWallState();
	const { specs, layout, selection, applied, applyStatus, applyError } = state;
	const dispatch = useWallDispatch();
	const { request } = useAuth();
	const hasChanges = draftHasChanges(state);
	const busy = applyStatus === "pending";
	const canApply = !busy && hasChanges;

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

	/** Returns whether the save actually succeeded, so callers that need to
	 * sequence further action afterwards (e.g. switching tabs) can wait for it. */
	async function handleApply(): Promise<boolean> {
		if (!selection || !hasContentDraft(state)) {
			return false;
		}

		dispatch({ type: "apply-pending" });
		try {
			const payload = await buildApplyRequest(
				{ specs, positions: layout },
				selection,
				{ layers: editedLayers() },
			);
			await applyChanges(request, payload);
			dispatch({
				type: "apply-success",
				selection,
				layers: editedLayers(),
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
		hasChanges,
		applyStatus,
		applyError,
		handleApply,
		hasSelection: selection !== null,
	};
}
