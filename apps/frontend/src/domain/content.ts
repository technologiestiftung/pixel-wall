import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	TextContent,
} from "./types";

export interface Template {
	id: string;
	label: string;
	/** SVG file name under `public/visuals/`. */
	file: string;
}

/** Fixed built-in template library (no user upload in v1), sourced from the
 * SVGs under `public/visuals/` — see CONTEXT.md "Content". */
export const TEMPLATES: Template[] = [
	{ id: "logo", label: "Logo", file: "CLB-Logo.svg" },
	{ id: "raute", label: "Raute", file: "CLB-Raute.svg" },
	{
		id: "raute-animiert",
		label: "Raute animiert",
		file: "CLB_rauten_animation.svg",
	},
	{
		id: "pfeil-rund",
		label: "Pfeil rund",
		file: "CLB-arrow-round.svg",
	},
	{
		id: "pfeil-rund-animiert",
		label: "Pfeil rund animiert",
		file: "CLB-arrow-round-animated.svg",
	},
	{ id: "smiley", label: "Smiley", file: "CLB-smiley.svg" },
];

/** Fixed closed palette of 6 presets, plus a free colour picker for anything else. */
export const PALETTE = [
	"#FEF177",
	"#B4B9FF",
	"#FE4441",
	"#FFCFD6",
	"#FFFFFF",
	"#000000",
];

/** Fixed 2-second pause between Lauftext loop repeats, unless overridden per
 * content by TextContent.pauseMs — see CONTEXT.md "Content". */
export const LOOP_PAUSE_MS = 2000;

const DEFAULT_TEXT: TextContent = {
	type: "text",
	mode: "static",
	value: "",
	fontSizePx: 16,
	fontFamily: "Pixelify Sans, ui-monospace, monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	direction: "left",
	speedPxPerSec: 40,
	pauseMs: LOOP_PAUSE_MS,
	hAlign: "center",
	vAlign: "center",
	paddingPx: 0,
};

const DEFAULT_ANIMATION: AnimationContent = {
	type: "animation",
	templateId: TEMPLATES[0].id,
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const DEFAULT_COLOR: ColorContent = {
	type: "color",
	hex: PALETTE[0],
};

export function defaultContentFor(type: ContentType): Content {
	switch (type) {
		case "text":
			return { ...DEFAULT_TEXT };
		case "animation":
			return { ...DEFAULT_ANIMATION };
		case "color":
			return { ...DEFAULT_COLOR };
		default:
			throw new Error(`Unknown content type: ${type satisfies never}`);
	}
}
