import { TEMPLATES } from "../../domain/content";
import { NO_ANIMATION_TEMPLATE_ID } from "../../domain/types";
import type { AnimationContent } from "../../domain/types";
import { SelectedBadge } from "../../render/SelectedBadge";
import { TemplateIcon } from "../../render/TemplateIcon";
import { AlignmentPicker } from "./AlignmentPicker";

interface AnimationPanelProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
}

export function AnimationPanel({ content, onChange }: AnimationPanelProps) {
	return (
		<div className="flex w-full flex-col gap-5">
			<div className="flex flex-col gap-2.5">
				<span className="w-full text-[12px] text-[#767671]">
					Bild oder Animation wählen
				</span>
				<div className="flex flex-wrap items-start gap-x-3 gap-y-3.5">
					<button
						type="button"
						onClick={() =>
							onChange({ ...content, templateId: NO_ANIMATION_TEMPLATE_ID })
						}
						aria-label="Ohne"
						title="Ohne"
						className="flex flex-col items-center gap-1.5"
					>
						<div
							className={`relative flex h-[58px] w-[70px] items-center justify-center rounded-[10px] border bg-[#2a2a27] ${
								content.templateId === NO_ANIMATION_TEMPLATE_ID
									? "border-[1.6px] border-[#171717]"
									: "border-[#dededa]"
							}`}
						>
							<svg
								className="h-[40px] w-[40px]"
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
							>
								<circle
									cx="12"
									cy="12"
									r="9"
									stroke="#767671"
									strokeWidth="1.5"
								/>
								<line
									x1="6"
									y1="18"
									x2="18"
									y2="6"
									stroke="#767671"
									strokeWidth="1.5"
								/>
							</svg>
							{content.templateId === NO_ANIMATION_TEMPLATE_ID && (
								<SelectedBadge className="absolute -right-2 -top-2.5 h-4 w-4" />
							)}
						</div>
					</button>
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

			<AlignmentPicker
				hAlign={content.hAlign}
				vAlign={content.vAlign}
				onChangeHAlign={(hAlign) => onChange({ ...content, hAlign })}
				onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
			/>
		</div>
	);
}
