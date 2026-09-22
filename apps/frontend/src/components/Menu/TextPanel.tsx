import { LOOP_PAUSE_MS } from "../../domain/content";
import type { TextContent } from "../../domain/types";
import { ChevronDownIcon } from "../../render/TabIcons";
import { AlignmentPicker } from "./AlignmentPicker";

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

			<div className="flex w-full items-end gap-2.5">
				<div className="flex flex-col gap-2">
					<label className="text-[12px] text-[#767671]" htmlFor="font-size">
						Textgröße
					</label>
					<div className="flex w-[98px] items-center rounded-[7px] border border-[#dededa]">
						<input
							id="font-size"
							type="number"
							min={8}
							max={64}
							value={content.fontSizePx}
							onChange={(e) =>
								onChange({ ...content, fontSizePx: Number(e.target.value) })
							}
							className="w-full min-w-0 flex-1 px-3 py-2.5 text-[14px] text-[#20201b]"
						/>
						<span className="shrink-0 border-l border-[#edede9] px-2.5 py-2.5 text-[12.5px] text-[#767671]">
							px
						</span>
					</div>
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<label className="text-[12px] text-[#767671]" htmlFor="text-color">
						Textfarbe
					</label>
					<div className="flex w-full items-center gap-2.5 rounded-[7px] border border-[#dededa] px-2.5 py-[7px]">
						<input
							id="text-color"
							type="color"
							value={content.color}
							onChange={(e) => onChange({ ...content, color: e.target.value })}
							className="size-7 shrink-0 cursor-pointer rounded-[6px] border border-[#e5e4df] bg-transparent p-0"
						/>
						<span className="truncate font-mono text-[13px] uppercase text-[#20201b]">
							{content.color}
						</span>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="font-family">
					Schriftart
				</label>
				<div className="flex w-full gap-2.5">
					<div className="relative flex-1">
						<select
							id="font-family"
							value={content.fontFamily}
							onChange={(e) =>
								onChange({ ...content, fontFamily: e.target.value })
							}
							className="w-full appearance-none rounded-[7px] border border-[#dededa] px-[11px] py-2.5 text-[13px] text-[#20201b]"
						>
							<option value="Host Grotesk, ui-monospace, monospace">
								Host Grotesk
							</option>
							<option value="Pixelify Sans, ui-monospace, monospace">
								Pixelify Sans
							</option>
							<option value="ui-monospace, monospace">Monospace</option>
							
						</select>
						<ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[#8a8a85]" />
					</div>
					<div className="relative flex-1">
						<select
							aria-label="Schriftschnitt"
							value={content.fontWeight}
							onChange={(e) =>
								onChange({ ...content, fontWeight: e.target.value })
							}
							className="w-full appearance-none rounded-[7px] border border-[#dededa] px-[11px] py-2.5 text-[13px] text-[#20201b]"
						>
							<option value="400">Regular</option>
							<option value="700">Bold</option>
						</select>
						<ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[#8a8a85]" />
					</div>
				</div>
			</div>

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

			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="padding">
					Abstand zum Rand
				</label>
				<div className="flex w-[98px] items-center rounded-[7px] border border-[#dededa]">
					<input
						id="padding"
						type="number"
						min={0}
						max={8}
						value={content.paddingPx ?? 0}
						onChange={(e) =>
							onChange({ ...content, paddingPx: Number(e.target.value) })
						}
						className="w-full min-w-0 flex-1 px-3 py-2.5 text-[14px] text-[#20201b]"
					/>
					<span className="shrink-0 border-l border-[#edede9] px-2.5 py-2.5 text-[12.5px] text-[#767671]">
						px
					</span>
				</div>
			</div>

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
