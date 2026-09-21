import type { ReactElement } from "react";
import {
	AlignHorizontalCenterIcon,
	AlignHorizontalLeftIcon,
	AlignHorizontalRightIcon,
	AlignVerticalBottomIcon,
	AlignVerticalCenterIcon,
	AlignVerticalTopIcon,
} from "../../render/AlignIcons";
import type { HorizontalAlign, VerticalAlign } from "../../domain/types";

const H_OPTIONS: {
	value: HorizontalAlign;
	label: string;
	icon: (className: string) => ReactElement;
}[] = [
	{
		value: "left",
		label: "Links",
		icon: (c) => <AlignHorizontalLeftIcon className={c} />,
	},
	{
		value: "center",
		label: "Mitte",
		icon: (c) => <AlignHorizontalCenterIcon className={c} />,
	},
	{
		value: "right",
		label: "Rechts",
		icon: (c) => <AlignHorizontalRightIcon className={c} />,
	},
];

const V_OPTIONS: {
	value: VerticalAlign;
	label: string;
	icon: (className: string) => ReactElement;
}[] = [
	{
		value: "top",
		label: "Oben",
		icon: (c) => <AlignVerticalTopIcon className={c} />,
	},
	{
		value: "center",
		label: "Mitte",
		icon: (c) => <AlignVerticalCenterIcon className={c} />,
	},
	{
		value: "bottom",
		label: "Unten",
		icon: (c) => <AlignVerticalBottomIcon className={c} />,
	},
];

interface AlignmentPickerProps {
	hAlign?: HorizontalAlign;
	vAlign: VerticalAlign;
	onChangeHAlign?: (value: HorizontalAlign) => void;
	onChangeVAlign: (value: VerticalAlign) => void;
}

/** Where content sits within its (possibly multi-screen) composite —
 * defaults to center. Horizontal alignment is omitted for Lauftext, whose
 * horizontal position is driven by the scroll animation itself. */
export function AlignmentPicker({
	hAlign,
	vAlign,
	onChangeHAlign,
	onChangeVAlign,
}: AlignmentPickerProps) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[12px] text-[#767671]">Position</span>
			<div className="flex flex-col gap-1.5">
				{hAlign && onChangeHAlign && (
					<div className="flex w-full gap-1.5">
						{H_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => onChangeHAlign(option.value)}
								aria-label={option.label}
								aria-pressed={hAlign === option.value}
								title={option.label}
								className={`flex flex-1 items-center justify-center rounded-[7px] border py-1.5 ${
									hAlign === option.value
										? "border-[#20201b] bg-[#20201b] text-white"
										: "border-[#e4e4e0] text-[#6b6b66]"
								}`}
							>
								{option.icon("shrink-0")}
							</button>
						))}
					</div>
				)}
				<div className="flex w-full gap-1.5">
					{V_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => onChangeVAlign(option.value)}
							aria-label={option.label}
							aria-pressed={vAlign === option.value}
							title={option.label}
							className={`flex flex-1 items-center justify-center rounded-[7px] border py-1.5 ${
								vAlign === option.value
									? "border-[#20201b] bg-[#20201b] text-white"
									: "border-[#e4e4e0] text-[#6b6b66]"
							}`}
						>
							{option.icon("shrink-0")}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
