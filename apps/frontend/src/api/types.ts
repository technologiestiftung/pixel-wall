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

export interface ScreenGeometryDto {
	offsetXPx: number;
	offsetYPx: number;
	widthPx: number;
	heightPx: number;
}

export interface AppliedContentDto {
	/** base64 PNG of the composite canvas — see CONTEXT.md "Rendering split". */
	bitmap: string;
	scroll?: {
		direction: "left" | "right";
		speedPxPerSec: number;
		pauseMs: number;
	};
}

export interface StateResponse {
	/** Per-screen: what that screen's slice of its (possibly shared) composite looks like. */
	screens: Record<
		string,
		{
			geometry: ScreenGeometryDto;
			content: AppliedContentDto;
		}
	>;
}

export interface ApplyRequest {
	selectionKind: ScreenKind;
	screens: { screenId: string; geometry: ScreenGeometryDto }[];
	content: AppliedContentDto;
}

export interface ApplyResponse {
	appliedAt: string;
}
