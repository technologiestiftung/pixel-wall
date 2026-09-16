import { useSyncExternalStore } from "react";
import { TEMPLATES } from "../domain/content";

/**
 * Eagerly-loaded `<img>` elements for every template SVG under
 * `public/visuals/`, keyed by template id. Loading is async (real image
 * decode), so both the canvas rasterizer (rasterize.ts) and the live preview
 * (ContentLayer.tsx) may run before an image is ready — callers must check
 * `complete`/`naturalWidth` and re-render via `useTemplateImagesVersion` once
 * loading finishes rather than assuming the image is already usable.
 */
const cache = new Map<string, HTMLImageElement>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
	version += 1;
	for (const listener of listeners) {
		listener();
	}
}

// `Image` doesn't exist in jsdom test environments without extra setup —
// degrade to an empty cache there rather than throwing, matching the
// existing "no canvas package" fallback in rasterize.ts.
if (typeof Image !== "undefined") {
	for (const template of TEMPLATES) {
		const img = new Image();
		img.onload = notify;
		img.src = `/visuals/${template.file}`;
		cache.set(template.id, img);
	}
}

export function getTemplateImage(templateId: string): HTMLImageElement | undefined {
	return cache.get(templateId) ?? cache.get(TEMPLATES[0].id);
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

/** Bumps whenever a template image finishes loading — take a dependency on
 * this in any memoized render that draws a template so it recomputes once
 * the source art is actually available. */
export function useTemplateImagesVersion(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
