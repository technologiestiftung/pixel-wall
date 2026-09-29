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
	/** Text colour as a hex string, e.g. "#FFFFFF". Baked into the rasterized
	 * pixels — see render/wire.ts, which sends text as `pal4` rather than a
	 * `mask1` coverage mask + flat colour. */
	color: string;
	direction?: "left" | "right";
	speedPxPerSec?: number;
	/** Pause between Lauftext loop repeats, in milliseconds — see
	 * domain/content.ts's LOOP_PAUSE_MS for the default. Ignored for static text. */
	pauseMs?: number;
	/** Where the text sits within the (possibly multi-screen) composite.
	 * Horizontal alignment only applies to static text — scrolling text's
	 * horizontal position is driven by the animation itself. */
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
	/** Inset from whichever edge(s) `hAlign`/`vAlign` push the text toward, in
	 * device pixels. Has no effect on an axis aligned to "center". */
	paddingPx?: number;
}

export interface AnimationContent {
	type: "animation";
	/** "template" is everything this tab did before Game of Life existed
	 * (`templateId`/`scalePercent`/`hAlign`/`vAlign` below). "gameOfLife" is
	 * a distinct native-on-device mode offered only for small (ESP32)
	 * selections — see CONTEXT.md "Content" (Game of Life) and
	 * `docs/adr/0003-game-of-life-native-esp32-content-type.md`. It stays a
	 * mode of `AnimationContent` rather than a whole separate `ContentType`
	 * so it can live inside the Animation/Bild tab without widening
	 * `ContentType` (TabBar, the per-tab draft slots, `withEdit`, ...)
	 * everywhere that's matched exhaustively. */
	mode: "template" | "gameOfLife";
	/** Meaningless when `mode` is "gameOfLife" — the board is native,
	 * full-canvas, and never scaled or aligned. */
	templateId: string;
	scalePercent: number;
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
}

/** Reserved `AnimationContent.templateId` meaning "nothing" — lets the
 * Animation/Bild tab be explicitly deselected, mirroring `ColorContent`'s
 * `hex: null` for the Hintergrund tab's "ohne". Never reaches a renderer or
 * `TEMPLATES`: `withEdit` below converts it straight to `foreground: null`
 * the moment it's folded, so nothing downstream (rasterize.ts, wire.ts,
 * animatedTemplate.ts) ever needs to know this id exists. */
export const NO_ANIMATION_TEMPLATE_ID = "ohne";

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
	if (
		edit.type === "animation" &&
		edit.mode === "template" &&
		edit.templateId === NO_ANIMATION_TEMPLATE_ID
	) {
		return { ...layers, foreground: null };
	}
	// A "gameOfLife" edit still writes the foreground slot like any other —
	// it's just bookkeeping for what the editor currently has selected. What
	// actually makes it bypass Hintergrund compositing happens one level
	// deeper, in render/wire.ts's contentToWire, not here — see CONTEXT.md
	// "Content" (Game of Life) and "Layers".
	return { ...layers, foreground: edit };
}

export interface Selection {
	kind: ScreenKind;
	screenIds: string[];
}
