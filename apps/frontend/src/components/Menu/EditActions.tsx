import { useApplyChanges } from "../../state/useApplyChanges";

/** "Vorschau auf Screens" and "Speichern" at the bottom of the edit panel.
 * Vorschau puts the draft(s) on the real panels without committing them;
 * leaving it unsaved (or pressing "Verwerfen") puts the saved content back. */
export function EditActions() {
	const {
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
		hasSelection,
	} = useApplyChanges();

	const busy = applyStatus === "pending" || previewStatus === "pending";

	function previewLabel() {
		if (previewStatus === "pending") {
			return "Wird übertragen…";
		}
		return isPreviewing ? "Vorschau aktualisieren" : "Vorschau auf Screens";
	}

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
			{previewStatus === "error" && (
				<div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
					<span>{previewError}</span>
					<button
						type="button"
						onClick={handleRevertPreview}
						className="font-medium underline underline-offset-2"
					>
						Zurücksetzen
					</button>
				</div>
			)}
			{isPreviewing ? (
				<div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
					<span>Vorschau läuft — noch nicht gespeichert.</span>
					<button
						type="button"
						disabled={busy}
						onClick={handleRevertPreview}
						className="shrink-0 font-medium underline underline-offset-2 disabled:opacity-40"
					>
						{previewStatus === "pending" ? "Wird verworfen…" : "Verwerfen"}
					</button>
				</div>
			) : (
				hasChanges && (
					<div className="rounded-md bg-[#f4f4f2] px-3 py-2 text-[12.5px] text-[#6b6b66]">
						Änderungen noch nicht gespeichert.
					</div>
				)
			)}

			<div className="flex gap-2">
				<button
					type="button"
					disabled={!canPreview}
					onClick={handlePreview}
					title={
						hasSelection
							? undefined
							: "Bildschirme auswählen und Inhalt bearbeiten, um eine Vorschau zu zeigen"
					}
					className="flex-1 whitespace-nowrap rounded-[8px] border border-[#006fff] bg-white px-3 py-2.5 text-[13.5px] font-semibold text-[#006fff] disabled:cursor-not-allowed disabled:opacity-40"
				>
					{previewLabel()}
				</button>

				<button
					type="button"
					disabled={!canApply}
					onClick={handleApply}
					title={
						hasSelection
							? undefined
							: "Bildschirme auswählen und Inhalt bearbeiten, um zu speichern"
					}
					className="flex-1 whitespace-nowrap rounded-[8px] bg-[#006fff] px-3 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
				>
					{applyStatus === "pending" ? "Wird gespeichert…" : "Speichern"}
				</button>
			</div>
		</div>
	);
}
