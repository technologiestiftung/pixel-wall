import { ANIMATION_FPS, LOOP_PAUSE_MS } from "../domain/content";
import {
	pfadtextPathOption,
	type PfadtextPath,
	type PfadtextPathOption,
} from "../domain/pfadtextPath";
import { marqueeOffsetPx } from "../domain/scroll";
import type { TextContent } from "../domain/types";
import { frameCountFor } from "./animatedTemplate";
import { measureCharWidthsPx, measureTextWidthPx, type FontSpec } from "./text";

/** No dependency on render/rasterize.ts here, even though rasterize.ts calls
 * into this module (drawStaticPathText) — importing back from here would
 * make that a circular module dependency. Canvas-support detection is
 * instead just the ctx-null check every function below already needs. */

function fontSpecOf(content: TextContent): FontSpec {
	return {
		fontSizePx: content.fontSizePx,
		fontWeight: content.fontWeight,
		fontFamily: content.fontFamily,
	};
}

/** Pfadtext lays text along a single curve — a newline has no defined
 * behaviour there (same spirit as Lauftext's undefined 2D-block scroll, see
 * CONTEXT.md "Content"), so multiple lines are simply joined with a space. */
function pathTextValue(content: TextContent): string {
	return content.value.replace(/\n/g, " ");
}

/** Where the text block's leading edge (its first character's start) sits
 * along the path for static Pfadtext — `pathPosition` is the curve's
 * equivalent of Text's hAlign, which has no meaning on a curve (see
 * CONTEXT.md "Content"). Mirrors render/rasterize.ts's alignOffset for the
 * "left"/"center"/"right" cases, just under this mode's own names. */
function staticAnchorPx(
	content: TextContent,
	textWidthPx: number,
	pathLengthPx: number,
): number {
	switch (content.pathPosition ?? "middle") {
		case "start":
			return 0;
		case "end":
			return pathLengthPx - textWidthPx;
		default:
			return (pathLengthPx - textWidthPx) / 2;
	}
}

/**
 * Draws `content`'s text one glyph at a time, each rotated to `path`'s own
 * tangent at its position — the curved-text counterpart of
 * render/rasterize.ts's drawStaticText/fillText calls. `anchorPx` is the
 * text block's leading edge, in arc-length px along `path`.
 */
