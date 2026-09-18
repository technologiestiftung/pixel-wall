import type { ScrollDto, WireContentDto } from "../api/types";
import type { ScreenLayers } from "../domain/types";
import { solidUnderlay } from "./underlay";
import { contentToWire } from "./wire";

/**
 * Flattens a screen's two layers into the single frame a panel receives.
 *
 * A Lauftext foreground drops the background: the frame that scrolls *is* the
 * bitmap, so anything behind the glyphs would travel with them and tear open
 * during the loop pause (see docs/wire-format.md `scroll`). Everything else
 * layers, and a frame with both layers goes out as `pal4`.
 */
export function layersToWire(
	layers: ScreenLayers,
	size: { widthPx: number; heightPx: number },
	scroll?: ScrollDto,
): WireContentDto {
	const { background, foreground } = layers;

	if (foreground === null) {
		return contentToWire({ type: "color", hex: background }, size);
	}

	const scrolls = foreground.type === "text" && foreground.mode === "scrolling";
	const underlay =
		background === null || scrolls
			? null
			: solidUnderlay(background, size.widthPx, size.heightPx);

	return contentToWire(foreground, size, { scroll, underlay });
}

/** Whether flattening these layers would lose the background — the one case
 * the editor has to warn about rather than silently drop. */
export function backgroundIsLost(layers: ScreenLayers): boolean {
	return (
		layers.background !== null &&
		layers.foreground?.type === "text" &&
		layers.foreground.mode === "scrolling"
	);
}
