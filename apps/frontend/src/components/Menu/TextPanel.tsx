import { LOOP_PAUSE_MS } from "../../domain/content";
import type { TextContent } from "../../domain/types";
import { AlignmentPicker } from "./AlignmentPicker";
import { ColorPicker } from "./ColorPicker";
import { FontField, FontSizeField, PaddingField } from "./TextStyleFields";

const TEXT_MODES: ChoiceOption<TextContent["mode"]>[] = [
	{ value: "static", label: "Statischer Text" },
	{ value: "scrolling", label: "Lauftext" },
];

const DIRECTIONS: ChoiceOption<NonNullable<TextContent["direction"]>>[] = [
	{ value: "left", label: "Links" },
	{ value: "right", label: "Rechts" },
];

interface TextPanelProps {
	content: TextContent;
	onChange: (content: TextContent) => void;
}

export function TextPanel({ content, onChange }: TextPanelProps) {
	return (
		<div className="flex w-full flex-col gap-5">
			<ChoiceGroup
				id="textart"
				label="Textart"
				options={TEXT_MODES}
				value={content.mode}
				onChange={(mode) => onChange({ ...content, mode })}
			/>

			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="text-value">
					Text
				</label>
				<textarea
					id="text-value"
					value={content.value}
					onChange={(e) => onChange({ ...content, value: e.target.value })}
					rows={2}
					className="w-full rounded-[7px] border border-[#dededa] px-3 py-2.5 text-[14px] text-[#20201b]"
				/>
			</div>

			<FontSizeField
				id="font-size"
				value={content.fontSizePx}
				onChange={(fontSizePx) => onChange({ ...content, fontSizePx })}
			/>

			<ColorPicker
				hex={content.color}
				onChange={(color) => onChange({ ...content, color })}
				label="Textfarbe wählen"
			/>

			<FontField
				id="font-family"
				fontFamily={content.fontFamily}
				fontWeight={content.fontWeight}
				onChange={(font) => onChange({ ...content, ...font })}
			/>

			<AlignmentPicker
				hAlign={content.mode === "static" ? content.hAlign : undefined}
				vAlign={content.vAlign}
				onChangeHAlign={(hAlign) => onChange({ ...content, hAlign })}
				onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
			/>

			<PaddingField
				id="padding"
				value={content.paddingPx ?? 0}
				onChange={(paddingPx) => onChange({ ...content, paddingPx })}
			/>

			{content.mode === "scrolling" && (
				<>
					<ChoiceGroup
						id="direction"
						label="Richtung"
						options={DIRECTIONS}
						value={content.direction}
						onChange={(direction) => onChange({ ...content, direction })}
					/>

					<div className="flex w-full items-end gap-2.5">
						<div className="flex flex-col gap-2">
							<label className="text-[12px] text-[#767671]" htmlFor="speed">
								Geschwindigkeit
							</label>
							<div className="flex w-[98px] items-center rounded-[7px] border border-[#dededa]">
								<input
									id="speed"
									type="number"
									min={5}
									max={500}
									value={content.speedPxPerSec}
									onChange={(e) =>
										onChange({
											...content,
											speedPxPerSec: Number(e.target.value),
										})
									}
									className="w-full min-w-16 flex-1 px-3 py-2.5 text-[14px] text-[#20201b]"
								/>
								<span className="shrink-0 border-l border-[#edede9] px-1 py-2.5 text-[12.5px] text-[#767671]">
									px/s
								</span>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<label className="text-[12px] text-[#767671]" htmlFor="pause">
								Pause
							</label>
							<div className="flex w-[86px] items-center rounded-[7px] border border-[#dededa]">
								<input
									id="pause"
									type="number"
									min={0}
									max={5}
									step={0.5}
									value={(content.pauseMs ?? LOOP_PAUSE_MS) / 1000}
									onChange={(e) =>
										onChange({
											...content,
											pauseMs: Number(e.target.value) * 1000,
										})
									}
									className="w-full min-w-0 flex-1 px-3 py-2.5 text-[14px] text-[#20201b]"
								/>
								<span className="shrink-0 border-l border-[#edede9] px-2.5 py-2.5 text-[12.5px] text-[#767671]">
									s
								</span>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

interface ChoiceOption<T> {
	value: T;
	label: string;
}

function ChoiceGroup<T extends string>({
	id,
	label,
	options,
	value,
	onChange,
}: {
	id: string;
	label: string;
	options: ChoiceOption<T>[];
	value: T | undefined;
	onChange: (next: T) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label className="text-[12px] text-[#767671]" htmlFor={id}>
				{label}
			</label>
			<div id={id} className="flex w-full gap-1.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => onChange(option.value)}
						className={`flex-1 rounded-[7px] border py-2 text-[13px] ${
							value === option.value
								? "border-[#20201b] bg-[#20201b] font-medium text-white"
								: "border-[#e4e4e0] text-[#6b6b66]"
						}`}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}
