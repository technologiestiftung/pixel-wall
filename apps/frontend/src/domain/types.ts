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
	mode: "template" | "gameOfLife" | "upload" | "weather";
	/** Meaningless when `mode` is "gameOfLife" — the board is native,
	 * full-canvas, and never scaled or aligned. Also meaningless for
	 * "weather", which shows the icon for the current weather instead (see
	 * domain/weather.ts) but is scaled and aligned like any upload. */
	templateId: string;
	scalePercent: number;
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
	/** Draws the current temperature over a "weather" foreground; absent
	 * shows the icon alone. */
	temperature?: TemperatureStyle;
	/** The user's own image or animation when `mode` is "upload". Carried
	 * inline so it survives a reload through the backend's opaque `source`. */
	upload?: UploadedMedia;
	/** Line colour for a template drawn only in lines (`Template.lineArt`);
	 * absent draws the artwork's own white. */
	lineColor?: string;
}

/** How live weather draws the temperature — the same styling Text offers,
 * minus everything about the text itself. */
export interface TemperatureStyle {
	fontSizePx: number;
	fontFamily: string;
	fontWeight: string;
	color: string;
	hAlign: HorizontalAlign;
	vAlign: VerticalAlign;
	/** Inset from the left/right edge `hAlign` pushes toward, and from the
	 * top/bottom edge `vAlign` does. Ignored on a centred axis, as for Text. */
	paddingXPx: number;
	paddingYPx: number;
}

/**
 * A user-uploaded image or animation, already decoded, downscaled and
 * resampled to `ANIMATION_FPS` in the browser (see render/uploadedMedia.ts).
 * Frames are packed row-major into one sprite sheet `columns` frames wide; a
 * still image is simply `frameCount: 1`.
 */
export interface UploadedMedia {
	/** Set once the upload is in the shared library (see LibraryUpload), so
	 * the picker can show which entry a screen is using. */
	id?: string;
	name: string;
	sheetDataUrl: string;
	frameWidthPx: number;
	frameHeightPx: number;
	frameCount: number;
	columns: number;
	frameDurationMs: number;
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
	// Picking "Hochladen" before choosing a file changes nothing yet, so
	// Speichern stays disabled rather than blanking the screen.
	if (edit.type === "animation" && edit.mode === "upload" && !edit.upload) {
		return layers;
	}
	// The draft keeps an upload around while the user flips to Vorlage and
	// back, but a saved template shouldn't carry the image data with it.
	if (edit.type === "animation" && edit.mode !== "upload" && edit.upload) {
		const { upload: _unused, ...withoutUpload } = edit;
		return { ...layers, foreground: withoutUpload };
	}
	// A "gameOfLife" edit still writes the foreground slot like any other —
	// it's just bookkeeping for what the editor currently has selected. What
	// actually makes it bypass Hintergrund compositing happens one level
	// deeper, in render/wire.ts's contentToWire, not here — see CONTEXT.md
	// "Content" (Game of Life) and "Layers".
	return { ...layers, foreground: edit };
}

/** An entry in the backend's shared upload library (`/api/uploads`). */
export interface LibraryUpload extends UploadedMedia {
	id: string;
	createdAt: string;
}

/** "mixed" is a selection spanning both kinds — see `selectionGroups` for
 * how it is split up for rendering and saving. */
export type SelectionKind = ScreenKind | "mixed";

export interface Selection {
	kind: SelectionKind;
	screenIds: string[];
}

/** The single-kind slice of a selection that is rendered as one unit. */
export interface SelectionGroup {
	kind: ScreenKind;
	screenIds: string[];
	/** Set when the group is only part of a mixed selection: the canvas then
	 * spans every screen listed here, not just this group's own. */
	canvasScreenIds?: string[];
}
