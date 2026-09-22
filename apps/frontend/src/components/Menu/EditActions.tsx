import { useApplyChanges } from "../../state/useApplyChanges";

/** "Speichern" at the bottom of the edit panel — commits the draft(s) to the
 * physical screens. Until it is pressed, edits only show in the digital
 * preview and are discarded if left unsaved. */
export function EditActions() {
	const {
		canApply,
		hasChanges,
		applyStatus,
		applyError,
		handleApply,
		hasSelection,
	} = useApplyChanges();

	return (
		<div className="flex flex-col gap-2">
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
			{hasChanges && (
				<div className="rounded-md bg-[#f4f4f2] px-3 py-2 text-[12.5px] text-[#6b6b66]">
					Änderungen noch nicht gespeichert.
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
				className="w-full whitespace-nowrap rounded-[8px] bg-[#006fff] px-3 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
			>
				{applyStatus === "pending" ? "Wird gespeichert…" : "Speichern"}
			</button>
		</div>
	);
}
