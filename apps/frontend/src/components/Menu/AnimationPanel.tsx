import { TEMPLATES } from "../../domain/content";
import { NO_ANIMATION_TEMPLATE_ID } from "../../domain/types";
import type { AnimationContent, ScreenKind } from "../../domain/types";
import { SelectedBadge } from "../../render/SelectedBadge";
import { TemplateIcon } from "../../render/TemplateIcon";
import { AlignmentPicker } from "./AlignmentPicker";

interface AnimationPanelProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
	/** Game of Life is offered only for small (ESP32) selections — it runs
	 * natively there and has no equivalent on the Pi-driven large screens
	 * (see CONTEXT.md "Content" — Game of Life). */
	screenKind: ScreenKind;
}

export function AnimationPanel({
	content,
	onChange,
	screenKind,
}: AnimationPanelProps) {
	const isGameOfLife = content.mode === "gameOfLife";

	return (
		<div className="flex w-full flex-col gap-5">
			{screenKind === "small" && (
				<div
					role="tablist"
					aria-label="Vorlage oder Game of Life"
					className="flex w-full gap-1 rounded-[8px] border border-[#e4e4e0] bg-white p-1"
				>
					<button
						type="button"
						role="tab"
						aria-selected={!isGameOfLife}
						onClick={() => onChange({ ...content, mode: "template" })}
						className={`flex-1 rounded-[6px] px-[9px] py-[7px] text-[13.5px] font-medium ${
							!isGameOfLife
								? "bg-[#20201b] text-white"
								: "text-[#4b4b47] hover:bg-[#f4f4f2]"
						}`}
					>
						Vorlage
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={isGameOfLife}
						onClick={() => onChange({ ...content, mode: "gameOfLife" })}
						className={`flex-1 rounded-[6px] px-[9px] py-[7px] text-[13.5px] font-medium ${
							isGameOfLife
								? "bg-[#20201b] text-white"
								: "text-[#4b4b47] hover:bg-[#f4f4f2]"
						}`}
					>
						Game of Life
					</button>
				</div>
			)}

			{isGameOfLife ? (
				<GameOfLifeExplainer />
			) : (
				<AnimationTemplatePicker content={content} onChange={onChange} />
			)}
		</div>
	);
}

/** Game of Life has no template, scale, or alignment to configure — it runs
 * full-canvas, natively, with a fixed look (see CONTEXT.md "Content"). This
 * replaces those controls entirely rather than showing them disabled. */
function GameOfLifeExplainer() {
	return (
		<div className="flex flex-col items-center gap-3 rounded-md border border-[#e4e4e0] bg-[#faf9f7] px-4 py-6 text-center">
			<img
				src="/visuals/game-of-life-placeholder.svg"
				alt=""
				aria-hidden="true"
				className="h-[70px] w-[70px] rounded-[6px] object-contain"
				style={{ imageRendering: "pixelated" }}
			/>
			<p className="text-[13px] text-[#6b6b66]">
				Der Algorithmus läuft direkt auf den kleinen Screens. Jeder ausgewählte
				Screen startet mit einem eigenen zufälligen Muster und resetet sich
				automatisch neu.
			</p>
		</div>
	);
}

interface AnimationTemplatePickerProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
}

function AnimationTemplatePicker({
	content,
	onChange,
}: AnimationTemplatePickerProps) {
	return (
		<>
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
		</>
	);
}
