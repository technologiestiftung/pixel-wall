import type { ScrollDto, WireContentDto } from "../api/types";
import {
	createMask,
	decodeBlock,
	encodeMaskBase64,
	maskFromImageData,
	setBit,
} from "../domain/mask";
import { hexToRgb } from "../domain/color";
import type { Content } from "../domain/types";
import { drawContentToCanvas } from "./rasterize";

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
	scroll?: ScrollDto,
): WireContentDto {
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

	return {
		format: "mask1",
		widthPx: width,
		heightPx: height,
		color: wireColor(content),
		data: encodeMaskBase64(mask),
		...(scroll ? { scroll } : {}),
	};
}

/** `mask1` carries one colour beside a 1-bit coverage mask, so each content
 * type contributes whatever single colour it is drawn in. Templates have no
 * colour control yet and stay white. */
function wireColor(content: Content): [number, number, number] {
	switch (content.type) {
		case "color":
			return hexToRgb(content.hex);
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
	if (content.type === "color") {
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
