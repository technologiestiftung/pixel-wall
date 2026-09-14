import type { ReactElement } from "react";
import type { ContentType } from "../../domain/types";
import { AnimationTabIcon, CommentIcon, FarbeTabIcon } from "../../render/TabIcons";

const TABS: { type: ContentType; label: string; icon: (className: string) => ReactElement }[] = [
	{ type: "text", label: "Text", icon: (c) => <CommentIcon className={c} /> },
	{ type: "animation", label: "Animation/Bild", icon: (c) => <AnimationTabIcon className={c} /> },
	{ type: "color", label: "Farbe", icon: (c) => <FarbeTabIcon className={c} /> },
];

interface TabBarProps {
	active: ContentType;
	onChange: (type: ContentType) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
	return (
		<div role="tablist" className="flex w-full items-start gap-1.5">
			{TABS.map((tab) => {
				const isActive = active === tab.type;
				return (
					<button
						key={tab.type}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => onChange(tab.type)}
						className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] border p-[9px] text-[13.5px] font-medium ${
							isActive ? "border-[#20201b] bg-[#20201b] text-white" : "border-[#e4e4e0] bg-white text-[#4b4b47]"
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
