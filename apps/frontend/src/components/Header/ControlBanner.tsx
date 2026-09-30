import { useState } from "react";
import { useControl } from "../../auth/ControlContext";

/** Shown to everyone watching while another device controls the wall. */
export function ControlBanner() {
	const { isController, takeOver, takingOver } = useControl();
	const [error, setError] = useState(false);

	if (isController) {
		return null;
	}

	async function handleTakeOver() {
		setError(false);
		try {
			await takeOver();
		} catch {
			setError(true);
		}
	}

	return (
		<div
			role="alert"
			className="flex items-center justify-between gap-4 border-b border-[#f0c36d] bg-[#fff6e0] px-7 py-2.5 text-[13px] text-[#5c4300]"
		>
			<span>
				Die Wand wird gerade von einem anderen Gerät gesteuert. Du kannst
				zuschauen, aber keine Änderungen speichern.
				{error && " Übernehmen ist fehlgeschlagen."}
			</span>
			<button
				type="button"
				onClick={handleTakeOver}
				disabled={takingOver}
				className="shrink-0 whitespace-nowrap rounded-[8px] bg-[#20201b] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
			>
				{takingOver ? "Wird übernommen…" : "Kontrolle übernehmen"}
			</button>
		</div>
	);
}
