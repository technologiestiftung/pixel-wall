import { applyChanges } from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import { useControl } from "../auth/ControlContext";
import { buildApplyRequest } from "../domain/apply";
import { referenceScreenId, selectionGroups } from "../domain/mapping";
import { ApiError } from "../lib/api";
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
	const { isController } = useControl();
	const hasChanges = draftHasChanges(state);
	const busy = applyStatus === "pending";
	const canApply = !busy && hasChanges && isController;

	/** The edits folded into what the selection already shows — this is what
	 * keeps a Hintergrund change from flattening the text on top of it. One
	 * screen stands for the rest: a selection is edited as one unit, so they
	 * all end up with the same layers anyway. */
	function editedLayers() {
		if (!selection) {
			return EMPTY_LAYERS;
		}
		return activeContentDrafts(state).reduce(
			withEdit,
			applied[referenceScreenId(specs, selection)]?.layers ?? EMPTY_LAYERS,
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
			// The backend takes one screen kind per request, so a mixed
			// selection is saved as one request per kind.
			const payloads = await Promise.all(
				selectionGroups(specs, selection).map((group) =>
					buildApplyRequest({ specs, positions: layout }, group, {
						layers: editedLayers(),
					}),
				),
			);
			await Promise.all(
				payloads.map((payload) => applyChanges(request, payload)),
			);
			dispatch({
				type: "apply-success",
				selection,
				layers: editedLayers(),
				specs,
				layout,
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
