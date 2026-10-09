import { useState } from "react";
import { HowToDialog } from "./HowToDialog";
import { ShutdownDialog } from "./ShutdownDialog";

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
			xmlns="http://www.w3.org/2000/svg"
			height="16"
			viewBox="0 -960 960 960"
			width="16"
			fill="currentColor"
		>
			<path d="M424-320q0-81 14.5-116.5T500-514q41-36 62.5-62.5T584-637q0-41-27.5-68T480-732q-51 0-77.5 31T365-638l-103-44q21-64 77-111t141-47q105 0 161.5 58.5T698-641q0 50-21.5 85.5T609-475q-49 47-59.5 71.5T539-320H424Zm56 240q-33 0-56.5-23.5T400-160q0-33 23.5-56.5T480-240q33 0 56.5 23.5T560-160q0 33-23.5 56.5T480-80Z" />
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
	const [showShutdown, setShowShutdown] = useState(false);

	return (
		<header className="flex h-[72px] items-center gap-3 border-b-[0.5px] border-[#595959] bg-white px-7">
			<Logo />
			<h1 className="whitespace-nowrap text-[19px] font-semibold text-[#20201b]">
				CityLAB Pixel Screens
			</h1>
			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={() => setShowShutdown(true)}
					aria-label="Pi herunterfahren"
					title="Pi herunterfahren"
					className="flex items-center gap-1.5 rounded-[8px] border border-[#e4e4e0] bg-white p-2 text-xs font-medium text-[#4b4b47] hover:bg-[#f4f4f2]"
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
			{showShutdown && (
				<ShutdownDialog onClose={() => setShowShutdown(false)} />
			)}
		</header>
	);
}
