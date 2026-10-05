import { ANIMATION_FPS } from "../domain/content";

const SVG_NS = "http://www.w3.org/2000/svg";
const SMIL_SELECTOR = "animate, animateTransform, animateMotion, set";

/** Everything an animation can change that is readable off computed style.
 * Geometry properties (cx, r, d, …) are CSS in Chrome, so SMIL animations of
 * them show up here too; attributes that aren't CSS are baked separately
 * (see bakeSmilAttributes). Transforms are handled via the CTM instead. */
const BAKED_PROPERTIES = [
	"opacity",
	"fill",
	"fill-opacity",
	"stroke",
	"stroke-opacity",
	"stroke-width",
	"stroke-dasharray",
	"stroke-dashoffset",
	"visibility",
	"color",
	"stop-color",
	"stop-opacity",
	"d",
	"cx",
	"cy",
	"r",
	"rx",
	"ry",
	"x",
	"y",
	"width",
	"height",
];

export interface SampledFrame {
	canvas: HTMLCanvasElement;
	durationMs: number;
}

export function isSvgFile(file: File): boolean {
	return (
		file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
	);
}

/**
 * The length of one seamless loop: the least common multiple of every
 * animation's duration, so animations of different lengths all line up again
 * at the seam. Falls back to the longest single duration if that multiple
 * would exceed `capMs`, and never returns more than `capMs`.
 */
export function loopDurationMs(durationsMs: number[], capMs: number): number {
	const steps = durationsMs
		.map((ms) => Math.round(ms / 10))
		.filter((step) => step > 0);
	if (steps.length === 0) {
		return 0;
	}
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	let lcm = steps[0];
	for (const step of steps.slice(1)) {
		lcm = (lcm / gcd(lcm, step)) * step;
		if (lcm * 10 > capMs) {
			return Math.min(capMs, Math.max(...steps) * 10);
		}
	}
	return Math.min(capMs, lcm * 10);
}

/**
 * Samples an animated SVG (CSS `@keyframes` or SMIL) into evenly spaced
 * frames at ANIMATION_FPS. The SVG runs in a hidden shadow root, so its
 * styles and the app's can't affect each other. At each sample time, its
 * animations are paused, the resulting state is baked into a static copy of
 * the SVG, and that copy is rasterised. Returns null for anything that isn't
 * an animated SVG, so the caller falls back to the regular decoders.
 */
export async function decodeAnimatedSvg(
	file: File,
	options: { maxEdgePx: number; maxFrames: number },
): Promise<SampledFrame[] | null> {
	if (
		!isSvgFile(file) ||
		typeof document.createElement("div").attachShadow !== "function"
	) {
		return null;
	}

	const svg = parseSanitizedSvg(await file.text());
	if (
		!svg ||
		(svg.querySelector(SMIL_SELECTOR) === null && !hasCssAnimation(svg))
	) {
		return null;
	}

	const size = targetSize(svg, options.maxEdgePx);
	const capMs = (options.maxFrames * 1000) / ANIMATION_FPS;
	return sampleSvg(svg, size, (durationsMs) => {
		const loopMs = loopDurationMs(durationsMs, capMs);
		if (loopMs === 0) {
			return null;
		}
		const frameCount = Math.min(
			options.maxFrames,
			Math.max(1, Math.round((loopMs / 1000) * ANIMATION_FPS)),
		);
		return { loopMs, frameCount };
	});
}

/**
 * Samples a built-in template's SVG source at a fixed loop length and frame
 * count, rasterised so its longer edge is `maxEdgePx`. Unlike
 * decodeAnimatedSvg, the timing comes from the template's own definition so
 * the frames always match animationTiming (render/animatedTemplate.ts).
 */
export async function sampleSvgText(
	text: string,
	options: { maxEdgePx: number; loopMs: number; frameCount: number },
): Promise<SampledFrame[] | null> {
	if (typeof document.createElement("div").attachShadow !== "function") {
		return null;
	}
	const svg = parseSanitizedSvg(text);
	if (!svg) {
		return null;
	}
	const { loopMs, frameCount } = options;
	return sampleSvg(svg, targetSize(svg, options.maxEdgePx), () => ({
		loopMs,
		frameCount,
	}));
}

