import type { ApplyRequest, BrightnessDto, ScrollDto } from "../api/types";
import { LOOP_PAUSE_MS } from "./content";
import { PITCH_MM_PER_PX, specById } from "./layout";
import { computeDisplayComposite } from "./mapping";
import type { Content, LayoutPosition, ScreenSpec, Selection } from "./types";
import { contentToWire } from "../render/wire";
import { measureTextWidthPx } from "../render/text";

/**
 * Builds the wire payload for POST /api/apply: one device-pixel bitmap for the
 * whole selection (or, for scrolling text, a "filmstrip" as wide as the full
 * text) plus each selected screen's window into it. See CONTEXT.md
 * "Rendering split" and docs/wire-format.md for the contract this targets.
 */
export function buildApplyRequest(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	selection: Selection,
	edit: { content: Content; brightness?: BrightnessDto },
): ApplyRequest {
	const { content, brightness } = edit;
	const devicePxPerMm = 1 / PITCH_MM_PER_PX[selection.kind];
	const composite = computeDisplayComposite(wall, selection, devicePxPerMm);

	const compositeWidthPx = Math.round(composite.widthPx);
	let bitmapWidthPx = compositeWidthPx;
	const bitmapHeightPx = Math.round(composite.heightPx);
	let scroll: ScrollDto | undefined;

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
			compositeWidthPx,
		};
	}

	return {
		selectionKind: selection.kind,
		screens: composite.slots.map((slot) => {
			const spec = specById(wall.specs, slot.screenId);
			return {
				screenId: slot.screenId,
				window: {
					offsetXPx: Math.round(slot.offsetXPx),
					offsetYPx: Math.round(slot.offsetYPx),
					widthPx: spec.pixelSize,
					heightPx: spec.pixelSize,
				},
			};
		}),
		content: contentToWire(
			content,
			{ widthPx: bitmapWidthPx, heightPx: bitmapHeightPx },
			scroll,
		),
		...(brightness ? { brightness } : {}),
	};
}
