import { TEMPLATES } from "../../domain/content";
import { NO_ANIMATION_TEMPLATE_ID } from "../../domain/types";
import type { AnimationContent, SelectionKind } from "../../domain/types";
import { SelectedBadge } from "../../render/SelectedBadge";
import { TemplateIcon } from "../../render/TemplateIcon";
import { PlacementControls } from "./PlacementControls";
import { UploadPicker } from "./UploadPicker";

const MODES: { mode: AnimationContent["mode"]; label: string }[] = [
	{ mode: "template", label: "Vorlage" },
	{ mode: "upload", label: "Hochladen" },
	{ mode: "gameOfLife", label: "Game of Life" },
];

interface AnimationPanelProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
	/** Game of Life is offered only for small-only (ESP32) selections — it
	 * runs natively there and has no equivalent on the Pi-driven large
	 * screens (see CONTEXT.md "Content" — Game of Life). A mixed selection
	 * only offers still images (see domain/mapping.ts layersForGroup). */
	screenKind: SelectionKind;
}

export function AnimationPanel({
	content,
	onChange,
	screenKind,
}: AnimationPanelProps) {
	const modes = MODES.filter(
		({ mode }) => mode !== "gameOfLife" || screenKind === "small",
	);
	const stillOnly = screenKind === "mixed";

	return (
		<div className="flex w-full flex-col gap-5">
			<div
				role="tablist"
				aria-label="Quelle"
				className="flex w-full gap-1 rounded-[8px] border border-[#e4e4e0] bg-white p-1"
			>
				{modes.map(({ mode, label }) => {
					const selected = content.mode === mode;
					return (
						<button
							key={mode}
							type="button"
							role="tab"
							aria-selected={selected}
							onClick={() => onChange({ ...content, mode })}
							className={`flex-1 rounded-[6px] px-[9px] py-[7px] text-[13.5px] font-medium ${
								selected
									? "bg-[#20201b] text-white"
									: "text-[#4b4b47] hover:bg-[#f4f4f2]"
							}`}
						>
							{label}
						</button>
					);
				})}
			</div>

			{stillOnly && (
				<p className="text-[12px] text-[#767671]">
					Animationen sind nur für große oder nur für kleine Screens möglich —
					hier stehen nur Bilder zur Auswahl.
				</p>
			)}
			{content.mode === "gameOfLife" && <GameOfLifeExplainer />}
			{content.mode === "template" && (
				<AnimationTemplatePicker
					content={content}
					onChange={onChange}
					stillOnly={stillOnly}
				/>
			)}
			{content.mode === "upload" && (
				<UploadPicker
					content={content}
					onChange={onChange}
					stillOnly={stillOnly}
				/>
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
	stillOnly: boolean;
}

function AnimationTemplatePicker({
	content,
	onChange,
	stillOnly,
}: AnimationTemplatePickerProps) {
	const templates = stillOnly
		? TEMPLATES.filter((template) => !template.animated)
		: TEMPLATES;
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
					{templates.map((template) => {
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

			<PlacementControls content={content} onChange={onChange} />
		</>
	);
}
