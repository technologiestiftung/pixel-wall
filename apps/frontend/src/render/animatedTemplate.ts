import { ANIMATION_FPS, lineColorFor, TEMPLATES } from "../domain/content";
import {
	drawUploadFrame,
	hasCanvasSupport,
	templateBox,
	uploadBox,
} from "./rasterize";
import type { AnimationContent } from "../domain/types";
import { recolorLines, waitForUploadImage } from "./templateImages";
import { sampleSvgText, type SampledFrame } from "./animatedSvg";

/** Raw SVG source text per template file, fetched once and reused for every
 * frame-strip render — see renderAnimationFrameStrip. */
const svgTextCache = new Map<string, Promise<string>>();

function fetchSvgText(file: string): Promise<string> {
	let cached = svgTextCache.get(file);
	if (!cached) {
		cached = fetch(`/visuals/${file}`).then((response) => response.text());
		svgTextCache.set(file, cached);
	}
	return cached;
}

/**
 * Samples an animated template at `frameCount` evenly-spaced points across
 * its authored loop (via render/animatedSvg.ts, the same sampler animated
 * SVG uploads use, so CSS keyframes and SMIL both work) and draws each sample
 * into its own `canvasSize`-wide slot of a `canvasSize.widthPx * frameCount`-
 * wide strip canvas — placed/scaled via the same `templateBox` math as the
 * static draw path, with the template's longer edge spanning `box.size`.
 *
 * Every template's 0%/100% keyframes are the same visual state, so sampling
 * at `i / frameCount` for `i` in `[0, frameCount)` loops seamlessly.
 *
 * Returns `null` under jsdom (see hasCanvasSupport) since there is no real
 * layout/animation engine to scrub, and for anything that isn't an animated
 * template.
 */
export async function renderAnimationFrameStrip(
	content: AnimationContent,
	canvasSize: { widthPx: number; heightPx: number },
	options: { frameCount: number; background?: string | null },
): Promise<HTMLCanvasElement | null> {
	const { frameCount, background } = options;
	if (!hasCanvasSupport()) {
		return null;
	}
	if (content.mode === "upload") {
		return renderUploadFrameStrip(content, canvasSize, options);
	}
	const template = TEMPLATES.find((t) => t.id === content.templateId);
	if (!template?.animated) {
		return null;
	}

	const box = templateBox(content, canvasSize);
	const frames = await sampleTemplate(template.file, {
		maxEdgePx: Math.max(1, Math.round(box.size)),
		loopMs: template.loopMs ?? 4000,
		frameCount,
		lineColor: lineColorFor(content),
	});
	if (!frames || frames.length === 0) {
		return null;
	}

	const strip = document.createElement("canvas");
	strip.width = Math.max(1, Math.round(canvasSize.widthPx * frameCount));
	strip.height = Math.max(1, Math.round(canvasSize.heightPx));
	const ctx = strip.getContext("2d");
	if (!ctx) {
		return null;
	}

	const first = frames[0].canvas;
	const scale = box.size / Math.max(first.width, first.height);
	for (let frame = 0; frame < frameCount; frame++) {
		const slotX = frame * canvasSize.widthPx;
		if (background) {
			ctx.fillStyle = background;
			ctx.fillRect(slotX, 0, canvasSize.widthPx, canvasSize.heightPx);
		}
		const sample = frames[frame % frames.length].canvas;
		ctx.drawImage(
			sample,
			slotX + box.x,
			box.y,
			sample.width * scale,
			sample.height * scale,
		);
	}

	return strip;
}

/** Sampled frames per template file/size/frame count, so re-rendering the
 * same strip (a background change, the preview and the wire encoder both
 * asking) doesn't re-sample the SVG. Capped like the upload image cache. */
const sampleCache = new Map<string, Promise<SampledFrame[] | null>>();
const MAX_CACHED_SAMPLES = 8;

function sampleTemplate(
	file: string,
	options: {
		maxEdgePx: number;
		loopMs: number;
		frameCount: number;
		lineColor?: string;
	},
): Promise<SampledFrame[] | null> {
	const { lineColor } = options;
	const key = `${file}|${options.maxEdgePx}|${options.frameCount}|${lineColor ?? ""}`;
	let cached = sampleCache.get(key);
	if (!cached) {
		cached = fetchSvgText(file).then((text) =>
			sampleSvgText(lineColor ? recolorLines(text, lineColor) : text, options),
		);
		cached.catch(() => sampleCache.delete(key));
		sampleCache.set(key, cached);
		if (sampleCache.size > MAX_CACHED_SAMPLES) {
			sampleCache.delete(sampleCache.keys().next().value as string);
		}
	}
	return cached;
}

/** Computes a sane frame count from a template's authored loop length and a
 * requested sample rate — shared by the wire encoder and the live preview so
 * both build the exact same strip. */
export function frameCountFor(loopMs: number, fps: number): number {
	return Math.max(1, Math.round((loopMs / 1000) * fps));
}

/**
 * How an Animation/Bild foreground animates, or null when it is a single
 * still frame — the one place the wire encoder and the live preview both ask,
 * so they always build the same strip.
 */
export function animationTiming(
	content: AnimationContent,
): { frameCount: number; frameDurationMs: number } | null {
	if (content.mode === "upload") {
		const media = content.upload;
		return media && media.frameCount > 1
			? {
					frameCount: media.frameCount,
					frameDurationMs: media.frameDurationMs,
				}
			: null;
	}
	if (content.mode !== "template") {
		return null;
	}
	const template = TEMPLATES.find((t) => t.id === content.templateId);
	if (!template?.animated) {
		return null;
	}
	const loopMs = template.loopMs ?? 4000;
	const frameCount = frameCountFor(loopMs, ANIMATION_FPS);
	return { frameCount, frameDurationMs: loopMs / frameCount };
}

/** An upload's frames are already sampled at ANIMATION_FPS (see
 * render/uploadedMedia.ts), so this only re-places each one into its slot. */
async function renderUploadFrameStrip(
	content: AnimationContent,
	canvasSize: { widthPx: number; heightPx: number },
	options: { frameCount: number; background?: string | null },
): Promise<HTMLCanvasElement | null> {
	const { frameCount, background } = options;
	const media = content.upload;
	if (!media) {
		return null;
	}
	const sheet = await waitForUploadImage(media.sheetDataUrl);
	if (!sheet) {
		return null;
	}

	const strip = document.createElement("canvas");
	strip.width = Math.max(1, Math.round(canvasSize.widthPx * frameCount));
	strip.height = Math.max(1, Math.round(canvasSize.heightPx));
	const ctx = strip.getContext("2d");
	if (!ctx) {
		return null;
	}

	const box = uploadBox(content, media, canvasSize);
	for (let frame = 0; frame < frameCount; frame++) {
		const slotX = frame * canvasSize.widthPx;
		if (background) {
			ctx.fillStyle = background;
			ctx.fillRect(slotX, 0, canvasSize.widthPx, canvasSize.heightPx);
		}
		drawUploadFrame(ctx, sheet, media, frame % media.frameCount, {
			...box,
			x: slotX + box.x,
		});
	}
	return strip;
}
