import { useState } from "react";
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

export function Header() {
	const [showHowTo, setShowHowTo] = useState(false);

	return (
		<header className="flex h-[72px] items-center gap-3 border-b-[0.5px] border-[#595959] bg-white px-7">
			<Logo />
			<h1 className="whitespace-nowrap text-[19px] font-semibold text-[#20201b]">
				CityLAB Pixel Screens
			</h1>
			<button
				type="button"
				onClick={() => setShowHowTo(true)}
				aria-label="Anleitung"
				title="Anleitung"
				className="ml-auto flex items-center rounded-[8px] border border-[#e4e4e0] bg-white p-2 text-[13px] font-medium text-[#4b4b47] hover:bg-[#f4f4f2]"
			>
				<HelpIcon />
			</button>
			{showHowTo && <HowToDialog onClose={() => setShowHowTo(false)} />}
		</header>
	);
}
