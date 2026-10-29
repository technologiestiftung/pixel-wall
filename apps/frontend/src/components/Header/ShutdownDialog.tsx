import { useState } from "react";
import { shutDown } from "../../api/wall";
import { useAuth } from "../../auth/AuthContext";
import { Dialog } from "../Dialog";

type ShutdownStatus = "idle" | "pending" | "done" | "error";

interface ShutdownDialogProps {
	onClose: () => void;
}

export function ShutdownDialog({ onClose }: ShutdownDialogProps) {
	const { request } = useAuth();
	const [status, setStatus] = useState<ShutdownStatus>("idle");
	const [error, setError] = useState<string | null>(null);

	async function handleShutDown() {
		setStatus("pending");
		setError(null);
		try {
			await shutDown(request);
			setStatus("done");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
			setStatus("error");
		}
	}

	if (status === "done") {
		return (
			<Dialog
				role="alertdialog"
				aria-modal
				labelledBy="shutdown-title"
				onClose={onClose}
				className="max-w-md"
			>
				<h2
					id="shutdown-title"
					className="pr-6 text-[17px] font-semibold text-[#20201b]"
				>
					Die Wand wird ausgeschaltet
				</h2>
				<p className="mt-3 text-[13.5px] text-[#4b4b47]">
					Warte etwa 30 Sekunden, bis die grüne Lampe am Raspberry Pi nicht mehr
					blinkt. Danach kann der Strom sicher getrennt werden.
				</p>
				<div className="mt-6 flex justify-end">
					<button
						type="button"
						onClick={onClose}
						className="rounded-[8px] bg-[#006fff] px-3 py-2 text-[13.5px] font-semibold text-white"
					>
						Schließen
					</button>
				</div>
			</Dialog>
		);
	}

	return (
		<Dialog
			role="alertdialog"
			aria-modal
			labelledBy="shutdown-title"
			onClose={onClose}
			className="max-w-md"
		>
			<h2
				id="shutdown-title"
				className="pr-6 text-[17px] font-semibold text-[#20201b]"
			>
				Wand ausschalten?
			</h2>
			<p className="mt-3 text-[13.5px] text-[#4b4b47]">
				Alle Bildschirme werden dunkel und der Raspberry Pi fährt herunter. Die
				gespeicherten Inhalte bleiben erhalten und erscheinen wieder, sobald die
				Wand eingeschaltet wird.
			</p>
			<p className="mt-2 text-[13.5px] text-[#4b4b47]">
				Zum Einschalten muss jemand vor Ort den Strom des Raspberry Pi kurz
				trennen und wieder verbinden.
			</p>
			{status === "error" && (
				<div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
					Ausschalten fehlgeschlagen: {error}
				</div>
			)}
			<div className="mt-6 flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded-[8px] border border-[#e4e4e0] bg-white px-3 py-2 text-[13.5px] font-medium text-[#4b4b47] hover:bg-[#f4f4f2]"
				>
					Abbrechen
				</button>
				<button
					type="button"
					onClick={handleShutDown}
					disabled={status === "pending"}
					className="rounded-[8px] bg-[#c62828] px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
				>
					{status === "pending" ? "Wird ausgeschaltet…" : "Ausschalten"}
				</button>
			</div>
		</Dialog>
	);
}
