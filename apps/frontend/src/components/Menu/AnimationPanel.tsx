import {
	ANIMATION_FPS_MAX,
	ANIMATION_FPS_MIN,
	DEFAULT_ANIMATION_FPS,
	TEMPLATES,
} from "../../domain/content";
import type { AnimationContent } from "../../domain/types";
import { SelectedBadge } from "../../render/SelectedBadge";
import { TemplateIcon } from "../../render/TemplateIcon";
import { AlignmentPicker } from "./AlignmentPicker";

interface AnimationPanelProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
}

export function AnimationPanel({ content, onChange }: AnimationPanelProps) {
	const selectedTemplate = TEMPLATES.find((t) => t.id === content.templateId);
	return (
		<div className="flex w-full flex-col gap-5">
			<div className="flex flex-col gap-2.5">
				<span className="w-full text-[12px] text-[#767671]">
					Bild oder Animation wählen
				</span>
				<div className="flex flex-wrap items-start gap-x-3 gap-y-3.5">
					{TEMPLATES.map((template) => {
						const selected = content.templateId === template.id;
						return (
							<button
								key={template.id}
								type="button"
								onClick={() =>
									onChange({ ...content, templateId: template.id })
								}
								className="flex flex-col items-center gap-1.5"
							>
								<div
									className={`relative flex h-[58px] w-[70px] items-center justify-center rounded-[10px] border bg-[#2a2a27] ${
										selected
											? "border-[1.6px] border-[#171717]"
											: "border-[#dededa]"
									}`}
								>
									<TemplateIcon
										templateId={template.id}
										className="h-[40px] w-[40px] object-contain"
									/>
									{selected && (
										<SelectedBadge className="absolute -right-2 -top-2.5 h-4 w-4" />
									)}
								</div>
								<span
									className={`text-[11px] ${selected ? "text-[#171717]" : "text-[#767671]"}`}
								>
									{template.label}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="scale">
					Skalierung
				</label>
				<div className="flex items-center gap-3">
					<input
						id="scale"
						type="range"
						min={25}
						max={400}
						value={content.scalePercent}
						onChange={(e) =>
							onChange({ ...content, scalePercent: Number(e.target.value) })
						}
						className="flex-1"
					/>
					<span className="w-12 shrink-0 text-right text-[13px] text-[#6b6b66]">
						{content.scalePercent}%
					</span>
				</div>
			</div>

			{selectedTemplate?.animated && (
				<div className="flex flex-col gap-2">
					<label className="text-[12px] text-[#767671]" htmlFor="fps">
						Bildrate (zum Testen auf der Wand)
					</label>
					<div className="flex items-center gap-3">
						<input
							id="fps"
							type="range"
							min={ANIMATION_FPS_MIN}
							max={ANIMATION_FPS_MAX}
							value={content.fps ?? DEFAULT_ANIMATION_FPS}
							onChange={(e) =>
								onChange({ ...content, fps: Number(e.target.value) })
							}
							className="flex-1"
						/>
						<span className="w-16 shrink-0 text-right text-[13px] text-[#6b6b66]">
							{content.fps ?? DEFAULT_ANIMATION_FPS} fps
						</span>
					</div>
				</div>
			)}

			<AlignmentPicker
				hAlign={content.hAlign}
				vAlign={content.vAlign}
				onChangeHAlign={(hAlign) => onChange({ ...content, hAlign })}
				onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
			/>
		</div>
	);
}
