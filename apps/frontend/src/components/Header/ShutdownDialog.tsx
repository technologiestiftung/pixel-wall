import { useEffect, useState } from "react";
import {
	getShutdownSchedule,
	setShutdownSchedule,
	shutdownWall,
} from "../../api/wall";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../lib/api";
import { Dialog } from "../Dialog";

const DEFAULT_SHUTDOWN_AT = "18:00";

interface ShutdownDialogProps {
	onClose: () => void;
}

/** Shuts the wall down now, or sets the daily time it shuts down on its own
 * — see CONTEXT.md "Power". There is no software "on": turning the wall back
 * on means physically power-cycling the Raspberry Pi. */
export function ShutdownDialog({ onClose }: ShutdownDialogProps) {
	const { request } = useAuth();
	const [scheduledAt, setScheduledAt] = useState(DEFAULT_SHUTDOWN_AT);
	const [draftAt, setDraftAt] = useState(DEFAULT_SHUTDOWN_AT);
	const [loadingSchedule, setLoadingSchedule] = useState(true);
	const [savingSchedule, setSavingSchedule] = useState(false);
	const [shuttingDown, setShuttingDown] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		getShutdownSchedule(request)
			.then(({ at }) => {
				if (!cancelled) {
					setScheduledAt(at);
					setDraftAt(at);
				}
			})
			.catch(() => {
				// Keep the default — the dialog still works, it just can't show
				// today's actual configured time.
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingSchedule(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [request]);

	async function handleShutdownNow() {
		setShuttingDown(true);
		setError(null);
		try {
			await shutdownWall(request);
			onClose();
		} catch (caught) {
			setError(
				caught instanceof ApiError
					? caught.message
					: "Herunterfahren fehlgeschlagen.",
			);
		} finally {
			setShuttingDown(false);
		}
	}

	async function handleSaveSchedule() {
		setSavingSchedule(true);
		setError(null);
		try {
			const saved = await setShutdownSchedule(request, draftAt);
			setScheduledAt(saved.at);
			setDraftAt(saved.at);
		} catch (caught) {
			setError(
				caught instanceof ApiError
					? caught.message
					: "Uhrzeit konnte nicht gespeichert werden.",
			);
		} finally {
			setSavingSchedule(false);
		}
	}

	const busy = shuttingDown || savingSchedule;
	const scheduleChanged = draftAt !== scheduledAt;

	return (
		<Dialog
			role="alertdialog"
			labelledBy="shutdown-title"
			onClose={onClose}
			className="max-w-sm"
		>
			<h3
				id="shutdown-title"
				className="pr-6 text-[15px] font-semibold text-[#20201b]"
			>
				Pi herunterfahren
			</h3>
			<p className="mt-2 text-[13px] text-[#6b6b66]">
				Zum Wiedereinschalten muss der Pi händisch neu gestartet werden
				(Stromschalter) — es gibt keine Software-Einschaltung.
			</p>

			<button
				type="button"
				onClick={handleShutdownNow}
				disabled={busy}
				className="mt-4 w-full rounded-[8px] bg-red-600 px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
			>
				{shuttingDown ? "Fährt herunter…" : "Jetzt herunterfahren"}
			</button>

			<div className="mt-4 border-t border-[#e4e4e0] pt-4">
				<label
					htmlFor="shutdown-at"
					className="block text-[13px] font-medium text-[#4b4b47]"
				>
					Tägliche Uhrzeit zum Herunterfahren
				</label>
				<div className="mt-2 flex gap-2">
					<input
						id="shutdown-at"
						type="time"
						value={draftAt}
						disabled={loadingSchedule || busy}
						onChange={(event) => setDraftAt(event.target.value)}
						className="flex-1 rounded-[8px] border border-[#e4e4e0] px-3 py-2 text-[13.5px] text-[#20201b] disabled:opacity-60"
					/>
					<button
						type="button"
						onClick={handleSaveSchedule}
						disabled={loadingSchedule || busy || !scheduleChanged}
						className="rounded-[8px] bg-[#006fff] px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
					>
						{savingSchedule ? "Speichert…" : "Übernehmen"}
					</button>
				</div>
				<p className="mt-1.5 text-[12px] text-[#9a9a94]">
					Ohne Änderung gilt die Standardzeit 18:00.
				</p>
			</div>

			{error && (
				<p role="alert" className="mt-3 text-[13px] text-red-700">
					{error}
				</p>
			)}
		</Dialog>
	);
}
