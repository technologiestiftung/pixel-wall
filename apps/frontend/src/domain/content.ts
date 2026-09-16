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
	/** True for artwork authored at the small-screen (32×32) viewBox rather
	 * than the large-screen (64×64) one — surfaced as a badge in the picker
	 * so both screen sizes can be tested with matching source art. */
	small: boolean;
}

/** Fixed built-in template library (no user upload in v1), sourced from the
 * SVGs under `public/visuals/` — see CONTEXT.md "Content". */
export const TEMPLATES: Template[] = [
	{ id: "logo", label: "Logo", file: "CLB-Logo.svg", small: false },
	{ id: "logo-small", label: "Logo", file: "CLB-Logo-small.svg", small: true },
	{ id: "raute", label: "Raute", file: "CLB-Raute.svg", small: false },
	{ id: "raute-small", label: "Raute", file: "CLB-Raute-small.svg", small: true },
	{
		id: "raute-animiert",
		label: "Raute animiert",
		file: "CLB_rauten_animation.svg",
		small: false,
	},
	{
		id: "raute-animiert-small",
		label: "Raute animiert",
		file: "CLB-Raute-animiert-small.svg",
		small: true,
	},
	{
		id: "pfeil-rund",
		label: "Pfeil rund",
		file: "CLB-arrow-round.svg",
		small: false,
	},
	{
		id: "pfeil-rund-small",
		label: "Pfeil rund",
		file: "CLB-arrow-round-small.svg",
		small: true,
	},
	{
		id: "pfeil-rund-animiert",
		label: "Pfeil rund animiert",
		file: "CLB-arrow-round-animated.svg",
		small: false,
	},
	{
		id: "pfeil-rund-animiert-small",
		label: "Pfeil rund animiert",
		file: "CLB-arrow-round-animation-small.svg",
		small: true,
	},
	{ id: "smiley", label: "Smiley", file: "CLB-smiley.svg", small: false },
	{
		id: "smiley-small",
		label: "Smiley",
		file: "CLB-smiley-small.svg",
		small: true,
	},
];

/** Fixed closed palette of exactly 4 presets (no free color picker in v1). */
export const PALETTE = ["#FEF177", "#B4B9FF", "#FE4441", "#FFCFD6", "#FFFFFF", "#000000"];

const DEFAULT_TEXT: TextContent = {
	type: "text",
	mode: "static",
	value: "",
	fontSizePx: 16,
	fontFamily: "Pixel Grotesk, ui-monospace, monospace",
	fontWeight: "700",
	direction: "left",
	speedPxPerSec: 40,
	hAlign: "center",
	vAlign: "center",
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

/** Fixed 2-second pause between Lauftext loop repeats — see CONTEXT.md "Content". */
export const LOOP_PAUSE_MS = 2000;
