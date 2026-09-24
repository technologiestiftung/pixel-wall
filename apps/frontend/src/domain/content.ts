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

export interface PaletteColor {
	name: string;
	hex: string;
}

/** Fixed closed palette of 14 named presets (brand colours plus Weiß/Schwarz),
 * plus a free colour picker for anything else — shared by the Hintergrund and
 * Textfarbe pickers (see components/Menu/ColorPicker.tsx). Names are internal
 * (shown as a hover tooltip on the swatch), not printed in the UI otherwise. */
export const PALETTE: PaletteColor[] = [
	{ name: "Coral Red 500", hex: "#FE4441" },
	{ name: "Coral Red 100", hex: "#DE8290" },
	{ name: "TSB Blau", hex: "#1E3791" },
	{ name: "Citric Citron 200", hex: "#FFF59E" },
	{ name: "Citric Citron 500", hex: "#FAE737" },
	{ name: "Citric Citron 800", hex: "#F9A927" },
	{ name: "Citric Citron 900", hex: "#F58019" },
	{ name: "Electric Lavender 100", hex: "#D2D4FF" },
	{ name: "Electric Lavender 500", hex: "#6F6BEA" },
	{ name: "Electric Lavender 900", hex: "#4D36AC" },
	{ name: "Subtle Green 200", hex: "#B5EAC2" },
	{ name: "Subtle Green 300", hex: "#95E3A9" },
	{ name: "Weiß", hex: "#FFFFFF" },
	{ name: "Schwarz", hex: "#000000" },
];

/** The picker's default when nothing else has been chosen yet — closest to
 * the old "unlit" baseline (see CONTEXT.md "Hintergrund"). */
export const DEFAULT_BACKGROUND_HEX = "#000000";

/** Fixed 2-second pause between Lauftext loop repeats, unless overridden per
 * content by TextContent.pauseMs — see CONTEXT.md "Content". */
export const LOOP_PAUSE_MS = 2000;

const DEFAULT_TEXT: TextContent = {
	type: "text",
	mode: "static",
	value: "",
	fontSizePx: 16,
	fontFamily: "Host Grotesk, ui-monospace, monospace",
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
	hex: DEFAULT_BACKGROUND_HEX,
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
