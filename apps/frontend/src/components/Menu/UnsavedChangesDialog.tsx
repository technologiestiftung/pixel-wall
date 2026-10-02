import { Dialog } from "../Dialog";

interface UnsavedChangesDialogProps {
	/** Why the last save failed, so a retry from here isn't a blind one. */
	error: string | null;
	onSave: () => void;
	onDiscard: () => void;
	onCancel: () => void;
}

/** Shown when something the user asked for would silently drop an unsaved
 * draft — selecting other screens, clearing the selection, entering layout
 * mode. See state/reducer.ts `NavigationIntent`.
 *
 * Every way of dismissing it cancels rather than discards: clicking away is
 * the gesture you make when you didn't mean to open this at all, so it must
 * be the one that keeps the draft. */
export function UnsavedChangesDialog({
	error,
	onSave,
	onDiscard,
	onCancel,
}: UnsavedChangesDialogProps) {
	return (
		<Dialog
			role="alertdialog"
			labelledBy="unsaved-changes-title"
			onClose={onCancel}
			className="max-w-sm"
		>
			<h3
				id="unsaved-changes-title"
				className="pr-6 text-[15px] font-semibold text-[#20201b]"
			>
				Ungespeicherte Änderungen
			</h3>
			<p className="mt-2 text-[13px] text-[#6b6b66]">
				Für diesen Inhalt gibt es ungespeicherte Änderungen. Möchtest du sie
				speichern oder verwerfen?
			</p>
			{error && (
				<p role="alert" className="mt-3 text-[13px] text-red-700">
					{error}
				</p>
			)}
			<div className="mt-5 flex justify-end gap-2">
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
		</Dialog>
	);
}
