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
const CUSTOM_FONTS = ["Pixelify Sans", "Host Grotesk", "FrankMoji"];
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
 * Resolves once every custom family in `fontFamily` at `fontWeight` has
 * finished loading (or immediately, if none are ours, or all are already
 * loaded) — for callers outside React that can't take a dependency on
 * `useFontsVersion`, namely render/wire.ts, which must not quantize a canvas
 * still drawn in the fallback font into the payload sent to the physical
 * screens. Every family is awaited, not just the first, because a stack
 * like "Host Grotesk, FrankMoji" draws emoji from the second one.
 */
export function waitForFont(
	fontFamily: string,
	fontWeight: string,
): Promise<void> {
	if (typeof document === "undefined" || !document.fonts) {
		return Promise.resolve();
	}
	const pending = fontFamily
		.split(",")
		.map((family) => family.trim().replace(/^["']|["']$/g, ""))
		.filter(
			(family) =>
				CUSTOM_FONTS.includes(family) &&
				!cache.has(fontKey(family, fontWeight)),
		)
		.map((family) =>
			document.fonts
				.load(`${fontWeight} 16px "${family}"`)
				.catch(() => undefined),
		);
	return Promise.all(pending).then(() => undefined);
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
