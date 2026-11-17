import { LOOP_PAUSE_MS } from "../../domain/content";
import {
	DEFAULT_PFADTEXT_PATH_ID,
	PFADTEXT_PATHS,
} from "../../domain/pfadtextPath";
import type { TextContent } from "../../domain/types";
import { PathThumbnail } from "../../render/PathThumbnail";
import { AlignmentPicker } from "./AlignmentPicker";
import { TemplateTile } from "./AnimationPanel";
import { ColorPicker } from "./ColorPicker";
import { FontField, FontSizeField, PaddingField } from "./TextStyleFields";

function textModesFor(
	pathAllowed: boolean,
): ChoiceOption<TextContent["mode"]>[] {
	const base: ChoiceOption<TextContent["mode"]>[] = [
		{ value: "static", label: "Statischer Text" },
		{ value: "scrolling", label: "Lauftext" },
	];
	// Pfadtext only ever applies to exactly the 4 large screens (see
	// CONTEXT.md "Content") — hidden rather than shown disabled otherwise,
	// same pattern as templatesFor hiding animated templates for a mixed
	// selection (domain/content.ts).
	return pathAllowed ? [...base, { value: "path", label: "Pfadtext" }] : base;
}

const ABLAUF_OPTIONS: ChoiceOption<"static" | "running">[] = [
	{ value: "static", label: "Statisch" },
	{ value: "running", label: "Laufend" },
];

const POSITION_OPTIONS: ChoiceOption<
	NonNullable<TextContent["pathPosition"]>
>[] = [
	{ value: "start", label: "Start" },
	{ value: "middle", label: "Mitte" },
	{ value: "end", label: "Ende" },
];

/** Lauftext always scrolls left/right; running Pfadtext reuses the same
 * `direction` field to travel along its (not necessarily horizontal) path,
 * so the editor relabels the two options rather than adding a new field —
 * see domain/types.ts's TextContent.direction. */
function directionsFor(
	mode: TextContent["mode"],
): ChoiceOption<NonNullable<TextContent["direction"]>>[] {
	return mode === "path"
		? [
				{ value: "right", label: "Vorwärts" },
				{ value: "left", label: "Rückwärts" },
			]
		: [
				{ value: "left", label: "Links" },
				{ value: "right", label: "Rechts" },
			];
}

interface TextPanelProps {
	content: TextContent;
	onChange: (content: TextContent) => void;
	/** Whether the selection is exactly the 4 large screens, the one shape
	 * Pfadtext is offered for (see CONTEXT.md "Content"). */
	pathAllowed: boolean;
}

export function TextPanel({ content, onChange, pathAllowed }: TextPanelProps) {
	const isPath = content.mode === "path";
	const isRunning = isPath && (content.pathRunning ?? false);

	return (
		<div className="flex w-full flex-col gap-5">
			<ChoiceGroup
				id="textart"
				label="Textart"
				options={textModesFor(pathAllowed)}
				value={content.mode}
				onChange={(mode) =>
					onChange(
						mode === "path"
							? {
									...content,
									mode,
									pathRunning: content.pathRunning ?? false,
									pathPosition: content.pathPosition ?? "middle",
									pathId: content.pathId ?? DEFAULT_PFADTEXT_PATH_ID,
								}
							: { ...content, mode },
					)
				}
			/>

			{isPath && (
				<PathPicker
					value={content.pathId ?? DEFAULT_PFADTEXT_PATH_ID}
					onChange={(pathId) => onChange({ ...content, pathId })}
				/>
			)}

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

			{isPath ? (
				<>
					<ChoiceGroup
						id="pfad-ablauf"
						label="Ablauf"
						options={ABLAUF_OPTIONS}
						value={isRunning ? "running" : "static"}
						onChange={(value) =>
							onChange({ ...content, pathRunning: value === "running" })
						}
					/>
					{!isRunning && (
						<ChoiceGroup
							id="pfad-position"
							label="Position"
							options={POSITION_OPTIONS}
							value={content.pathPosition ?? "middle"}
							onChange={(pathPosition) =>
								onChange({ ...content, pathPosition })
							}
						/>
					)}
				</>
			) : (
				<>
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
				</>
			)}

			{(content.mode === "scrolling" || isRunning) && (
				<>
					<ChoiceGroup
						id="direction"
						label="Richtung"
						options={directionsFor(content.mode)}
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

/** Which of the fixed built-in curved paths (PFADTEXT_PATHS) Pfadtext
 * follows — thumbnails of the actual curve through the 4 large screens, same
 * tile chrome as the Animation/Bild template grid (AnimationPanel.tsx's
 * TemplateTile) so the two pickers read as the same kind of choice. */
function PathPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (pathId: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2.5">
			<span className="w-full text-[12px] text-[#767671]">Pfad wählen</span>
			<div className="flex flex-wrap items-start gap-x-3 gap-y-3.5">
				{PFADTEXT_PATHS.map((option) => (
					<TemplateTile
						key={option.id}
						label={option.label}
						selected={value === option.id}
						onSelect={() => onChange(option.id)}
					>
						<PathThumbnail option={option} className="h-[40px] w-[58px]" />
					</TemplateTile>
				))}
			</div>
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
