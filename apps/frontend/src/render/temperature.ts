import type { TemperatureDto } from "../api/types";
import { hexToRgb } from "../domain/color";
import {
	createMask,
	encodeMaskBase64,
	getBit,
	maskFromImageData,
	type Mask,
} from "../domain/mask";
import type { TemperatureStyle } from "../domain/types";
import { waitForFont } from "./fonts";
import { alignOffset, hasCanvasSupport } from "./rasterize";

/** Must match TEMPERATURE_GLYPHS in apps/backend/app/models.py. */
export const TEMPERATURE_GLYPHS = "0123456789-°";

/** Shown in the preview until the backend has a reading, so the temperature's
 * size and position can be set up before then. The wall itself shows nothing. */
export const TEMPERATURE_PLACEHOLDER = "--°";

export type TemperatureGlyphs = Record<string, Mask>;

/** One reading ready to draw: its text, and the glyphs and style to draw it in. */
export interface TemperatureReading {
	text: string;
	glyphs: TemperatureGlyphs;
	style: TemperatureStyle;
}

const glyphCache = new Map<string, Promise<TemperatureGlyphs>>();

/** `Math.round` rounds half up, which apps/backend/app/weather.py's
 * `whole_degrees` copies — the preview and the wall must agree at x.5. */
export function formatTemperature(celsius: number): string {
	return `${Math.round(celsius)}°`;
}

/**
 * Each character rendered once, on its own, into a cell as wide as its
 * advance and as tall as a line of text — the pieces both the preview and the
 * backend line a reading up from. Drawn without kerning between characters,
 * since the backend can't know which pairs a font kerns.
 */
export function renderTemperatureGlyphs(
	style: TemperatureStyle,
): Promise<TemperatureGlyphs> {
	const font = `${style.fontWeight} ${style.fontSizePx}px ${style.fontFamily}`;
	let cached = glyphCache.get(font);
	if (!cached) {
		cached = waitForFont(style.fontFamily, style.fontWeight).then(() =>
			drawGlyphs(style, font),
		);
		glyphCache.set(font, cached);
	}
	return cached;
}

function drawGlyphs(style: TemperatureStyle, font: string): TemperatureGlyphs {
	const heightPx = Math.ceil(style.fontSizePx * 1.2);
	const glyphs: TemperatureGlyphs = {};
	const measure = hasCanvasSupport()
		? document.createElement("canvas").getContext("2d")
		: null;
	if (measure) {
		measure.font = font;
	}
	for (const char of TEMPERATURE_GLYPHS) {
		if (!measure) {
			glyphs[char] = createMask(Math.ceil(style.fontSizePx * 0.6), heightPx);
			continue;
		}
		const widthPx = Math.max(1, Math.ceil(measure.measureText(char).width));

		const canvas = document.createElement("canvas");
		canvas.width = widthPx;
		canvas.height = heightPx;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			glyphs[char] = createMask(widthPx, heightPx);
			continue;
		}
		ctx.font = font;
		ctx.fillStyle = "#ffffff";
		ctx.textBaseline = "middle";
		ctx.fillText(char, 0, heightPx / 2);
		glyphs[char] = maskFromImageData(
			ctx.getImageData(0, 0, widthPx, heightPx).data,
			{ widthPx, heightPx },
		);
	}
	return glyphs;
}

/** Top-left corner of `text` within one frame. */
export function layoutTemperature(
	reading: TemperatureReading,
	frame: { widthPx: number; heightPx: number },
): { x: number; y: number } {
	const { text, glyphs, style } = reading;
	const chars = [...text];
	const widthPx = chars.reduce((sum, c) => sum + glyphs[c].widthPx, 0);
	const heightPx = glyphs[chars[0]].heightPx;
	return {
		x: Math.round(
			alignOffset(style.hAlign, frame.widthPx, widthPx, style.paddingXPx),
		),
		y: Math.round(
			alignOffset(style.vAlign, frame.heightPx, heightPx, style.paddingYPx),
		),
	};
}

/** The preview's copy of what the backend stamps onto every frame. */
export function drawTemperature(
	ctx: CanvasRenderingContext2D,
	reading: TemperatureReading,
) {
	const { text, glyphs, style } = reading;
	const origin = layoutTemperature(reading, {
		widthPx: ctx.canvas.width,
		heightPx: ctx.canvas.height,
	});
	ctx.fillStyle = style.color;
	let cursor = origin.x;
	for (const char of text) {
		const glyph = glyphs[char];
		for (let y = 0; y < glyph.heightPx; y++) {
			for (let x = 0; x < glyph.widthPx; x++) {
				if (getBit(glyph, x, y)) {
					ctx.fillRect(cursor + x, origin.y + y, 1, 1);
				}
			}
		}
		cursor += glyph.widthPx;
	}
}

export async function temperatureToWire(
	style: TemperatureStyle,
): Promise<TemperatureDto> {
	const glyphs = await renderTemperatureGlyphs(style);
	return {
		glyphs: Object.fromEntries(
			Object.entries(glyphs).map(([char, mask]) => [
				char,
				encodeMaskBase64(mask),
			]),
		),
		color: hexToRgb(style.color),
		hAlign: style.hAlign,
		vAlign: style.vAlign,
		paddingXPx: style.paddingXPx,
		paddingYPx: style.paddingYPx,
	};
}
