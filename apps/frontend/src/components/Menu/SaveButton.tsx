import { useApplyChanges } from "../../state/useApplyChanges";

/** "Speichern" — commits the current draft for the selection. Lives at the
 * bottom of the edit panel (moved here from the preview toolbar). */
export function SaveButton() {
	const { canApply, applyStatus, applyError, handleApply, hasSelection } =
		useApplyChanges();

	return (
		<div className="mt-auto flex flex-col gap-2 pt-4">
			{applyStatus === "error" && (
				<div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
					<span>{applyError}</span>
					<button
						type="button"
						onClick={handleApply}
						className="font-medium underline underline-offset-2"
					>
						Erneut versuchen
					</button>
				</div>
			)}
			<button
				type="button"
				disabled={!canApply}
				onClick={handleApply}
				title={
					hasSelection
						? undefined
						: "Bildschirme auswählen und Inhalt bearbeiten, um zu speichern"
				}
				className="w-full rounded-[8px] bg-[#006fff] px-[18px] py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
			>
				{applyStatus === "pending" ? "Wird gespeichert…" : "Speichern"}
			</button>
		</div>
	);
}
