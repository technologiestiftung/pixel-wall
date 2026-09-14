let measureCanvas: HTMLCanvasElement | null = null;

export interface FontSpec {
	fontSizePx: number;
	fontWeight: string;
	fontFamily: string;
}

/** Natural rendered width of `text` at the given font, in CSS px. */
export function measureTextWidthPx(text: string, font: FontSpec): number {
	if (!measureCanvas) {
		measureCanvas = document.createElement("canvas");
	}
	const ctx = measureCanvas.getContext("2d");
	if (!ctx) {
		return text.length * font.fontSizePx * 0.6;
	}
	ctx.font = `${font.fontWeight} ${font.fontSizePx}px ${font.fontFamily}`;
	return ctx.measureText(text).width;
}
