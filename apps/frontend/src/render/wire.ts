import type { ScrollDto, WireContentDto } from "../api/types";
import {
	PAL4_MAX_COLORS,
	createMask,
	decodeBlock,
	encodeMaskBase64,
	encodePal4Base64,
	getBit,
	maskFromImageData,
	setBit,
	type Mask,
	type Palette4,
} from "../domain/mask";
import { hexToRgb, type Rgb } from "../domain/color";
import type { Content } from "../domain/types";
import { drawContentToCanvas } from "./rasterize";
import { pixelAt, type Rgba } from "./underlay";

const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Rasterises `content` into the `mask1` wire envelope — see
 * docs/wire-format.md. Every v1 content type is monochrome, so the colour
 * travels alongside the coverage mask rather than being baked into pixels.
 *
 * `pal4` exists in the format and is understood by the backend, but nothing
 * produces it yet: it is for multi-colour template artwork, and the current
 * template library is single-colour.
 */
export function contentToWire(
	content: Content,
	size: { widthPx: number; heightPx: number },
	options: { scroll?: ScrollDto; underlay?: Rgba | null } = {},
): WireContentDto {
	const { scroll, underlay } = options;
	const width = Math.max(1, Math.round(size.widthPx));
	const height = Math.max(1, Math.round(size.heightPx));
	const canvas = drawContentToCanvas(
		content,
		{ widthPx: width, heightPx: height },
		true,
	);
	const context = canvas?.getContext("2d") ?? null;

	const mask =
		context === null
			? emptyMask(content, width, height)
			: maskFromImageData(context.getImageData(0, 0, width, height).data, {
					widthPx: width,
					heightPx: height,
				});

	// Anything behind the glyphs needs a second colour in the same frame, which
	// mask1 cannot carry — it is one tint plus a coverage mask. pal4 can, and
	// every renderer already decodes it (apps/esp32 wire_decode.h, the Pi
	// compositor), so this is the one case that emits it.
	const layered =
		content.type === "text" && underlay
			? overlay(mask, hexToRgb(content.color), underlay)
			: null;

	if (layered !== null) {
		return {
			format: "pal4",
			widthPx: width,
			heightPx: height,
			data: encodePal4Base64(layered),
			...(scroll ? { scroll } : {}),
		};
	}

	return {
		format: "mask1",
		widthPx: width,
		heightPx: height,
		color: wireColor(content),
		data: encodeMaskBase64(mask),
		...(scroll ? { scroll } : {}),
	};
}

/**
 * Lays a coverage mask over the pixels already on the screens, as an indexed
 * image. Returns null when nothing is actually behind the glyphs, so the
 * cheaper mask1 encoding is kept for the ordinary case.
 *
 * Palette entry 0 is left black and unused: every renderer treats index 0 as
 * an unlit pixel rather than a colour (apps/esp32 wire_decode.h
 * `pixelWallSample`), so a visible colour has to start at index 1.
 */
function overlay(mask: Mask, textRgb: Rgb, underlay: Rgba): Palette4 | null {
	const { widthPx, heightPx } = mask;
	const palette: number[][] = [[0, 0, 0]];
	const indices = new Uint8Array(widthPx * heightPx);
	let sawUnderlay = false;

	function indexFor(rgb: Rgb): number {
		const existing = palette.findIndex(
			(entry, at) =>
				at > 0 &&
				entry[0] === rgb[0] &&
				entry[1] === rgb[1] &&
				entry[2] === rgb[2],
		);
		if (existing > 0) {
			return existing;
		}
		if (palette.length >= PAL4_MAX_COLORS) {
			// 16 colours is the format's ceiling. Content this varied cannot
			// occur from the editor (a fill or a template behind one text
			// colour), so reusing the last entry is a safety net, not a path
			// anyone should hit.
			return palette.length - 1;
		}
		palette.push([rgb[0], rgb[1], rgb[2]]);
		return palette.length - 1;
	}

	const textIndex = indexFor(textRgb);

	for (let y = 0; y < heightPx; y++) {
		for (let x = 0; x < widthPx; x++) {
			const at = y * widthPx + x;
			if (getBit(mask, x, y)) {
				indices[at] = textIndex;
				continue;
			}
			const behind = pixelAt(underlay, { x, y });
			if (behind === null) {
				continue;
			}
			sawUnderlay = true;
			indices[at] = indexFor(behind);
		}
	}

	return sawUnderlay ? { widthPx, heightPx, palette, indices } : null;
}

/** `mask1` carries one colour beside a 1-bit coverage mask, so each content
 * type contributes whatever single colour it is drawn in. Templates have no
 * colour control yet and stay white. */
function wireColor(content: Content): [number, number, number] {
	switch (content.type) {
		case "color":
			return content.hex === null ? WHITE : hexToRgb(content.hex);
		case "text":
			return hexToRgb(content.color);
		default:
			return WHITE;
	}
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
	canvas.width = Math.max(1, content.widthPx);
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
