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

export interface ColorContent {
	type: "color";
	hex: string;
}

export type Content = TextContent | AnimationContent | ColorContent;

export interface Selection {
	kind: ScreenKind;
	screenIds: string[];
}
