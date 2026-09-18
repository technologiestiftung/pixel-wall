import { useEffect, type MouseEvent as ReactMouseEvent } from "react";

interface UnsavedChangesDialogProps {
	onSave: () => void;
	onDiscard: () => void;
	onCancel: () => void;
	/** Whether the wall is currently showing this draft as an unsaved preview,
	 * which discarding will also take back down. */
	previewActive: boolean;
}

/** Shown when something the user asked for would silently drop an unsaved
 * draft — switching content tabs, selecting other screens, clearing the
 * selection, entering layout mode. See state/reducer.ts `NavigationIntent`. */
export function UnsavedChangesDialog({
	onSave,
	onDiscard,
	onCancel,
	previewActive,
}: UnsavedChangesDialogProps) {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onCancel();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onCancel]);

	// Dismissing by clicking away cancels rather than discards: it is the
	// gesture you make when you didn't mean to open this at all, so it must be
	// the one that keeps the draft. On mousedown, not click, so that releasing
	// a text selection outside the dialog doesn't close it.
	function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
		if (event.target === event.currentTarget) {
			onCancel();
		}
	}

	return (
		<div
			onMouseDown={handleBackdropMouseDown}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div
				role="alertdialog"
				aria-labelledby="unsaved-changes-title"
				className="w-full max-w-sm rounded-[10px] bg-white p-6 shadow-lg"
			>
				<h3
					id="unsaved-changes-title"
					className="text-[15px] font-semibold text-[#20201b]"
				>
					Ungespeicherte Änderungen
				</h3>
				<p className="mt-2 text-[13px] text-[#6b6b66]">
					Für diesen Inhalt gibt es ungespeicherte Änderungen. Möchtest du sie
					speichern oder verwerfen?
				</p>
				{previewActive && (
					<p className="mt-2 text-[13px] text-[#6b6b66]">
						Die Vorschau auf den Bildschirmen wird dabei zurückgesetzt.
					</p>
				)}
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-[8px] px-3 py-2 text-[13.5px] font-medium text-[#4b4b47]"
					>
						Abbrechen
					</button>
					<button
						type="button"
						onClick={onDiscard}
						className="rounded-[8px] border border-[#e4e4e0] bg-white px-3 py-2 text-[13.5px] font-medium text-[#4b4b47]"
					>
						Verwerfen
					</button>
					<button
						type="button"
						onClick={onSave}
						className="rounded-[8px] bg-[#006fff] px-3 py-2 text-[13.5px] font-semibold text-white"
					>
						Speichern
					</button>
				</div>
			</div>
		</div>
	);
}
