import { hexToRgb, type Rgb } from "../domain/color";

/**
 * Loose pixels for one rectangular area. Alpha is only ever 0 or 255: an LED
 * is lit or it is not, and text composited over an unlit pixel has to leave it
 * unlit rather than blend with it.
 */
export interface Rgba {
	widthPx: number;
	heightPx: number;
	data: Uint8ClampedArray;
}

export interface Point {
	x: number;
	y: number;
}

export function blankRgba(widthPx: number, heightPx: number): Rgba {
	return {
		widthPx,
		heightPx,
		data: new Uint8ClampedArray(Math.max(0, widthPx * heightPx * 4)),
	};
}

export function pixelAt(source: Rgba, { x, y }: Point): Rgb | null {
	if (x < 0 || y < 0 || x >= source.widthPx || y >= source.heightPx) {
		return null;
	}
	const at = (y * source.widthPx + x) * 4;
	if (source.data[at + 3] < 128) {
		return null;
	}
	return [source.data[at], source.data[at + 1], source.data[at + 2]];
}

/** A flat fill of the whole area — what a background layer looks like as
 * pixels, for compositing a foreground over it. */
export function solidUnderlay(
	hex: string,
	widthPx: number,
	heightPx: number,
): Rgba {
	const out = blankRgba(Math.max(1, widthPx), Math.max(1, heightPx));
	const rgb = hexToRgb(hex);
	for (let i = 0; i < out.data.length; i += 4) {
		out.data[i] = rgb[0];
		out.data[i + 1] = rgb[1];
		out.data[i + 2] = rgb[2];
		out.data[i + 3] = 255;
	}
	return out;
}
