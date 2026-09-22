import { useRef, type KeyboardEvent, type ReactElement } from "react";
import type { ContentType } from "../../domain/types";
import {
	AnimationTabIcon,
	CommentIcon,
	FarbeTabIcon,
} from "../../render/TabIcons";

const TABS: {
	type: ContentType;
	label: string;
	icon: (className: string) => ReactElement;
}[] = [
	{ type: "text", label: "Text", icon: (c) => <CommentIcon className={c} /> },
	{
		type: "animation",
		label: "Animation/Bild",
		icon: (c) => <AnimationTabIcon className={c} />,
	},
	{
		type: "color",
		label: "Hintergrund",
		icon: (c) => <FarbeTabIcon className={c} />,
	},
];

interface TabBarProps {
	active: ContentType;
	onChange: (type: ContentType) => void;
}

/** A connected segmented control rather than separate pill buttons, with the
 * roving-tabindex + arrow-key navigation the `role="tab"` pattern expects
 * (previously missing — a real, if minor, a11y gap). */
export function TabBar({ active, onChange }: TabBarProps) {
	const buttonRefs = useRef<Partial<Record<ContentType, HTMLButtonElement>>>(
		{},
	);

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const currentIndex = TABS.findIndex((tab) => tab.type === active);
		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") {
			nextIndex = (currentIndex + 1) % TABS.length;
		} else if (event.key === "ArrowLeft") {
			nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = TABS.length - 1;
		}
		if (nextIndex !== null) {
			event.preventDefault();
			const next = TABS[nextIndex].type;
			onChange(next);
			buttonRefs.current[next]?.focus();
		}
	}

	return (
		<div
			role="tablist"
			className="flex w-full items-stretch gap-1 rounded-[8px] border border-[#e4e4e0] bg-white p-1"
		>
			{TABS.map((tab) => {
				const isActive = active === tab.type;
				return (
					<button
						key={tab.type}
						ref={(el) => {
							buttonRefs.current[tab.type] = el ?? undefined;
						}}
						id={`tab-${tab.type}`}
						type="button"
						role="tab"
						aria-selected={isActive}
						aria-controls={`panel-${tab.type}`}
						tabIndex={isActive ? 0 : -1}
						onClick={() => onChange(tab.type)}
						onKeyDown={handleKeyDown}
						className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-[9px] py-[7px] text-[13.5px] font-medium ${
							isActive
								? "bg-[#20201b] text-white"
								: "text-[#4b4b47] hover:bg-[#f4f4f2]"
						}`}
					>
						{tab.icon("shrink-0")}
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
