import { useSyncExternalStore } from "react";

/**
 * Custom font families registered via @font-face (see index.css). Unlike a
 * DOM text element, canvas text (rasterize.ts) only ever picks up a font
 * once the browser has actually finished loading it — until then `ctx.font`
 * silently falls back to the next family in the list, exactly the bug that
 * previously made "Pixel Grotesk" a no-op. These are eagerly requested here,
 * at both weights the "Schnitt" control offers, mirroring the async-load +
 * version-bump pattern in templateImages.ts.
 */
const CUSTOM_FONTS = ["Pixelify Sans", "Host Grotesk"];
const WEIGHTS = ["400", "700"];

const cache = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
	version += 1;
	for (const listener of listeners) {
		listener();
	}
}

function fontKey(family: string, weight: string): string {
	return `${weight} "${family}"`;
}

// `document.fonts` doesn't exist in jsdom test environments — degrade to an
// empty cache there rather than throwing, matching the existing "no canvas
// package" fallback in rasterize.ts.
if (typeof document !== "undefined" && document.fonts) {
	for (const family of CUSTOM_FONTS) {
		for (const weight of WEIGHTS) {
			document.fonts
				.load(`${weight} 16px "${family}"`)
				.then(() => {
					cache.add(fontKey(family, weight));
					notify();
				})
				.catch(() => {
					// Loading failed (missing file, unsupported format) — canvas
					// keeps falling back to the next family in the list, same as
					// before this font existed.
				});
		}
	}
}

/**
 * Resolves once `fontFamily`'s first custom family at `fontWeight` has
 * finished loading (or immediately, if it's not one of ours, or already
 * loaded) — for callers outside React that can't take a dependency on
 * `useFontsVersion`, namely render/wire.ts, which must not quantize a canvas
 * still drawn in the fallback font into the payload sent to the physical
 * screens.
 */
export function waitForFont(
	fontFamily: string,
	fontWeight: string,
): Promise<void> {
	const primaryFamily = fontFamily
		.split(",")[0]
		?.trim()
		.replace(/^["']|["']$/g, "");
	if (
		typeof document === "undefined" ||
		!document.fonts ||
		!primaryFamily ||
		!CUSTOM_FONTS.includes(primaryFamily)
	) {
		return Promise.resolve();
	}
	if (cache.has(fontKey(primaryFamily, fontWeight))) {
		return Promise.resolve();
	}
	return document.fonts
		.load(`${fontWeight} 16px "${primaryFamily}"`)
		.then(() => undefined)
		.catch(() => undefined);
}

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	return () => listeners.delete(onChange);
}

function getSnapshot(): number {
	return version;
}

function getServerSnapshot(): number {
	return 0;
}

/** Bumps whenever a custom font finishes loading — take a dependency on this
 * in any memoized render that draws text so it recomputes once the real
 * typeface is actually available. */
export function useFontsVersion(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
