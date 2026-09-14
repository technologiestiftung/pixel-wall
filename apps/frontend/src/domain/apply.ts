import type { ApplyRequest } from "../api/types";
import { LOOP_PAUSE_MS } from "./content";
import { PITCH_MM_PER_PX, specById } from "./layout";
import { computeDisplayComposite } from "./mapping";
import type { Content, LayoutPosition, ScreenSpec, Selection } from "./types";
import { rasterizeContent } from "../render/rasterize";
import { measureTextWidthPx } from "../render/text";

/**
 * Builds the actual wire payload for POST /api/apply: a device-pixel bitmap
 * (or, for scrolling text, a "filmstrip" as wide as the full text) plus each
 * selected screen's geometry within it. See CONTEXT.md "Rendering split"
 * and api/types.ts for the contract this targets.
 */
export function buildApplyRequest(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	selection: Selection,
	content: Content,
): ApplyRequest {
	const devicePxPerMm = 1 / PITCH_MM_PER_PX[selection.kind];
	const composite = computeDisplayComposite(wall, selection, devicePxPerMm);

	let bitmapWidthPx = Math.round(composite.widthPx);
	const bitmapHeightPx = Math.round(composite.heightPx);
	let scroll: ApplyRequest["content"]["scroll"];

	if (content.type === "text" && content.mode === "scrolling") {
		const textWidthPx = measureTextWidthPx(content.value, {
			fontSizePx: content.fontSizePx,
			fontWeight: content.fontWeight,
			fontFamily: content.fontFamily,
		});
		bitmapWidthPx = Math.max(1, Math.round(textWidthPx));
		scroll = {
			direction: content.direction ?? "left",
			speedPxPerSec: content.speedPxPerSec ?? 60,
			pauseMs: LOOP_PAUSE_MS,
		};
	}

	const bitmap = rasterizeContent(content, bitmapWidthPx, bitmapHeightPx);

	return {
		selectionKind: selection.kind,
		screens: composite.slots.map((slot) => {
			const spec = specById(wall.specs, slot.screenId);
			return {
				screenId: slot.screenId,
				geometry: {
					offsetXPx: Math.round(slot.offsetXPx),
					offsetYPx: Math.round(slot.offsetYPx),
					widthPx: spec.pixelSize,
					heightPx: spec.pixelSize,
				},
			};
		}),
		content: { bitmap, scroll },
	};
}