// eslint-disable-next-line max-params -- all four are needed; splitting into an options object adds indirection for no benefit here.
function drawGlyphsAlongPath(
	ctx: CanvasRenderingContext2D,
	content: TextContent,
	anchorPx: number,
	path: PfadtextPath,
) {
	const text = pathTextValue(content);
	if (!text) {
		return;
	}
	const widths = measureCharWidthsPx(text, fontSpecOf(content));
	ctx.save();
	ctx.fillStyle = content.color;
	ctx.font = `${content.fontWeight} ${content.fontSizePx}px ${content.fontFamily}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	let cursor = anchorPx;
	for (let i = 0; i < text.length; i++) {
		const width = widths[i];
		const { x, y, angleRad } = path.pointAt(cursor + width / 2);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angleRad);
		ctx.fillText(text[i], 0, 0);
		ctx.restore();
		cursor += width;
	}
	ctx.restore();
}

/**
 * Static Pfadtext: lays the text out once at `content.pathPosition`, on
 * `content.pathId`'s path. Draws straight into `ctx` — background and the
 * canvas itself are the caller's concern (see render/rasterize.ts's
 * drawContentToCanvas), same division of labour as the existing
 * static/scrolling text branches there.
 */
export function drawStaticPathText(
	ctx: CanvasRenderingContext2D,
	content: TextContent,
) {
	const { path } = pfadtextPathOption(content.pathId);
	const textWidthPx = measureTextWidthPx(
		pathTextValue(content),
		fontSpecOf(content),
	);
	drawGlyphsAlongPath(
		ctx,
		content,
		staticAnchorPx(content, textWidthPx, path.lengthPx),
		path,
	);
}

/**
 * `marqueeOffsetPx`'s two hold positions are literally `compositeWidthPx`
 * and `-textWidthPx` (docs/wire-format.md's straight-line Lauftext model,
 * where a container's hard clipping edge is what makes sitting exactly at
 * `compositeWidthPx` already fully hidden). Pfadtext has no such edge at the
 * path's nominal start/end — the path's own extrapolated continuation can
 * keep a point over one of the real screens for a while past it (see
 * domain/pfadtextPath.ts's `offCanvasMarginPx`) — so BOTH of marqueeOffsetPx's
 * hold positions need that margin added, not just whichever one happens to
 * be the `-textWidthPx` side for a given `direction`. Padding only one (an
 * earlier version of this code padded `textWidthPx` alone) left the other
 * hold position sitting exactly at the path's unbuffered end — still visibly
 * on top of a screen there — which is what let a few trailing glyphs show up
 * in a screen's corner right as the loop reset.
 */
function effectiveCompositeWidthPx(option: PfadtextPathOption): number {
	return option.path.lengthPx + option.offCanvasMarginPx;
}

/** See effectiveCompositeWidthPx — the `-textWidthPx`-side counterpart. */
function effectiveTextWidthPx(
	content: TextContent,
	option: PfadtextPathOption,
): number {
	return (
		measureTextWidthPx(pathTextValue(content), fontSpecOf(content)) +
		option.offCanvasMarginPx
	);
}

/**
 * How running Pfadtext animates, or null when it isn't running (or has no
 * text to show) — the Pfadtext counterpart of
 * render/animatedTemplate.ts's animationTiming, with the same
 * `{frameCount, frameDurationMs}` shape so render/wire.ts and
 * render/ContentLayer.tsx can treat both uniformly.
 */
export function pathTextTiming(
	content: TextContent,
): { frameCount: number; frameDurationMs: number } | null {
	if (content.mode !== "path" || !content.pathRunning) {
		return null;
	}
	const text = pathTextValue(content).trim();
	if (!text) {
		return null;
	}
	const option = pfadtextPathOption(content.pathId);
	const travelPx =
		effectiveCompositeWidthPx(option) + effectiveTextWidthPx(content, option);
	const speedPxPerSec = content.speedPxPerSec ?? 60;
	const travelMs = speedPxPerSec > 0 ? (travelPx / speedPxPerSec) * 1000 : 0;
	const loopMs = travelMs + (content.pauseMs ?? LOOP_PAUSE_MS);
	const frameCount = frameCountFor(loopMs, ANIMATION_FPS);
	return { frameCount, frameDurationMs: loopMs / frameCount };
}

/**
 * Builds the frame strip for running Pfadtext — the Pfadtext counterpart of
 * render/animatedTemplate.ts's renderAnimationFrameStrip, reusing
 * domain/scroll.ts's marqueeOffsetPx unchanged: the same start/hold/loop
 * algorithm Lauftext already uses, just reinterpreted as an arc-length
 * offset along `content.pathId`'s path instead of an x pixel (see
 * docs/wire-format.md "frames" and
 * docs/adr/0005-pfadtext-motion-via-frame-strip.md).
 *
 * Returns null without a real 2D context (jsdom without the optional
 * `canvas` package), mirroring every other frame-strip builder.
 */
export function renderPathTextFrameStrip(
	content: TextContent,
	canvasSize: { widthPx: number; heightPx: number },
	options: { frameCount: number; background: string | null },
): HTMLCanvasElement | null {
	const { frameCount, background } = options;
	const timing = pathTextTiming(content);
	if (!timing) {
		return null;
	}
	const { frameDurationMs } = timing;
	const option = pfadtextPathOption(content.pathId);

	const strip = document.createElement("canvas");
	strip.width = Math.max(1, Math.round(canvasSize.widthPx * frameCount));
	strip.height = Math.max(1, Math.round(canvasSize.heightPx));
	const ctx = strip.getContext("2d");
	if (!ctx) {
		return null;
	}

	for (let frame = 0; frame < frameCount; frame++) {
		const slotX = frame * canvasSize.widthPx;
		if (background) {
			ctx.fillStyle = background;
			ctx.fillRect(slotX, 0, canvasSize.widthPx, canvasSize.heightPx);
		}
		const anchorPx = marqueeOffsetPx(frame * frameDurationMs, {
			compositeWidthPx: effectiveCompositeWidthPx(option),
			textWidthPx: effectiveTextWidthPx(content, option),
			speedPxPerSec: content.speedPxPerSec ?? 60,
			pauseMs: content.pauseMs ?? LOOP_PAUSE_MS,
			direction: content.direction ?? "left",
		});
		ctx.save();
		// The strip is one shared canvas across every frame's slot, and a
		// "hidden" glyph is deliberately translated far outside its own
		// frameCount*canvasSize.widthPx-wide slot (see
		// effectiveCompositeWidthPx/effectiveTextWidthPx above) — without
		// clipping to this frame's own rectangle first, that glyph's *global*
		// canvas position can still land inside some *other* frame's slot
		// instead of simply being off-canvas, bleeding text into frames that
		// should show something completely different (or nothing).
		ctx.beginPath();
		ctx.rect(slotX, 0, canvasSize.widthPx, canvasSize.heightPx);
		ctx.clip();
		ctx.translate(slotX, 0);
		drawGlyphsAlongPath(ctx, content, anchorPx, option.path);
		ctx.restore();
	}

	return strip;
}
