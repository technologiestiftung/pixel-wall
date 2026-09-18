import type { ScrollDto, WireContentDto } from "../api/types";
import type { ScreenLayers } from "../domain/types";
import { contentToWire } from "./wire";

/**
 * Flattens a screen's two layers into the single frame a panel receives.
 *
 * The background is painted under the foreground on one canvas, which then
 * quantizes to a single `pal4` frame (see render/wire.ts) — the format carries
 * up to 16 colours, so a background and a text colour cost nothing extra.
 *
 * A Lauftext foreground drops the background: the frame that scrolls *is* the
 * bitmap, so anything behind the glyphs would travel with them and tear open
 * during the loop pause (see docs/wire-format.md `scroll`).
 */
export function layersToWire(
	layers: ScreenLayers,
	size: { widthPx: number; heightPx: number },
	scroll?: ScrollDto,
): Promise<WireContentDto> {
	const { background, foreground } = layers;

	if (foreground === null) {
		return contentToWire({ type: "color", hex: background }, size);
	}

	return contentToWire(foreground, size, {
		scroll,
		background: backgroundIsLost(layers) ? null : background,
	});
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
