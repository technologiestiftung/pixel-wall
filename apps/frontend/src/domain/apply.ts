import type { ApplyRequest, ScrollDto } from "../api/types";
import { LOOP_PAUSE_MS } from "./content";
import { PITCH_MM_PER_PX, specById } from "./layout";
import { computeDisplayComposite, layersForGroup } from "./mapping";
import type {
	AnimationContent,
	Content,
	LayoutPosition,
	ScreenSpec,
	SelectionGroup,
} from "./types";
import { measureTextWidthPx } from "../render/text";
import { layersToWire } from "../render/layers";
import { temperatureToWire } from "../render/temperature";
import { asWeatherUpload, loadWeatherMedia } from "../render/weatherMedia";
import { DEFAULT_WEATHER_VARIANT, WEATHER_VARIANTS } from "./weather";
import type { ScreenLayers } from "./types";

/**
 * Builds the wire payload for POST /api/apply: one device-pixel bitmap for a
 * single-kind selection group (or, for scrolling text, a "filmstrip" as wide as the full
 * text) plus each selected screen's window into it. See CONTEXT.md
 * "Rendering split" and docs/wire-format.md for the contract this targets.
 */
export async function buildApplyRequest(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	selection: SelectionGroup,
	edit: { layers: ScreenLayers },
): Promise<ApplyRequest> {
	const layers = layersForGroup(edit.layers, selection);
	// Only the foreground decides the bitmap's shape (a scrolling filmstrip is
	// wider than the composite); a lone background fills whatever it is given.
	const content: Content = layers.foreground ?? {
		type: "color",
		hex: layers.background,
	};
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
			pauseMs: content.pauseMs ?? LOOP_PAUSE_MS,
			compositeWidthPx,
		};
	}

	const size = { widthPx: bitmapWidthPx, heightPx: bitmapHeightPx };
	const weather =
		content.type === "animation" && content.mode === "weather"
			? await weatherVariantsToWire(layers, content, size)
			: undefined;

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
		content:
			weather?.variants[DEFAULT_WEATHER_VARIANT] ??
			(await layersToWire(layers, size, { scroll })),
		...(weather ? { weather } : {}),
		source: {
			...layers,
			canvas: {
				widthPx: composite.widthPx,
				heightPx: composite.heightPx,
				windows: Object.fromEntries(
					composite.slots.map((slot) => [
						slot.screenId,
						{ offsetXPx: slot.offsetXPx, offsetYPx: slot.offsetYPx },
					]),
				),
			},
		},
	};
}

/** Live weather renders every icon, not just today's: the backend switches
 * between them on its own long after this request (see ApplyRequest.weather). */
async function weatherVariantsToWire(
	layers: ScreenLayers,
	content: AnimationContent,
	size: { widthPx: number; heightPx: number },
): Promise<NonNullable<ApplyRequest["weather"]>> {
	const entries = await Promise.all(
		WEATHER_VARIANTS.map(async (variant) => {
			const media = await loadWeatherMedia(variant);
			const wire = await layersToWire(
				{ ...layers, foreground: asWeatherUpload(content, media) },
				size,
			);
			return [variant, wire] as const;
		}),
	);
	return {
		variants: Object.fromEntries(entries),
		...(content.temperature
			? { temperature: await temperatureToWire(content.temperature) }
			: {}),
	};
}
