import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	TextContent,
} from "./types";

export interface Template {
	id: string;
	/** SVG file name under `public/visuals/`. */
	file: string;
	/** True when the SVG carries its own CSS `@keyframes` animation (see
	 * render/animatedTemplate.ts) rather than being a plain static image. Drives
	 * the frame-strip rasterization path (wire.ts) — a template without this is
	 * never sampled, just drawn once like Farbe/static text. */
	animated?: boolean;
	/** The template's own authored loop length, in ms — the CSS animation's
	 * `animation-duration`. Only meaningful when `animated` is true. Both
	 * current animated templates are hand-authored at a 4s loop (Figma Smart
	 * Animate's export default); a future template with a different duration
	 * would need its own value here, since this can't be derived generically
	 * without re-parsing the SVG's `<style>` block ahead of time. */
	loopMs?: number;
}

/** Fixed built-in template library (user uploads are a separate mode — see
 * AnimationContent.upload), sourced from the
 * SVGs under `public/visuals/` — see CONTEXT.md "Content". This is the
 * closed set approved for Bild/Animation; nothing else ships. */
export const TEMPLATES: Template[] = [
	{ id: "logo", file: "CLB-Logo.svg" },
	{
		id: "raute-animiert",
		file: "CLB-Raute-animiert-1.svg",
		animated: true,
		loopMs: 4000,
	},
	{
		id: "raute-animiert-2",
		file: "CLB-Raute-animiert-2.svg",
		animated: true,
		loopMs: 8000,
	},
	{
		id: "pfeil-rund-animiert",
		file: "CLB-arrow-round-animated.svg",
		animated: true,
		loopMs: 4000,
	},
	{ id: "smiley", file: "CLB-smiley.svg" },
	{
		id: "smiley-animiert",
		file: "CLB-smiley-animiert.svg",
		animated: true,
		loopMs: 6000,
	},
];

export interface PaletteColor {
	name: string;
	hex: string;
}

/** Fixed closed palette of named presets (brand colours plus Weiß/Schwarz),
 * plus a free colour picker for anything else — shared by the Hintergrund and
 * Textfarbe pickers (see components/Menu/ColorPicker.tsx). Names are internal
 * (shown as a hover tooltip on the swatch), not printed in the UI otherwise. */
export const PALETTE: PaletteColor[] = [
	{ name: "Creme hell", hex: "#FAFAF2" },
	{ name: "Creme", hex: "#F5F5ED" },
	{ name: "Rosa", hex: "#FFCFD6" },
	{ name: "Rot", hex: "#FE4441" },
	{ name: "Blau", hex: "#1E3791" },
	{ name: "Lavender hell", hex: "#D2D4FF" },
	{ name: "Lavender", hex: "#B4B9FF" },
	{ name: "Gelb", hex: "#FEF177" },
	{ name: "Grün hell", hex: "#B5EAC2" },
	{ name: "Grün", hex: "#95E3A9" },
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

/** Sample rate every animated template's frame strip is converted at — see
 * render/animatedTemplate.ts's `frameCountFor` and render/wire.ts's
 * `animationToFramesWire`. Fixed rather than user-adjustable: an editor
 * fps control existed during development to compare rates directly on the
 * physical wall, and 16 is the rate that testing settled on — see
 * docs/wire-format.md "frames" and docs/adr/0002-phase-animated-templates-by-hardware-kind.md. */
export const ANIMATION_FPS = 16;

const DEFAULT_ANIMATION: AnimationContent = {
	type: "animation",
	mode: "template",
	templateId: TEMPLATES[0].id,
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

/** `templateId`/`scalePercent`/`hAlign`/`vAlign` are meaningless in this mode
 * (see AnimationContent) — kept as harmless defaults purely so the object
 * still satisfies the interface, never read by anything downstream once
 * `mode` is "gameOfLife". */
export const DEFAULT_GAME_OF_LIFE: AnimationContent = {
	type: "animation",
	mode: "gameOfLife",
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
