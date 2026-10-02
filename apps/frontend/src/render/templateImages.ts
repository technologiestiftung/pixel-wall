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

export function getTemplateImage(
	templateId: string,
	lineColor?: string,
): HTMLImageElement | undefined {
	if (lineColor) {
		return recoloredTemplate(templateId, lineColor)?.img;
	}
	return cache.get(templateId) ?? cache.get(TEMPLATES[0].id);
}

/** Line-art templates are authored in white or near-white strokes (and
 * fills for small details like arrowheads); this swaps them for the chosen
 * colour. */
export function recolorLines(svgText: string, color: string): string {
	return svgText.replace(
		/(stroke|fill)="(white|#fff|#ffffff|#fafaf2)"/gi,
		`$1="${color}"`,
	);
}

/** Recoloured copies of line-art templates, built on demand from the SVG
 * source. `ready` settles once the copy has decoded — an image whose `src`
 * isn't set yet reports `complete`, so waitForImage alone can't tell. */
const recoloredCache = new Map<
	string,
	{ img: HTMLImageElement; ready: Promise<HTMLImageElement | undefined> }
>();
const MAX_RECOLORED = 16;

function recoloredTemplate(templateId: string, lineColor: string) {
	if (typeof Image === "undefined") {
		return undefined;
	}
	const template = TEMPLATES.find((t) => t.id === templateId);
	if (!template) {
		return undefined;
	}
	const key = `${templateId}|${lineColor}`;
	let entry = recoloredCache.get(key);
	if (!entry) {
		const img = new Image();
		img.onload = notify;
		const ready = fetch(`/visuals/${template.file}`)
			.then((response) => response.text())
			.then((text) => {
				img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
					recolorLines(text, lineColor),
				)}`;
				return waitForImage(img);
			})
			.catch(() => undefined);
		entry = { img, ready };
		recoloredCache.set(key, entry);
		if (recoloredCache.size > MAX_RECOLORED) {
			recoloredCache.delete(recoloredCache.keys().next().value as string);
		}
	}
	return entry;
}

/** Upload sprite sheets are data URLs decoded on demand rather than at
 * startup, sharing the template cache's version so the same re-render hook
 * covers both. Capped so a long editing session doesn't hold every sheet
 * ever uploaded. */
const uploadCache = new Map<string, HTMLImageElement>();
const MAX_CACHED_UPLOADS = 8;

export function getUploadImage(
	sheetDataUrl: string,
): HTMLImageElement | undefined {
	if (typeof Image === "undefined") {
		return undefined;
	}
	let img = uploadCache.get(sheetDataUrl);
	if (!img) {
		img = new Image();
		img.onload = notify;
		img.src = sheetDataUrl;
		uploadCache.set(sheetDataUrl, img);
		if (uploadCache.size > MAX_CACHED_UPLOADS) {
			uploadCache.delete(uploadCache.keys().next().value as string);
		}
	}
	return img;
}

/**
 * Resolves once a template's image has finished decoding (or failed to),
 * for callers outside React that can't take a dependency on
 * `useTemplateImagesVersion` — namely render/wire.ts, which must not
 * quantize a still-blank canvas into the payload sent to the physical
 * screens. Resolves immediately if the image is already settled or doesn't
 * exist (e.g. `Image` is unavailable under jsdom, see above).
 */
export function waitForTemplateImage(
	templateId: string,
	lineColor?: string,
): Promise<HTMLImageElement | undefined> {
	if (lineColor) {
		return (
			recoloredTemplate(templateId, lineColor)?.ready ??
			Promise.resolve(undefined)
		);
	}
	return waitForImage(getTemplateImage(templateId));
}

export function waitForUploadImage(
	sheetDataUrl: string,
): Promise<HTMLImageElement | undefined> {
	return waitForImage(getUploadImage(sheetDataUrl));
}

function waitForImage(
	img: HTMLImageElement | undefined,
): Promise<HTMLImageElement | undefined> {
	if (!img) {
		return Promise.resolve(undefined);
	}
	if (img.complete) {
		return Promise.resolve(img.naturalWidth > 0 ? img : undefined);
	}
	return new Promise((resolve) => {
		const settle = () => {
			img.removeEventListener("load", settle);
			img.removeEventListener("error", settle);
			resolve(img.naturalWidth > 0 ? img : undefined);
		};
		img.addEventListener("load", settle);
		img.addEventListener("error", settle);
	});
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
