import { useCallback, useEffect, useState } from "react";
import { getSnake, putSnake } from "../../api/wall";
import type { SnakeStatusDto } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";

const POLL_MS = 5000;

const PHASE_LABEL: Record<SnakeStatusDto["phase"], string> = {
	off: "",
	lobby: "QR-Code wird angezeigt",
	playing: "Es wird gespielt",
	over: "Runde vorbei",
};

/** Switches the whole wall into the snake game and back. The applied content
 * is kept by the backend while the game runs, so switching off restores it. */
export function SnakeToggle() {
	const { request } = useAuth();
	const [status, setStatus] = useState<SnakeStatusDto | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setStatus(await getSnake(request));
		} catch {
			setStatus(null);
		}
	}, [request]);

	useEffect(() => {
		void refresh();
		const timer = window.setInterval(() => void refresh(), POLL_MS);
		return () => window.clearInterval(timer);
	}, [refresh]);

	async function toggle() {
		if (status === null) {
			return;
		}
		setPending(true);
		setError(null);
		try {
			setStatus(await putSnake(request, !status.enabled));
		} catch {
			setError("Snake-Modus konnte nicht umgeschaltet werden");
		} finally {
			setPending(false);
		}
	}

	if (status === null) {
		return null;
	}

	return (
		<div className="ml-auto flex items-center gap-3 text-[13px] text-[#6b6b66]">
			{error && <span className="text-red-700">{error}</span>}
			{status.enabled && (
				<span>
					{PHASE_LABEL[status.phase]}
					{status.joinUrl && (
						<>
							{" · "}
							<a
								href={status.joinUrl}
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								{status.joinUrl}
							</a>
						</>
					)}
				</span>
			)}
			<button
				type="button"
				onClick={() => void toggle()}
				disabled={pending}
				aria-pressed={status.enabled}
				className={`whitespace-nowrap rounded-[8px] px-3 py-2 text-[13.5px] font-semibold disabled:opacity-40 ${
					status.enabled
						? "bg-[#20201b] text-white"
						: "border border-[#20201b] text-[#20201b]"
				}`}
			>
				{status.enabled ? "Snake beenden" : "Snake starten"}
			</button>
		</div>
	);
}
