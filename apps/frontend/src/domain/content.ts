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
	/** True when the SVG carries its own CSS `@keyframes` animation (see
	 * render/animatedTemplate.ts) rather than being a plain static image. Drives
	 * both the frame-strip rasterization path (wire.ts) and the fps control in
	 * AnimationPanel — a template without this is never sampled, just drawn
	 * once like Farbe/static text. */
	animated?: boolean;
	/** The template's own authored loop length, in ms — the CSS animation's
	 * `animation-duration`. Only meaningful when `animated` is true. Both
	 * current animated templates are hand-authored at a 4s loop (Figma Smart
	 * Animate's export default); a future template with a different duration
	 * would need its own value here, since this can't be derived generically
	 * without re-parsing the SVG's `<style>` block ahead of time. */
	loopMs?: number;
}

/** Fixed built-in template library (no user upload in v1), sourced from the
 * SVGs under `public/visuals/` — see CONTEXT.md "Content". This is the
 * closed set approved for Bild/Animation; nothing else ships. */
export const TEMPLATES: Template[] = [
	{ id: "logo", label: "Logo", file: "CLB-Logo.svg" },
	{
		id: "raute-animiert",
		label: "▶ Raute",
		file: "CLB-Raute-animiert-1.svg",
		animated: true,
		loopMs: 4000,
	},
	{
		id: "pfeil-rund-animiert",
		label: "▶ Pfeil",
		file: "CLB-arrow-round-animated.svg",
		animated: true,
		loopMs: 4000,
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

/** Default sample rate for an animated template's frame strip — ignored for
 * a non-animated template. Deliberately a user-adjustable field (like
 * TextContent.speedPxPerSec) rather than a fixed constant: payload size
 * scales linearly with fps and stays cheap even well past this (see
 * ANIMATION_FPS_MAX), so the right value is a visual call to make on the
 * actual panels, not something to hardcode — see AnimationPanel.tsx. */
export const DEFAULT_ANIMATION_FPS = 12;
export const ANIMATION_FPS_MIN = 2;
export const ANIMATION_FPS_MAX = 30;

const DEFAULT_ANIMATION: AnimationContent = {
	type: "animation",
	templateId: TEMPLATES[0].id,
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
	fps: DEFAULT_ANIMATION_FPS,
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
