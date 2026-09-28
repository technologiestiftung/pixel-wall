import type { ScrollDto, WireContentDto } from "../api/types";
import { hexToRgb } from "../domain/color";
import type { ScreenLayers } from "../domain/types";

import { contentToWire } from "./wire";

/**
 * Flattens a screen's two layers into the single frame a panel receives.
 *
 * The background is painted under the foreground on one canvas, which then
 * quantizes to a single `pal4` frame (see render/wire.ts) — the format carries
 * up to 16 colours, so a background and a text colour cost nothing extra.
 *
 * A Lauftext foreground can't have its background baked into that same
 * canvas: the frame that scrolls *is* the bitmap, so anything painted behind
 * the glyphs would travel with them and tear open during the loop pause (see
 * docs/wire-format.md `scroll`). Instead the filmstrip is rasterised
 * transparent (as if there were no background at all) and the chosen
 * background travels as its own field on the wire DTO — a device composites
 * it as a static fill *behind* the panned filmstrip, never moving it. Both
 * hardware kinds decode that field now — see
 * docs/adr/0001-phase-lauftext-background-by-hardware-kind.md and
 * docs/plan-esp32-lauftext-background.md.
 */
export async function layersToWire(
	layers: ScreenLayers,
	size: { widthPx: number; heightPx: number },
	options: { scroll?: ScrollDto } = {},
): Promise<WireContentDto> {
	const { scroll } = options;
	const { background, foreground } = layers;

	if (foreground === null) {
		return contentToWire({ type: "color", hex: background }, size);
	}

	// Only Lauftext has to keep the background out of the rasterised canvas —
	// static text and Animation/Bild bake it in exactly as before, since that
	// picture never moves.
	const isScrollingText =
		foreground.type === "text" && foreground.mode === "scrolling";
	if (!isScrollingText) {
		return contentToWire(foreground, size, { scroll, background });
	}

	const wire = await contentToWire(foreground, size, {
		scroll,
		background: null,
	});
	if (background === null) {
		return wire;
	}
	return {
		...wire,
		background: hexToRgb(background),
	};
}
