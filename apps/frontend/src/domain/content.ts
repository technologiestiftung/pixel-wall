import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	SelectionKind,
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
	 * `animation-duration` (or SMIL `dur`). Only meaningful when `animated` is
	 * true. Kept here rather than derived, since it can't be read without
	 * fetching and parsing the SVG ahead of time. */
	loopMs?: number;
	/** True when the artwork is drawn only in white (or near-white) lines, so
	 * the editor offers a line colour for it (AnimationContent.lineColor). */
	lineArt?: boolean;
}

/** Fixed built-in template library (user uploads are a separate mode — see
 * AnimationContent.upload), sourced from the
 * SVGs under `public/visuals/` — see CONTEXT.md "Content". This is the
 * closed set approved for Bild/Animation; nothing else ships. */
export const TEMPLATES: Template[] = [
	{ id: "logo", file: "CLB-Logo.svg", lineArt: true },
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
		lineArt: true,
	},
	{ id: "smiley", file: "CLB-smiley.svg", lineArt: true },
	{
		id: "smiley-animiert",
		file: "CLB-smiley-animiert.svg",
		animated: true,
		loopMs: 6000,
		lineArt: true,
	},
	{
		id: "raute-pixel-aufbau",
		file: "CLB-Raute-pixel-aufbau.svg",
		animated: true,
		loopMs: 8000,
	},
	{
		id: "raute-lego-aufbau",
		file: "CLB-Raute-lego-aufbau.svg",
		animated: true,
		loopMs: 7000,
	},
	{
		id: "gemeinwohlorientiert",
		file: "gemeinwohlorientiert-herz.svg",
		animated: true,
		loopMs: 8000,
		lineArt: true,
	},
	{
		id: "co-kreativ",
		file: "co-kreativ-baelle.svg",
		animated: true,
		loopMs: 7000,
		lineArt: true,
	},
	{
		id: "quadrat-kreis",
		file: "quadrat-kreis-morph.svg",
		animated: true,
		loopMs: 5000,
		lineArt: true,
	},
	{
		id: "spirale-welle",
		file: "spirale-welle-sequenz.svg",
		animated: true,
		loopMs: 15000,
		lineArt: true,
	},
	{
		id: "welle",
		file: "welle-zeichnen.svg",
		animated: true,
		loopMs: 7500,
		lineArt: true,
	},
	{
		id: "spirale",
		file: "spirale-zeichnen.svg",
		animated: true,
		loopMs: 7500,
		lineArt: true,
	},
];

/** The chosen line colour, or undefined when the template isn't line art or
 * keeps its own white. */
export function lineColorFor(content: AnimationContent): string | undefined {
	return isLineArt(content) ? content.lineColor : undefined;
}

/** The colour a line-art template's lines are drawn in, or null when the
 * foreground isn't a line-art template. */
export function displayedLineColor(content: AnimationContent): string | null {
	return isLineArt(content) ? (content.lineColor ?? "#FFFFFF") : null;
}

function isLineArt(content: AnimationContent): boolean {
	return (
		content.mode === "template" &&
		TEMPLATES.some((t) => t.id === content.templateId && t.lineArt)
	);
}

export interface PaletteColor {
	name: string;
	hex: string;
}

/** Fixed closed palette of named presets (brand colours plus Weiß/Schwarz),
 * plus a free colour picker for anything else — shared by the Hintergrund and
 * Textfarbe pickers (see components/Menu/ColorPicker.tsx). Names are internal
 * (shown as a hover tooltip on the swatch), not printed in the UI otherwise. */
export const PALETTE: PaletteColor[] = [
	{ name: "Rosa", hex: "#FFCFD6" },
	{ name: "Rot", hex: "#FE4441" },
	{ name: "Blau", hex: "#1E3791" },
	{ name: "Lavender", hex: "#B4B9FF" },
	{ name: "Gelb", hex: "#FEF177" },
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
	fontFamily: "Host Grotesk, FrankMoji, ui-monospace, monospace",
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

/** A small-screen (ESP32) selection hides animated templates authored longer
 * than this from the picker. The ESP32's decode budget only holds a handful
 * of frames, so a longer loop either plays choppily or noticeably sped up
 * (see docs/wire-format.md "frames" and compose.py's
 * SMALL_SCREEN_MAX_SPEEDUP) — past this length neither trade-off reads as
 * acceptable, so the template isn't offered at all for a small selection.
 * Large screens are unaffected. */
export const SMALL_SCREEN_MAX_ANIMATION_LOOP_MS = 8000;

/** The Animation/Bild template picker's options for a given selection: a
 * mixed selection drops every animated template (CONTEXT.md "Selection" —
 * moving content isn't offered there), and a small-only selection
 * additionally drops animated templates longer than
 * SMALL_SCREEN_MAX_ANIMATION_LOOP_MS. Large-only returns every template. */
export function templatesFor(screenKind: SelectionKind): Template[] {
	return TEMPLATES.filter((template) => {
		if (screenKind === "mixed" && template.animated) return false;
		if (
			screenKind === "small" &&
			(template.loopMs ?? 0) > SMALL_SCREEN_MAX_ANIMATION_LOOP_MS
		) {
			return false;
		}
		return true;
	});
}

/** Whether an Animation/Bild foreground moves — an animated template, a
 * multi-frame upload, live weather, or Game of Life. Moving content isn't offered across a
 * mixed selection; still images are (see CONTEXT.md "Selection"). */
export function isMovingAnimation(content: AnimationContent): boolean {
	if (content.mode === "gameOfLife" || content.mode === "weather") {
		return true;
	}
	if (content.mode === "upload") {
		return (content.upload?.frameCount ?? 1) > 1;
	}
	return TEMPLATES.find((t) => t.id === content.templateId)?.animated === true;
}

const DEFAULT_ANIMATION: AnimationContent = {
	type: "animation",
	mode: "template",
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
