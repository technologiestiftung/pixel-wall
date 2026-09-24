import { TEMPLATES } from "../domain/content";
import { hasCanvasSupport, templateBox } from "./rasterize";
import type { AnimationContent } from "../domain/types";

/** Raw SVG source text per template file, fetched once and reused for every
 * frame-strip render (and every fps a user tries) — see renderAnimationFrameStrip. */
const svgTextCache = new Map<string, Promise<string>>();

function fetchSvgText(file: string): Promise<string> {
	let cached = svgTextCache.get(file);
	if (!cached) {
		cached = fetch(`/visuals/${file}`).then((response) => response.text());
		svgTextCache.set(file, cached);
	}
	return cached;
}

/**
 * Samples an animated template's own CSS `@keyframes` at `frameCount`
 * evenly-spaced points across its authored loop and draws each sample into
 * its own `canvasSize`-wide slot of a `canvasSize.widthPx * frameCount`-wide
 * strip canvas — the frame-strip equivalent of rasterize.ts's single-frame
 * `drawTemplateIcon`, placed/scaled identically via the same `templateBox`
 * math so an animated template composites exactly like a static one at the
 * same scale/alignment.
 *
 * Because the animation is periodic and its 0%/100% keyframes are always the
 * same visual state (true of both current templates — a full rotation and a
 * round-trip translate), sampling at `i / frameCount` for `i` in
 * `[0, frameCount)` is an exactly seamless loop for any `frameCount`; there
 * is no separate "closing" frame to render.
 *
 * How a frame is sampled: the raw SVG is injected into a hidden, connected
 * DOM node so its CSS animations actually run and can be scrubbed via the
 * Web Animations API (`Element.getAnimations`); each `<path>`'s current
 * animated `transform` is read off computed style (a resolved matrix) and
 * applied directly in canvas space, with the path's own `d`/`fill`/`stroke`
 * attributes drawn via `Path2D`. This assumes every animated element's
 * `transform-origin` is `0 0` (true of both templates — each keyframe bakes
 * its own pivot into explicit `translate()` calls instead, which is what
 * Figma's Smart Animate export already does), and that only `<path>`
 * elements carry the artwork — matching every template actually in
 * TEMPLATES today. A template without a `<style>` animation at all (or a
 * template id that isn't in TEMPLATES) yields `null`, matching how a caller
 * should fall back to a single static frame.
 *
 * Returns `null` under jsdom (see hasCanvasSupport) since there is no real
 * layout/animation engine to scrub.
 */
export async function renderAnimationFrameStrip(
	content: AnimationContent,
	canvasSize: { widthPx: number; heightPx: number },
	options: { frameCount: number; background?: string | null },
): Promise<HTMLCanvasElement | null> {
	const { frameCount, background } = options;
	if (!hasCanvasSupport()) {
		return null;
	}
	const template = TEMPLATES.find((t) => t.id === content.templateId);
	if (!template) {
		return null;
	}

	const svgText = await fetchSvgText(template.file);

	const container = document.createElement("div");
	container.setAttribute(
		"style",
		"position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;",
	);
	container.innerHTML = svgText;
	document.body.appendChild(container);

	try {
		const svgRoot = container.querySelector("svg");
		const paths = Array.from(container.querySelectorAll("path"));
		const animations = container.getAnimations({ subtree: true });
		if (!svgRoot || animations.length === 0 || paths.length === 0) {
			return null;
		}

		const viewBoxWidth =
			svgRoot.viewBox.baseVal.width || svgRoot.width.baseVal.value;
		if (!(viewBoxWidth > 0)) {
			return null;
		}

		animations.forEach((animation) => animation.pause());
		const durationMs = Math.max(
			0,
			...animations.map((animation) => {
				const timing = animation.effect?.getTiming();
				return typeof timing?.duration === "number" ? timing.duration : 0;
			}),
		);

		const box = templateBox(content, canvasSize);
		const scale = box.size / viewBoxWidth;

		const strip = document.createElement("canvas");
		strip.width = Math.max(1, Math.round(canvasSize.widthPx * frameCount));
		strip.height = Math.max(1, Math.round(canvasSize.heightPx));
		const ctx = strip.getContext("2d");
		if (!ctx) {
			return null;
		}

		for (let frame = 0; frame < frameCount; frame++) {
			const frameTimeMs =
				durationMs > 0 ? (frame / frameCount) * durationMs : 0;
			animations.forEach((animation) => {
				animation.currentTime = frameTimeMs;
			});

			const slotX = frame * canvasSize.widthPx;

			if (background) {
				ctx.fillStyle = background;
				ctx.fillRect(slotX, 0, canvasSize.widthPx, canvasSize.heightPx);
			}

			ctx.save();
			ctx.translate(slotX + box.x, box.y);
			ctx.scale(scale, scale);
			for (const path of paths) {
				drawAnimatedPath(ctx, path);
			}
			ctx.restore();
		}

		return strip;
	} finally {
		container.remove();
	}
}

function drawAnimatedPath(ctx: CanvasRenderingContext2D, path: SVGPathElement) {
	const d = path.getAttribute("d");
	if (!d) {
		return;
	}
	const shape = new Path2D(d);

	ctx.save();
	// The element's own presentation `transform` attribute is what CSS
	// overrides once an `animation` applies — reading computed style here is
	// what actually reflects the current keyframe-interpolated value (see
	// docs above on transform-origin).
	const transformValue = getComputedStyle(path).transform;
	if (transformValue && transformValue !== "none") {
		const matrix = new DOMMatrix(transformValue);
		ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
	}

	const fill = path.getAttribute("fill");
	if (fill && fill !== "none") {
		ctx.fillStyle = fill;
		ctx.fill(shape);
	}
	const stroke = path.getAttribute("stroke");
	if (stroke && stroke !== "none") {
		ctx.strokeStyle = stroke;
		ctx.lineWidth = Number(path.getAttribute("stroke-width") ?? "1");
		const lineJoin = path.getAttribute("stroke-linejoin");
		if (lineJoin) {
			ctx.lineJoin = lineJoin as CanvasRenderingContext2D["lineJoin"];
		}
		const lineCap = path.getAttribute("stroke-linecap");
		if (lineCap) {
			ctx.lineCap = lineCap as CanvasRenderingContext2D["lineCap"];
		}
		ctx.stroke(shape);
	}
	ctx.restore();
}

/** Computes a sane frame count from a template's authored loop length and a
 * requested sample rate — shared by the wire encoder and the live preview so
 * both build the exact same strip. */
export function frameCountFor(loopMs: number, fps: number): number {
	return Math.max(1, Math.round((loopMs / 1000) * fps));
}
