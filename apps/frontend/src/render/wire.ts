import type { FramesDto, ScrollDto, WireContentDto } from "../api/types";
import {
	createMask,
	decodeBlock,
	encodeMaskBase64,
	encodePal4Base64,
	maskFromImageData,
	pal4FromImageData,
	setBit,
	strideFor,
	type Mask,
	type Palette4,
} from "../domain/mask";
import { hexToRgb } from "../domain/color";
import { lineColorFor } from "../domain/content";
import { base64ToBytes } from "../lib/base64";
import type { AnimationContent, Content, TextContent } from "../domain/types";
import { animationTiming, renderAnimationFrameStrip } from "./animatedTemplate";
import { waitForFont } from "./fonts";
import { pathTextTiming, renderPathTextFrameStrip } from "./pathText";
import { drawContentToCanvas, hasCanvasSupport } from "./rasterize";
import { waitForTemplateImage, waitForUploadImage } from "./templateImages";

const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Rasterises `content` into a wire envelope — see docs/wire-format.md. Farbe
 * is genuinely single-coloured, so its colour travels alongside a coverage
 * mask (`mask1`) rather than being baked into pixels. Text and Animation/Bild
 * both go out as `pal4` instead (see contentToPal4Wire): text carries a
 * user-chosen colour (see TextContent.color) rather than always being white,
 * and every template is real, possibly multi-coloured SVG artwork (see
 * domain/content.ts's `TEMPLATES`) — neither should be silhouetted down to a
 * flat colour baked in elsewhere.
 *
 * Async because a template's artwork must finish decoding before it can be
 * drawn; the `mask1` path stays synchronous internally, it just resolves
 * immediately.
 */
export async function contentToWire(
	content: Content,
	size: { widthPx: number; heightPx: number },
	options: { scroll?: ScrollDto; background?: string | null } = {},
): Promise<WireContentDto> {
	const { scroll, background = null } = options;
	const width = Math.max(1, Math.round(size.widthPx));
	const height = Math.max(1, Math.round(size.heightPx));

	// No bitmap, ever — and deliberately checked before `background` is even
	// looked at, so a screen's Hintergrund is never leaked onto the wire for
	// this content (see CONTEXT.md "Content" — Game of Life suspends,
	// never composites, a screen's Hintergrund).
	if (content.type === "animation" && content.mode === "gameOfLife") {
		return { format: "gameOfLife" };
	}

	if (content.type === "animation" || content.type === "text") {
		return contentToPal4Wire(content, { width, height, scroll, background });
	}

	const canvas = drawContentToCanvas(
		content,
		{ widthPx: width, heightPx: height },
		{ monochrome: true },
	);
	const context = canvas?.getContext("2d") ?? null;

	const mask =
		context === null
			? emptyMask(content, width, height)
			: maskFromImageData(context.getImageData(0, 0, width, height).data, {
					widthPx: width,
					heightPx: height,
				});

	return {
		format: "mask1",
		widthPx: width,
		heightPx: height,
		// "ohne" has no colour of its own; the mask is empty anyway.
		color:
			content.type === "color" && content.hex !== null
				? hexToRgb(content.hex)
				: WHITE,
		data: encodeMaskBase64(mask),
		...(scroll ? { scroll } : {}),
	};
}

/**
 * Builds the `pal4` envelope for an Animation/Bild template or Text: for a
 * template, waits for its artwork to finish decoding first; either way, draws
 * the content in true colour, then quantizes to <=16 palette entries (see
 * domain/mask.ts's pal4FromImageData) — for text this is normally just 1-2
 * colours (background + the chosen text colour). Skips the artwork wait
 * without a real 2D context (jsdom without the optional `canvas` package) —
 * jsdom's `Image` never actually fires `load`/`error` there, so waiting would
 * hang forever — and falls back to a blank frame instead, mirroring emptyMask
 * below.
 */
async function contentToPal4Wire(
	content: AnimationContent | TextContent,
	size: {
		width: number;
		height: number;
		scroll?: ScrollDto;
		background?: string | null;
	},
): Promise<WireContentDto> {
	const { width, height, scroll, background = null } = size;

	if (content.type === "animation") {
		const timing = animationTiming(content);
		if (timing) {
			const strip = await renderAnimationFrameStrip(
				content,
				{ widthPx: width, heightPx: height },
				{ frameCount: timing.frameCount, background },
			);
			return framesWire(strip, timing, { width, height });
		}
	}

	if (content.type === "text" && content.mode === "path") {
		const timing = pathTextTiming(content);
		if (timing) {
			const strip = renderPathTextFrameStrip(
				content,
				{ widthPx: width, heightPx: height },
				{ frameCount: timing.frameCount, background },
			);
			return framesWire(strip, timing, { width, height });
		}
		// Static Pfadtext falls through to the generic drawContentToCanvas path
		// below, exactly like static/scrolling text.
	}

	if (content.type === "animation" && hasCanvasSupport()) {
		if (content.mode === "upload") {
			if (content.upload) {
				await waitForUploadImage(content.upload.sheetDataUrl);
			}
		} else {
			await waitForTemplateImage(content.templateId, lineColorFor(content));
		}
	}
	if (content.type === "text" && hasCanvasSupport()) {
		await waitForFont(content.fontFamily, content.fontWeight);
	}

	const canvas = drawContentToCanvas(
		content,
		{ widthPx: width, heightPx: height },
		{ background },
	);

	return {
		format: "pal4",
		widthPx: width,
		heightPx: height,
		data: encodePal4Base64(
			canvasToPal4(canvas, { widthPx: width, heightPx: height }),
		),
		...(scroll ? { scroll } : {}),
	};
}

/**
 * Builds the `pal4` envelope around an already-rendered frame strip — shared
 * by an animated Animation/Bild template (render/animatedTemplate.ts) and
 * running Pfadtext (render/pathText.ts), which both produce a
 * `frameCount`-wide strip of `width`×`height` slots the same way: quantized
 * once as a single palette/frame so a device can crop whichever
 * `compositeWidthPx`-wide slot the elapsed time says to show — the
 * frame-strip counterpart of Lauftext's filmstrip (see docs/wire-format.md
 * `frames`).
 *
 * `width`/`height` here are one frame's size (the composite each screen's
 * window is measured against), not the strip's — the returned `widthPx` is
 * `width * frameCount`, matching what `data` actually contains.
 */
function framesWire(
	strip: HTMLCanvasElement | null,
	timing: { frameCount: number; frameDurationMs: number },
	size: { width: number; height: number },
): WireContentDto {
	const { width, height } = size;
	const { frameCount, frameDurationMs } = timing;
	const frames: FramesDto = {
		frameCount,
		frameDurationMs,
		compositeWidthPx: width,
	};
	const stripWidth = width * frameCount;

	return {
		format: "pal4",
		widthPx: stripWidth,
		heightPx: height,
		data: encodePal4Base64(
			canvasToPal4(strip, {
				widthPx: stripWidth,
				heightPx: height,
				crisp: true,
			}),
		),
		frames,
	};
}

/** Without a canvas (jsdom without the optional `canvas` package) the frame
 * degrades to blank, mirroring emptyMask below. */
function canvasToPal4(
	canvas: HTMLCanvasElement | null,
	options: { widthPx: number; heightPx: number; crisp?: boolean },
): Palette4 {
	const { widthPx, heightPx } = options;
	const context = canvas?.getContext("2d") ?? null;
	if (!context) {
		return {
			widthPx,
			heightPx,
			palette: [[0, 0, 0]],
			indices: new Uint8Array(widthPx * heightPx),
		};
	}
	return pal4FromImageData(
		context.getImageData(0, 0, widthPx, heightPx).data,
		options,
	);
}

/** Without a 2D context (jsdom without the optional `canvas` package) a flat
 * colour fill is still exactly representable; anything else degrades to blank
 * rather than throwing. */
function emptyMask(content: Content, widthPx: number, heightPx: number) {
	const mask = createMask(widthPx, heightPx);
	if (content.type === "color" && content.hex !== null) {
		for (let y = 0; y < heightPx; y++) {
			for (let x = 0; x < widthPx; x++) {
				setBit(mask, x, y);
			}
		}
	}
	return mask;
}

/**
 * The width of the *selection* a wire content belongs to — not necessarily
 * `content.widthPx`, which for Lauftext or an animated template is the
 * filmstrip/frame-strip's own width (`textWidthPx`, or
 * `frameCount * compositeWidthPx`), wider than the composite it actually
 * plays across. Used wherever a screen is rebuilt from a hydrated wire
 * payload rather than from live selection/layout geometry — getting this
 * wrong for `frames` isn't just cosmetic: `animatedTemplate.ts` rebuilds its
 * strip at this width *per frame*, so feeding back the whole strip's width
 * multiplies it by `frameCount` again, a canvas far beyond what any browser
 * will actually allocate — which silently degrades to an unusable image
 * rather than throwing.
 */
export function compositeWidthOf(content: WireContentDto): number {
	// gameOfLife has no bitmap and so no real width to report — the value is
	// never actually consulted for it (ContentLayer.tsx renders its
	// placeholder before sizing off this), so this is just a safe,
	// small-screen-sized fallback rather than throwing.
	if (content.format === "gameOfLife") {
		return 32;
	}
	return (
		content.frames?.compositeWidthPx ??
		content.scroll?.compositeWidthPx ??
		content.widthPx
	);
}

/**
 * Paints a wire payload back to a data URL for the preview, so a screen
 * hydrated from the backend looks the same as one edited locally.
 * Clear pixels stay transparent: the tile behind is already black, which is
 * what an unlit LED looks like.
 */
export function wireToDataUrl(content: WireContentDto): string {
	// Never actually reached in practice — a gameOfLife screen always carries
	// `source` (every apply request sends it), so hydrateScreen's fallback to
	// this function never triggers for one — but the type allows it, so this
	// degrades to blank rather than reading fields that don't exist on it.
	if (content.format === "gameOfLife") {
		return "";
	}

	const canvas = document.createElement("canvas");
	// A `frames` payload's `data` is the whole multi-frame strip (see
	// animationToFramesWire above) — this static preview shows just frame 0,
	// which is exactly the strip's first `compositeWidthPx`-wide slot.
	canvas.width = Math.max(1, compositeWidthOf(content));
	canvas.height = Math.max(1, content.heightPx);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return "";
	}

	const decoded = decodeBlock(base64ToBytes(content.data));
	const image = ctx.createImageData(canvas.width, canvas.height);
	if (decoded.format === "mask1") {
		paintMask(image, decoded.mask, content.color ?? WHITE);
	} else {
		paintPal4(image, decoded.image);
	}
	ctx.putImageData(image, 0, 0);
	return canvas.toDataURL("image/png");
}

function paintMask(
	image: ImageData,
	mask: Mask,
	[r, g, b]: [number, number, number],
) {
	const stride = strideFor(mask.widthPx);
	for (let y = 0; y < image.height; y++) {
		for (let x = 0; x < image.width; x++) {
			if ((mask.bits[y * stride + (x >> 3)] & (0x80 >> (x & 7))) === 0) {
				continue;
			}
			const target = (y * image.width + x) * 4;
			image.data[target] = r;
			image.data[target + 1] = g;
			image.data[target + 2] = b;
			image.data[target + 3] = 255;
		}
	}
}

function paintPal4(image: ImageData, pal4: Palette4) {
	for (let y = 0; y < image.height; y++) {
		for (let x = 0; x < image.width; x++) {
			const index = pal4.indices[y * pal4.widthPx + x];
			if (index === 0) {
				continue;
			}
			const entry = pal4.palette[index] ?? WHITE;
			const target = (y * image.width + x) * 4;
			image.data[target] = entry[0];
			image.data[target + 1] = entry[1];
			image.data[target + 2] = entry[2];
			image.data[target + 3] = 255;
		}
	}
}
