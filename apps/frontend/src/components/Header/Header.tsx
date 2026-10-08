import { useState } from "react";
import { shutdownWall } from "../../api/wall";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../lib/api";
import { ConfirmShutdownDialog } from "./ConfirmShutdownDialog";
import { HowToDialog } from "./HowToDialog";

function Logo() {
	return (
		<div className="relative h-[34px] w-[38px] shrink-0" aria-hidden="true">
			<div className="absolute left-0 top-[13px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[4px] top-[5px] size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[26px] top-[27px] size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[28px] top-px size-[6px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[13px] top-[6px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[13px] top-[19px] size-[12px] rounded-[1px] bg-[#20201b]" />
			<div className="absolute left-[26px] top-[9.5px] size-[12px] rounded-[1px] bg-[#20201b]" />
		</div>
	);
}

function HelpIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className="shrink-0"
		>
			<circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
			<path
				d="M6.25 6.25C6.25 5.28 7.03 4.5 8 4.5C8.97 4.5 9.75 5.28 9.75 6.25C9.75 7.06 9.2 7.48 8.68 7.82C8.27 8.09 8 8.36 8 8.85V9.25"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<circle cx="8" cy="11.5" r="0.9" fill="currentColor" />
		</svg>
	);
}

function PiIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 -960 960 960"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			className="shrink-0"
		>
			<path
				fill="currentColor"
				d="M451.5-491.5Q440-503 440-520v-320q0-17 11.5-28.5T480-880q17 0 28.5 11.5T520-840v320q0 17-11.5 28.5T480-480q-17 0-28.5-11.5Zm-112 343q-65.5-28.5-114-77t-77-114Q120-405 120-480q0-61 20-118.5T198-704q11-14 28-13.5t30 13.5q11 11 10 27t-11 30q-27 36-41 79t-14 88q0 117 81.5 198.5T480-200q117 0 198.5-81.5T760-480q0-46-13.5-89.5T704-649q-10-13-11-28.5t10-26.5q12-12 29-12.5t28 12.5q39 48 59.5 105T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120q-75 0-140.5-28.5Z"
			/>
		</svg>
	);
}

export function Header() {
	const [showHowTo, setShowHowTo] = useState(false);
	const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
	const [shutdownPending, setShutdownPending] = useState(false);
	const [shutdownError, setShutdownError] = useState<string | null>(null);
	const { request } = useAuth();

	async function handleConfirmShutdown() {
		setShutdownPending(true);
		setShutdownError(null);
		try {
			await shutdownWall(request);
			setShowShutdownConfirm(false);
		} catch (error) {
			setShutdownError(
				error instanceof ApiError
					? error.message
					: "Herunterfahren fehlgeschlagen.",
			);
		} finally {
			setShutdownPending(false);
		}
	}

	return (
		<header className="flex h-[72px] items-center gap-3 border-b-[0.5px] border-[#595959] bg-white px-7">
			<Logo />
			<h1 className="whitespace-nowrap text-[19px] font-semibold text-[#20201b]">
				CityLAB Pixel Screens
			</h1>
			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={() => {
						setShutdownError(null);
						setShowShutdownConfirm(true);
					}}
					aria-label="Pi herunterfahren"
					title="Pi herunterfahren"
					className="flex items-center gap-1.5 rounded-[8px] border border-[#e4e4e0] bg-white px-2.5 py-2 text-[13px] font-medium text-[#4b4b47] hover:bg-[#f4f4f2]"
				>
					<PiIcon />
					Pi
				</button>
				<button
					type="button"
					onClick={() => setShowHowTo(true)}
					aria-label="Anleitung"
					title="Anleitung"
					className="flex items-center rounded-[8px] border border-[#e4e4e0] bg-white p-2 text-[13px] font-medium text-[#4b4b47] hover:bg-[#f4f4f2]"
				>
					<HelpIcon />
				</button>
			</div>
			{showHowTo && <HowToDialog onClose={() => setShowHowTo(false)} />}
			{showShutdownConfirm && (
				<ConfirmShutdownDialog
					pending={shutdownPending}
					error={shutdownError}
					onConfirm={handleConfirmShutdown}
					onCancel={() => setShowShutdownConfirm(false)}
				/>
			)}
		</header>
	);
}
