interface UnsavedChangesDialogProps {
	onSave: () => void;
	onDiscard: () => void;
	onCancel: () => void;
}

/** Shown when switching to another content tab would silently drop an
 * unsaved draft — see CONTEXT.md "Apply changes" / state/reducer.ts
 * "discard-draft". The draft is a single value shared across tabs, so
 * editing another tab's fields overwrites it outright. */
export function UnsavedChangesDialog({ onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
			<div role="alertdialog" aria-labelledby="unsaved-changes-title" className="w-full max-w-sm rounded-[10px] bg-white p-6 shadow-lg">
				<h3 id="unsaved-changes-title" className="text-[15px] font-semibold text-[#20201b]">
					Ungespeicherte Änderungen
				</h3>
				<p className="mt-2 text-[13px] text-[#6b6b66]">
					Für diesen Inhalt gibt es ungespeicherte Änderungen. Möchtest du sie speichern oder verwerfen?
				</p>
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