async function sampleSvg(
	svg: SVGSVGElement,
	size: { width: number; height: number },
	planTiming: (
		durationsMs: number[],
	) => { loopMs: number; frameCount: number } | null,
): Promise<SampledFrame[] | null> {
	svg.setAttribute("width", String(size.width));
	svg.setAttribute("height", String(size.height));

	const host = document.createElement("div");
	host.setAttribute(
		"style",
		`position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;`,
	);
	const shadow = host.attachShadow({ mode: "closed" });
	const live = document.importNode(svg, true);
	shadow.appendChild(live);
	document.body.appendChild(host);

	try {
		const cssAnimations = live.getAnimations({ subtree: true });
		const smilAnimations = Array.from(
			live.querySelectorAll<SVGAnimationElement>(SMIL_SELECTOR),
		);
		cssAnimations.forEach((animation) => animation.pause());
		live.pauseAnimations();

		const timing = planTiming([
			...cssAnimations.map((animation) => {
				const duration = animation.effect?.getComputedTiming().duration;
				return typeof duration === "number" ? duration : 0;
			}),
			...smilAnimations.map(simpleDurationMs),
		]);
		if (!timing) {
			return null;
		}

		const { loopMs, frameCount } = timing;
		const durationMs = loopMs / frameCount;

		const frames: SampledFrame[] = [];
		for (let frame = 0; frame < frameCount; frame++) {
			const timeMs = frame * durationMs;
			cssAnimations.forEach((animation) => {
				animation.currentTime = timeMs;
			});
			live.setCurrentTime(timeMs / 1000);
			frames.push({
				canvas: await rasterize(bakeFrame(live, smilAnimations), size),
				durationMs,
			});
		}
		return frames;
	} finally {
		host.remove();
	}
}

/** Parses the SVG in an inert document and strips anything that could run
 * code or reach the network once it is connected to the page. */
function parseSanitizedSvg(text: string): SVGSVGElement | null {
	const doc = new DOMParser().parseFromString(text, "image/svg+xml");
	const root = doc.documentElement;
	if (
		doc.querySelector("parsererror") ||
		!(root instanceof SVGSVGElement) ||
		root.namespaceURI !== SVG_NS
	) {
		return null;
	}

	root
		.querySelectorAll("script, foreignObject, iframe")
		.forEach((el) => el.remove());
	for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			const isLink = name === "href" || name.endsWith(":href");
			const value = attr.value.trim();
			if (
				name.startsWith("on") ||
				(isLink && !value.startsWith("#") && !value.startsWith("data:image/"))
			) {
				el.removeAttribute(attr.name);
			}
		}
	}
	return root;
}

function hasCssAnimation(svg: SVGSVGElement): boolean {
	return (
		Array.from(svg.querySelectorAll("style")).some((style) =>
			/@keyframes|animation/i.test(style.textContent ?? ""),
		) ||
		Array.from(svg.querySelectorAll("[style]")).some((el) =>
			/animation/i.test(el.getAttribute("style") ?? ""),
		)
	);
}

