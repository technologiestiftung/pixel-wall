import type { ScrollDto, WireContentDto } from "../api/types";
import { hexToRgb } from "../domain/color";
import type { ScreenKind, ScreenLayers } from "../domain/types";

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
 * docs/wire-format.md `scroll`). Instead, on large screens, the filmstrip is
 * rasterised transparent (as if there were no background at all) and the
 * chosen background travels as its own field on the wire DTO — a device
 * composites it as a static fill *behind* the panned filmstrip, never moving
 * it. Small screens (ESP32) don't support that compositing yet — see
 * docs/adr/0001-phase-lauftext-background-by-hardware-kind.md — so for them
 * the background is dropped entirely, exactly as it always has been.
 */
export async function layersToWire(
	layers: ScreenLayers,
	size: { widthPx: number; heightPx: number },
	options: { scroll?: ScrollDto; screenKind: ScreenKind },
): Promise<WireContentDto> {
	const { scroll, screenKind } = options;
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
	if (!scrollBackgroundSupported(layers, screenKind)) {
		return wire;
	}
	return {
		...wire,
		background: background === null ? null : hexToRgb(background),
	};
}

/** Whether a chosen background actually reaches this screen for a scrolling
 * foreground — false for anything that isn't Lauftext (those already
 * composite fine, see contentToWire) and false on small screens until phase 2
 * (ESP32 firmware) ships. */
export function scrollBackgroundSupported(
	layers: ScreenLayers,
	screenKind: ScreenKind,
): boolean {
	return (
		layers.background !== null &&
		layers.foreground?.type === "text" &&
		layers.foreground.mode === "scrolling" &&
		screenKind === "large"
	);
}

/** Whether flattening these layers would lose the background — the case the
 * editor has to warn about rather than silently drop (small screens only now
 * that large screens actually composite it — see `scrollBackgroundSupported`).
 * Black is excluded: it's exactly what a small screen falls back to anyway
 * (see CONTEXT.md "Hintergrund" on black vs. unlit being indistinguishable),
 * so there is nothing actually being lost worth interrupting the user over —
 * this also keeps the *default* background (see domain/content.ts
 * DEFAULT_BACKGROUND_HEX) from tripping the warning on every fresh edit. */
export function backgroundIsLost(
	layers: ScreenLayers,
	screenKind: ScreenKind,
): boolean {
	return (
		layers.background !== null &&
		layers.background.toUpperCase() !== "#000000" &&
		layers.foreground?.type === "text" &&
		layers.foreground.mode === "scrolling" &&
		screenKind !== "large"
	);
}
