/**
 * Loads and caches the `Animation/Bild` template artwork that lives in
 * `public/visuals/` as real SVG files, rather than the hand-drawn Path2D
 * icons in rasterize.ts. Loading is unavoidably async (the browser decodes
 * the SVG into a bitmap off the main thread), so both the live preview
 * (ContentLayer) and the wire encoder (wire.ts) need to cope with an image
 * that is not ready yet on the very first render.
 */

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** Resolves once `url` is decoded, from cache if a previous call already
 * finished. Safe to call redundantly — concurrent callers share one load. */
export function loadSvgTemplate(url: string): Promise<HTMLImageElement> {
	const cached = cache.get(url);
	if (cached) {
		return Promise.resolve(cached);
	}
	const existing = pending.get(url);
	if (existing) {
		return existing;
	}

	const promise = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => {
			cache.set(url, image);
			pending.delete(url);
			resolve(image);
		};
		image.onerror = () => {
			pending.delete(url);
			reject(new Error(`Failed to load template image: ${url}`));
		};
		image.src = url;
	});
	pending.set(url, promise);
	return promise;
}

/** Non-blocking accessor for synchronous rasterization paths (rasterize.ts):
 * returns the decoded image only if `loadSvgTemplate` has already resolved. */
export function getLoadedSvgTemplate(url: string): HTMLImageElement | null {
	return cache.get(url) ?? null;
}

/** Kicks off loading without waiting — called once at startup (see
 * domain/content.ts) so templates are typically ready before the user opens
 * the Animation/Bild panel. Failures are swallowed: a template that fails to
 * load simply stays blank until retried by contentToWire or the panel. */
export function preloadSvgTemplates(urls: string[]): void {
	for (const url of urls) {
		loadSvgTemplate(url).catch(() => {});
	}
}
