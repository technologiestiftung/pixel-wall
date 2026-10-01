import { LOOP_PAUSE_MS } from "../../domain/content";
import type { TextContent } from "../../domain/types";
import { AlignmentPicker } from "./AlignmentPicker";
import { ColorPicker } from "./ColorPicker";
import { FontField, FontSizeField, PaddingField } from "./TextStyleFields";

interface TextPanelProps {
	content: TextContent;
	onChange: (content: TextContent) => void;
}

export function TextPanel({ content, onChange }: TextPanelProps) {
	return (
		<div className="flex w-full flex-col gap-5">
			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="textart">
					Textart
				</label>
				<div id="textart" className="flex w-full gap-1.5">
					{(["static", "scrolling"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => onChange({ ...content, mode })}
							className={`flex-1 rounded-[7px] border py-2 text-[13px] ${
								content.mode === mode
									? "border-[#20201b] bg-[#20201b] font-medium text-white"
									: "border-[#e4e4e0] text-[#6b6b66]"
							}`}
						>
							{mode === "static" ? "Statischer Text" : "Lauftext"}
						</button>
					))}
				</div>
			</div>

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

			{content.mode === "static" ? (
				<AlignmentPicker
					hAlign={content.hAlign}
					vAlign={content.vAlign}
					onChangeHAlign={(hAlign) => onChange({ ...content, hAlign })}
					onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
				/>
			) : (
				<AlignmentPicker
					vAlign={content.vAlign}
					onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
				/>
			)}

			<PaddingField
				id="padding"
				value={content.paddingPx ?? 0}
				onChange={(paddingPx) => onChange({ ...content, paddingPx })}
			/>

			{content.mode === "scrolling" && (
				<>
					<div className="flex flex-col gap-2">
						<label className="text-[12px] text-[#767671]" htmlFor="direction">
							Richtung
						</label>
						<div id="direction" className="flex w-full gap-1.5">
							{(["left", "right"] as const).map((direction) => (
								<button
									key={direction}
									type="button"
									onClick={() => onChange({ ...content, direction })}
									className={`flex-1 rounded-[7px] border py-2 text-[13px] ${
										content.direction === direction
											? "border-[#20201b] bg-[#20201b] font-medium text-white"
											: "border-[#e4e4e0] text-[#6b6b66]"
									}`}
								>
									{direction === "left" ? "Links" : "Rechts"}
								</button>
							))}
						</div>
					</div>

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