function targetSize(
	svg: SVGSVGElement,
	maxEdgePx: number,
): { width: number; height: number } {
	const viewBox = svg.viewBox.baseVal;
	const attrWidth = parseFloat(svg.getAttribute("width") ?? "");
	const attrHeight = parseFloat(svg.getAttribute("height") ?? "");
	const width = viewBox?.width || attrWidth || maxEdgePx;
	const height = viewBox?.height || attrHeight || maxEdgePx;
	const scale = maxEdgePx / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function simpleDurationMs(animation: SVGAnimationElement): number {
	try {
		return animation.getSimpleDuration() * 1000;
	} catch {
		// "indefinite" durations throw — they have no loop to sample.
		return 0;
	}
}

/** A static copy of `live` as it currently looks: every animated value is
 * written onto the copy directly, and the animations themselves removed. */
function bakeFrame(
	live: SVGSVGElement,
	smilAnimations: SVGAnimationElement[],
): SVGSVGElement {
	const copy = live.cloneNode(true) as SVGSVGElement;
	const liveElements = [live, ...Array.from(live.querySelectorAll("*"))];
	const copyElements = [copy, ...Array.from(copy.querySelectorAll("*"))];
	const copyOf = new Map(liveElements.map((el, i) => [el, copyElements[i]]));

	liveElements.forEach((el, i) => {
		const target = copyElements[i];
		if (!(el instanceof SVGElement) || !(target instanceof SVGElement)) {
			return;
		}
		const computed = getComputedStyle(el);
		for (const property of BAKED_PROPERTIES) {
			const value = computed.getPropertyValue(property);
			if (
				value &&
				!(el === live && (property === "width" || property === "height"))
			) {
				target.style.setProperty(property, value, "important");
			}
		}
		if (el !== live && el instanceof SVGGraphicsElement) {
			bakeTransform(el, target);
		}
	});

	for (const animation of smilAnimations) {
		const liveTarget = animation.targetElement;
		const copyTarget = liveTarget ? copyOf.get(liveTarget) : undefined;
		const attributeName = animation.getAttribute("attributeName");
		if (liveTarget && copyTarget && attributeName) {
			bakeSmilAttribute(liveTarget, copyTarget, attributeName);
		}
	}

	copy.querySelectorAll(SMIL_SELECTOR).forEach((el) => el.remove());
	const freeze = document.createElementNS(SVG_NS, "style");
	freeze.textContent = "*{animation:none!important;transition:none!important}";
	copy.appendChild(freeze);
	return copy;
}

/** The element's current local transform, from its screen CTM relative to
 * its parent's — this folds CSS transforms (with their origin), SMIL
 * animateTransform and animateMotion into one matrix. */
function bakeTransform(el: SVGGraphicsElement, target: SVGElement) {
	const parent = el.parentElement;
	const own = el.getScreenCTM();
	const parentCtm =
		parent instanceof SVGGraphicsElement ? parent.getScreenCTM() : null;
	if (!own || !parentCtm) {
		return;
	}
	const local = DOMMatrix.fromMatrix(parentCtm).inverse().multiply(own);
	target.removeAttribute("transform");
	target.style.setProperty(
		"transform",
		`matrix(${local.a},${local.b},${local.c},${local.d},${local.e},${local.f})`,
		"important",
	);
	target.style.setProperty("transform-origin", "0px 0px", "important");
	target.style.setProperty("transform-box", "view-box", "important");
}

/** SMIL can animate attributes that aren't CSS properties (a line's x1,
 * polygon points, a stop's offset, …); their current value only exists as
 * the DOM's `animVal`. */
function bakeSmilAttribute(
	liveTarget: Element,
	copyTarget: Element,
	attributeName: string,
) {
	if (attributeName === "transform") {
		return;
	}
	if (attributeName === "points" && liveTarget instanceof SVGPolygonElement) {
		copyTarget.setAttribute(
			"points",
			pointsToString(liveTarget.animatedPoints),
		);
		return;
	}
	if (attributeName === "points" && liveTarget instanceof SVGPolylineElement) {
		copyTarget.setAttribute(
			"points",
			pointsToString(liveTarget.animatedPoints),
		);
		return;
	}

	const property = attributeName.replace(/-([a-z])/g, (_, c: string) =>
		c.toUpperCase(),
	);
	const animated = (liveTarget as unknown as Record<string, unknown>)[property];
	const value = animatedValueToString(animated);
	if (value !== null) {
		copyTarget.setAttribute(attributeName, value);
	}
}

function pointsToString(points: SVGPointList): string {
	return Array.from({ length: points.numberOfItems }, (_, i) => {
		const point = points.getItem(i);
		return `${point.x},${point.y}`;
	}).join(" ");
}

function animatedValueToString(animated: unknown): string | null {
	if (animated instanceof SVGAnimatedLength) {
		return animated.animVal.valueAsString;
	}
	if (animated instanceof SVGAnimatedLengthList) {
		const list = animated.animVal;
		return Array.from(
			{ length: list.numberOfItems },
			(_, i) => list.getItem(i).valueAsString,
		).join(" ");
	}
	if (animated instanceof SVGAnimatedNumberList) {
		const list = animated.animVal;
		return Array.from(
			{ length: list.numberOfItems },
			(_, i) => list.getItem(i).value,
		).join(" ");
	}
	if (animated instanceof SVGAnimatedRect) {
		const { x, y, width, height } = animated.animVal;
		return `${x} ${y} ${width} ${height}`;
	}
	if (
		animated instanceof SVGAnimatedNumber ||
		animated instanceof SVGAnimatedInteger ||
		animated instanceof SVGAnimatedString
	) {
		return String(animated.animVal);
	}
	return null;
}

async function rasterize(
	svg: SVGSVGElement,
	size: { width: number; height: number },
): Promise<HTMLCanvasElement> {
	const text = new XMLSerializer().serializeToString(svg);
	const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
	try {
		const img = new Image();
		img.src = url;
		await img.decode().catch(() => {
			throw new Error("Die SVG-Animation konnte nicht gelesen werden.");
		});
		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;
		canvas.getContext("2d")?.drawImage(img, 0, 0, size.width, size.height);
		return canvas;
	} finally {
		URL.revokeObjectURL(url);
	}
}
