import type { FramesDto, ScrollDto, WireContentDto } from "../api/types";
import {
	createMask,
	decodeBlock,
	encodeMaskBase64,
	encodePal4Base64,
	maskFromImageData,
	pal4FromImageData,
	setBit,
} from "../domain/mask";
import { hexToRgb } from "../domain/color";
import { ANIMATION_FPS, TEMPLATES } from "../domain/content";
import type { AnimationContent, Content, TextContent } from "../domain/types";
import { frameCountFor, renderAnimationFrameStrip } from "./animatedTemplate";
import { waitForFont } from "./fonts";
import { drawContentToCanvas, hasCanvasSupport } from "./rasterize";
import { waitForTemplateImage } from "./templateImages";

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
		const template = TEMPLATES.find((t) => t.id === content.templateId);
		if (template?.animated) {
			return animationToFramesWire(content, template, {
				width,
				height,
				background,
			});
		}
	}

	if (content.type === "animation" && hasCanvasSupport()) {
		await waitForTemplateImage(content.templateId);
	}
	if (content.type === "text" && hasCanvasSupport()) {
		await waitForFont(content.fontFamily, content.fontWeight);
	}

	const canvas = drawContentToCanvas(
		content,
		{ widthPx: width, heightPx: height },
		{ background },
	);
	const context = canvas?.getContext("2d") ?? null;

	const image = context
		? pal4FromImageData(context.getImageData(0, 0, width, height).data, {
				widthPx: width,
				heightPx: height,
			})
		: {
				widthPx: width,
				heightPx: height,
				palette: [[0, 0, 0]],
				indices: new Uint8Array(width * height),
			};

	return {
		format: "pal4",
		widthPx: width,
		heightPx: height,
		data: encodePal4Base64(image),
		...(scroll ? { scroll } : {}),
	};
}

/**
 * Builds the `pal4` envelope for an animated Animation/Bild template: a wide
 * strip of `frameCount` samples of its own CSS animation (see
 * render/animatedTemplate.ts), quantized once as a single palette/frame so
 * a device can crop whichever `compositeWidthPx`-wide slot the elapsed time
 * says to show — the frame-strip counterpart of Lauftext's filmstrip (see
 * docs/wire-format.md `frames`).
 *
 * `width`/`height` here are one frame's size (the composite each screen's
 * window is measured against), not the strip's — the returned `widthPx` is
 * `width * frameCount`, matching what `data` actually contains.
 */
async function animationToFramesWire(
	content: AnimationContent,
	template: { loopMs?: number },
	size: { width: number; height: number; background: string | null },
): Promise<WireContentDto> {
	const { width, height, background } = size;
	const frameCount = frameCountFor(template.loopMs ?? 4000, ANIMATION_FPS);
	const frames: FramesDto = {
		frameCount,
		frameDurationMs: (template.loopMs ?? 4000) / frameCount,
		compositeWidthPx: width,
	};

	const strip = await renderAnimationFrameStrip(
		content,
		{ widthPx: width, heightPx: height },
		{ frameCount, background },
	);
	const context = strip?.getContext("2d") ?? null;
	const stripWidth = width * frameCount;

	const image = context
		? pal4FromImageData(context.getImageData(0, 0, stripWidth, height).data, {
				widthPx: stripWidth,
				heightPx: height,
			})
		: {
				widthPx: stripWidth,
				heightPx: height,
				palette: [[0, 0, 0]],
				indices: new Uint8Array(stripWidth * height),
			};

	return {
		format: "pal4",
		widthPx: stripWidth,
		heightPx: height,
		data: encodePal4Base64(image),
		frames,
	};
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
 * Paints a wire payload back to a data URL for the preview, so a screen
 * hydrated from the backend looks the same as one edited locally.
 * Clear pixels stay transparent: the tile behind is already black, which is
 * what an unlit LED looks like.
 */
export function wireToDataUrl(content: WireContentDto): string {
	const canvas = document.createElement("canvas");
	// A `frames` payload's `data` is the whole multi-frame strip (see
	// animationToFramesWire above) — this static preview shows just frame 0,
	// which is exactly the strip's first `compositeWidthPx`-wide slot.
	canvas.width = Math.max(
		1,
		content.frames?.compositeWidthPx ?? content.widthPx,
	);
	canvas.height = Math.max(1, content.heightPx);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return "";
	}

	const decoded = decodeBlock(base64ToBytes(content.data));
	const image = ctx.createImageData(canvas.width, canvas.height);
	const [r, g, b] = content.color ?? WHITE;

	for (let y = 0; y < canvas.height; y++) {
		for (let x = 0; x < canvas.width; x++) {
			const target = (y * canvas.width + x) * 4;
			if (decoded.format === "mask1") {
				const stride = Math.ceil(decoded.mask.widthPx / 8);
				const on =
					(decoded.mask.bits[y * stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
				if (!on) {
					continue;
				}
				image.data[target] = r;
				image.data[target + 1] = g;
				image.data[target + 2] = b;
				image.data[target + 3] = 255;
				continue;
			}

			const index = decoded.image.indices[y * decoded.image.widthPx + x];
			if (index === 0) {
				continue;
			}
			const entry = decoded.image.palette[index] ?? WHITE;
			image.data[target] = entry[0];
			image.data[target + 1] = entry[1];
			image.data[target + 2] = entry[2];
			image.data[target + 3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);
	return canvas.toDataURL("image/png");
}

function base64ToBytes(encoded: string): Uint8Array {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
