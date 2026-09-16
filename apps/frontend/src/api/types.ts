import type { ScreenKind, ScreenSpec } from "../domain/types";

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
}

export interface BrightnessDto {
	small: number;
	large: number;
}

export interface StateResponse {
	brightness: BrightnessDto;
	layout: LayoutPositionDto[];
	screens: Record<string, { window: ScreenWindowDto; content: WireContentDto }>;
	updated_at: string;
}

export interface ApplyRequest {
	selectionKind: ScreenKind;
	screens: { screenId: string; window: ScreenWindowDto }[];
	content: WireContentDto;
	brightness?: BrightnessDto;
}

export interface ApplyResponse {
	appliedAt: string;
}

export interface HealthResponse {
	status: string;
	auth: { enabled: boolean };
}
