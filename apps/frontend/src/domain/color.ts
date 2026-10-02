export type Rgb = [number, number, number];

const CHANNEL_MIN = 0;
const CHANNEL_MAX = 255;

export function clampChannel(value: number): number {
	if (Number.isNaN(value)) {
		return CHANNEL_MIN;
	}
	return Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, Math.round(value)));
}

/** Accepts `#rgb`, `#rrggbb` or the same without the hash. Anything
 * unparseable reads as 0 for that channel rather than throwing — the value
 * comes from user input and a half-typed hex must not break the preview. */
export function hexToRgb(hex: string): Rgb {
	const digits = hex.replace("#", "");
	const full =
		digits.length === 3
			? digits
					.split("")
					.map((c) => c + c)
					.join("")
			: digits;
	return [
		Number.parseInt(full.slice(0, 2), 16) || 0,
		Number.parseInt(full.slice(2, 4), 16) || 0,
		Number.parseInt(full.slice(4, 6), 16) || 0,
	];
}

export function rgbToHex(rgb: Rgb): string {
	return `#${rgb
		.map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase()}`;
}

/** WCAG's threshold for large text — the wall's glyphs are always large
 * relative to the panel, so the stricter 4.5:1 body-text bar doesn't apply. */
export const MIN_TEXT_CONTRAST = 3;

function relativeLuminance(hex: string): number {
	const [r, g, b] = hexToRgb(hex).map((channel) => {
		const c = channel / CHANNEL_MAX;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
	const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
		(x, y) => y - x,
	);
	return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG's minimum for graphics and lines (1.4.11 Non-text Contrast). */
export const MIN_LINE_CONTRAST = 3;
