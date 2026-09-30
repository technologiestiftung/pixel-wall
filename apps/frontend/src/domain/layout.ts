import type { LayoutPosition, ScreenKind, ScreenSpec } from "./types";

/**
 * Ideal/maximum display scale for the on-screen preview (matches the Figma
 * design's own px-per-mm ratio). The preview never scrolls (see
 * components/Preview/Stage.tsx) — it shrinks below this when the available
 * space is smaller, but never grows past it.
 */
export const MM_TO_PX = 1.375;

/** Device pixel pitch per screen kind — 192mm/64px and 128mm/32px respectively. */
export const PITCH_MM_PER_PX: Record<ScreenKind, number> = {
	large: 3,
	small: 4,
};

/**
 * Font sizes, scroll speeds etc. that the user sets (e.g. "Textgröße") are
 * specified in real device pixels (that's what makes an 8–64px range sane
 * for a 32–64px-tall screen), not preview display px. This is the factor to
 * scale a device-px quantity by to get the matching on-screen preview size,
 * for whatever the current (possibly shrink-to-fit) mmToPx scale is.
 */
export function displayScaleForKind(kind: ScreenKind, mmToPx: number): number {
	return mmToPx * PITCH_MM_PER_PX[kind];
}

/** Small screens are numbered 01–03, large screens 04–07 (not interleaved —
 * the two kinds are visually/behaviorally distinct enough that grouping the
 * numbering by kind reads more clearly than the arbitrary Figma badge order
 * this originally matched). */
export const SCREEN_SPECS: ScreenSpec[] = [
	{ id: "01", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
	{ id: "02", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
	{ id: "03", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
	{ id: "04", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "05", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "06", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "07", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
];

/**
 * Default wall arrangement, derived from the Figma "State — Text" stage
 * (node 10:134), converting its px coordinates to millimeters using the
 * design's own px-per-mm scale (176px / 128mm = 264px / 192mm = 1.375).
 * Each screen keeps its original physical position — only the id numbering
 * changed (small 01–03, large 04–07) from the Figma source's badge order.
 */
export const DEFAULT_LAYOUT: LayoutPosition[] = [
	{ screenId: "01", xMm: 508, yMm: 3 },
	{ screenId: "02", xMm: 7, yMm: 91 },
	{ screenId: "03", xMm: 482, yMm: 399 },
	{ screenId: "04", xMm: 255, yMm: 91 },
	{ screenId: "05", xMm: 453, yMm: 140 },
	{ screenId: "06", xMm: 57, yMm: 246 },
	{ screenId: "07", xMm: 255, yMm: 290 },
];

/** Screen ids are zero-padded ("01"–"07") for stable sorting/lookup, but
 * that padding reads as a typo in prose (menu selection text, tile badges) —
 * this is the plain-number form shown to users. */
export function displayScreenId(id: string): string {
	return String(Number(id));
}

export function specById(specs: ScreenSpec[], id: string): ScreenSpec {
	const spec = specs.find((s) => s.id === id);
	if (!spec) {
		throw new Error(`Unknown screen id: ${id}`);
	}
	return spec;
}

export function pitchMmPerPx(spec: ScreenSpec): number {
	return spec.physicalSizeMm / spec.pixelSize;
}

export interface RectMm {
	xMm: number;
	yMm: number;
	widthMm: number;
	heightMm: number;
}

export function rectFor(spec: ScreenSpec, position: LayoutPosition): RectMm {
	return {
		xMm: position.xMm,
		yMm: position.yMm,
		widthMm: spec.physicalSizeMm,
		heightMm: spec.physicalSizeMm,
	};
}

/** Axis-aligned overlap test (touching edges are not considered overlapping). */
export function rectsOverlap(a: RectMm, b: RectMm): boolean {
	return (
		a.xMm < b.xMm + b.widthMm &&
		a.xMm + a.widthMm > b.xMm &&
		a.yMm < b.yMm + b.heightMm &&
		a.yMm + a.heightMm > b.yMm
	);
}

/**
 * Whether placing `movingScreenId` at `candidate` would overlap any other
 * screen's current position — the only constraint layout-edit dragging
 * enforces (see CONTEXT.md "Layout": literal overlap is never physically
 * valid; anything short of that is left to the user's judgement).
 */
export function wouldOverlapAny(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	movingScreenId: string,
	candidate: { xMm: number; yMm: number },
): boolean {
	const { specs, positions } = wall;
	const movingSpec = specById(specs, movingScreenId);
	const candidateRect = rectFor(movingSpec, {
		screenId: movingScreenId,
		...candidate,
	});

	return positions
		.filter((p) => p.screenId !== movingScreenId)
		.some((p) =>
			rectsOverlap(candidateRect, rectFor(specById(specs, p.screenId), p)),
		);
}

/** Smallest axis-aligned box (in mm, from the wall-space origin) containing every screen. */
export function boundingBoxMm(
	specs: ScreenSpec[],
	positions: LayoutPosition[],
): { widthMm: number; heightMm: number } {
	let maxX = 0;
	let maxY = 0;
	for (const position of positions) {
		const spec = specById(specs, position.screenId);
		maxX = Math.max(maxX, position.xMm + spec.physicalSizeMm);
		maxY = Math.max(maxY, position.yMm + spec.physicalSizeMm);
	}
	return { widthMm: maxX, heightMm: maxY };
}
