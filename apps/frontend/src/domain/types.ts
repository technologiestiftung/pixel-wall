export type ScreenKind = "small" | "large";

export interface ScreenSpec {
	id: string;
	kind: ScreenKind;
	/** Pixel resolution per edge (square panels): 32 for small, 64 for large. */
	pixelSize: number;
	/** Physical size per edge in millimeters: 128 for small, 192 for large. */
	physicalSizeMm: number;
}

export interface LayoutPosition {
	screenId: string;
	/** Top-left corner of the screen, in millimeters, in wall-space. */
	xMm: number;
	yMm: number;
}

export type ContentType = "text" | "animation" | "color";

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "center" | "bottom";

export interface TextContent {
	type: "text";
	mode: "static" | "scrolling";
	value: string;
	fontSizePx: number;
	fontFamily: string;
	fontWeight: string;
	/** Colour of the glyphs, as `#rrggbb`. One colour for the whole text: a
	 * frame carries a single tint beside its coverage mask. */
	color: string;
	direction?: "left" | "right";
	speedPxPerSec?: number;
	/** Where the text sits within the (possibly multi-screen) composite.
	 * Horizontal alignment only applies to static text — scrolling text's
	 * horizontal position is driven by the animation itself. */
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
}

export interface AnimationContent {
	type: "animation";
	templateId: string;
	scalePercent: number;
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
}

/** The Hintergrund tab: what fills a screen behind everything else.
 * `hex` of `null` is "ohne" — the screen is left unlit. */
export interface ColorContent {
	type: "color";
	hex: string | null;
}

export type Content = TextContent | AnimationContent | ColorContent;

/**
 * What one screen is showing, as the two layers the editor works in. A frame
 * sent to a panel is these flattened together; keeping them apart is what lets
 * the Hintergrund tab recolour behind existing text instead of replacing it.
 */
export interface ScreenLayers {
	background: string | null;
	foreground: TextContent | AnimationContent | null;
}

export const EMPTY_LAYERS: ScreenLayers = {
	background: null,
	foreground: null,
};

/** Folds one edit into a screen's layers: the Hintergrund tab writes the
 * background, every other tab writes the foreground, and neither disturbs the
 * other. */
export function withEdit(layers: ScreenLayers, edit: Content): ScreenLayers {
	if (edit.type === "color") {
		return { ...layers, background: edit.hex };
	}
	return { ...layers, foreground: edit };
}

export interface Selection {
	kind: ScreenKind;
	screenIds: string[];
}
