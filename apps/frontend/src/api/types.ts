import type { ScreenKind, ScreenLayers, ScreenSpec } from "../domain/types";

export interface LayoutPositionDto {
	screenId: string;
	xMm: number;
	yMm: number;
}

export interface ScreensResponse {
	screens: ScreenSpec[];
}

export interface LayoutResponse {
	positions: LayoutPositionDto[];
}

/** A screen's region of the (possibly multi-screen) content bitmap. */
export interface ScreenWindowDto {
	offsetXPx: number;
	offsetYPx: number;
	widthPx: number;
	heightPx: number;
}

export interface ScrollDto {
	direction: "left" | "right";
	speedPxPerSec: number;
	pauseMs: number;
	/** Width of the area the content scrolls across — the whole selection, not
	 * the filmstrip. The renderer needs both to pan in step across screens. */
	compositeWidthPx: number;
}

/**
 * Present only for an animated Animation/Bild template — the frame-strip
 * counterpart of ScrollDto. `data` is `frameCount` copies of the composite,
 * laid out side by side; a renderer picks
 * `floor(elapsedMs / frameDurationMs) % frameCount` and crops that
 * `compositeWidthPx`-wide slot, then applies `window` on top exactly as a
 * static frame would — same crop-a-window-out-of-a-wide-bitmap mechanism as
 * scroll, just stepped instead of continuous (see docs/wire-format.md).
 */
export interface FramesDto {
	frameCount: number;
	frameDurationMs: number;
	/** Width of one frame/one screen's composite — not the strip's total
	 * width, which is `frameCount * compositeWidthPx`. */
	compositeWidthPx: number;
}

/**
 * The JSON envelope from docs/wire-format.md. `data` is a base64 bitmap block:
 * `mask1` is 1 bit per pixel tinted with `color`, `pal4` is 4 bits per pixel
 * with its palette inside the block.
 */
export interface WireContentDto {
	format: "mask1" | "pal4";
	widthPx: number;
	heightPx: number;
	color?: [number, number, number];
	data: string;
	scroll?: ScrollDto | null;
	/** Present only for an animated Animation/Bild template — see FramesDto.
	 * Large screens (Pi) only for now — see
	 * docs/adr/0002-phase-animated-templates-by-hardware-kind.md and
	 * docs/plan-esp32-animation-frames.md. An ESP32 that receives one today
	 * (nothing currently sends one) shows the strip's first frame statically
	 * rather than animating. */
	frames?: FramesDto | null;
	/** A static fill behind a scrolling filmstrip — never baked into `data`,
	 * since that would pan along with the text (see render/layers.ts). Large
	 * screens (Pi) only for now — see
	 * docs/adr/0001-phase-lauftext-background-by-hardware-kind.md. */
	background?: [number, number, number] | null;
}

export interface BrightnessDto {
	small: number;
	large: number;
}

export interface StateResponse {
	brightness: BrightnessDto;
	layout: LayoutPositionDto[];
	screens: Record<
		string,
		{
			window: ScreenWindowDto;
			content: WireContentDto;
			source?: ScreenLayers | null;
		}
	>;
	updated_at: string;
}

export interface ApplyRequest {
	selectionKind: ScreenKind;
	screens: { screenId: string; window: ScreenWindowDto }[];
	content: WireContentDto;
	brightness?: BrightnessDto;
	/** The editor's layers behind `content`. Stored verbatim by the backend and
	 * never rendered from — see domain/types.ts ScreenLayers. */
	source?: ScreenLayers;
}

export interface ApplyResponse {
	appliedAt: string;
}

export interface HealthResponse {
	status: string;
	auth: { enabled: boolean };
}
