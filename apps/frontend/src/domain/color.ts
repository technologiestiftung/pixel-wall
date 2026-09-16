export type Rgb = [number, number, number];

export const CHANNEL_MIN = 0;
export const CHANNEL_MAX = 255;

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
