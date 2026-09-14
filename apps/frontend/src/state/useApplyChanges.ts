import { applyChanges } from "../api/client";
import { buildApplyRequest } from "../domain/apply";
import { useWallDispatch, useWallState } from "./WallProvider";

export function useApplyChanges() {
	const { specs, layout, selection, draft, applyStatus, applyError } = useWallState();
	const dispatch = useWallDispatch();
	const canApply = selection !== null && draft !== null && applyStatus !== "pending";

	async function handleApply() {
		if (!selection || !draft) {
			return;
		}
		dispatch({ type: "apply-pending" });
		try {
			const request = buildApplyRequest({ specs, positions: layout }, selection, draft);
			await applyChanges(request);
			dispatch({ type: "apply-success", selection, content: draft, specs, layout });
		} catch {
			dispatch({ type: "apply-error", message: "Änderungen konnten nicht übertragen werden." });
		}
	}

	return { canApply, applyStatus, applyError, handleApply, hasSelection: selection !== null };
}
