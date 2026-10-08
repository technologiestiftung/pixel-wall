import { Dialog } from "../Dialog";

interface ConfirmShutdownDialogProps {
	pending: boolean;
	error: string | null;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Confirms the manual "off now" trigger — see CONTEXT.md "Power". There is
 * no software "on": once confirmed, restoring the wall means physically
 * power-cycling the Raspberry Pi. */
export function ConfirmShutdownDialog({
	pending,
	error,
	onConfirm,
	onCancel,
}: ConfirmShutdownDialogProps) {
	return (
		<Dialog
			role="alertdialog"
			labelledBy="confirm-shutdown-title"
			onClose={onCancel}
			className="max-w-sm"
		>
			<h3
				id="confirm-shutdown-title"
				className="pr-6 text-[15px] font-semibold text-[#20201b]"
			>
				Pi herunterfahren?
			</h3>
			<p className="mt-2 text-[13px] text-[#6b6b66]">
				Die Wand fährt sofort herunter. Zum Wiedereinschalten muss der Pi
				händisch neu gestartet werden (Stromschalter).
			</p>
			{error && (
				<p role="alert" className="mt-3 text-[13px] text-red-700">
					{error}
				</p>
			)}
			<div className="mt-5 flex justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					disabled={pending}
					className="rounded-[8px] border border-[#e4e4e0] bg-white px-3 py-2 text-[13.5px] font-medium text-[#4b4b47] disabled:opacity-60"
				>
					Abbrechen
				</button>
				<button
					type="button"
					onClick={onConfirm}
					disabled={pending}
					className="rounded-[8px] bg-red-600 px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
				>
					{pending ? "Fährt herunter…" : "Herunterfahren"}
				</button>
			</div>
		</Dialog>
	);
}
