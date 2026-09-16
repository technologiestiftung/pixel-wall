import type { HorizontalAlign, VerticalAlign } from "../../domain/types";

const H_OPTIONS: { value: HorizontalAlign; label: string }[] = [
	{ value: "left", label: "Links" },
	{ value: "center", label: "Mitte" },
	{ value: "right", label: "Rechts" },
];

const V_OPTIONS: { value: VerticalAlign; label: string }[] = [
	{ value: "top", label: "Oben" },
	{ value: "center", label: "Mitte" },
	{ value: "bottom", label: "Unten" },
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
								className={`flex-1 rounded-[7px] border py-1.5 text-[12.5px] ${
									hAlign === option.value
										? "border-[#20201b] bg-[#20201b] font-medium text-white"
										: "border-[#e4e4e0] text-[#6b6b66]"
								}`}
							>
								{option.label}
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
							className={`flex-1 rounded-[7px] border py-1.5 text-[12.5px] ${
								vAlign === option.value
									? "border-[#20201b] bg-[#20201b] font-medium text-white"
									: "border-[#e4e4e0] text-[#6b6b66]"
							}`}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
