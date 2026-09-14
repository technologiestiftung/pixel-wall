import type { LayoutPosition, ScreenKind, ScreenSpec } from "./types";

/**
 * Ideal/maximum display scale for the on-screen preview (matches the Figma
 * design's own px-per-mm ratio). The preview never scrolls (see
 * components/Preview/Stage.tsx) — it shrinks below this when the available
 * space is smaller, but never grows past it.
 */
export const MM_TO_PX = 1.375;

/** Device pixel pitch per screen kind — 192mm/64px and 128mm/32px respectively. */
export const PITCH_MM_PER_PX: Record<ScreenKind, number> = { large: 3, small: 4 };

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

export const SCREEN_SPECS: ScreenSpec[] = [
	{ id: "01", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
	{ id: "02", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "03", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
	{ id: "04", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "05", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "06", kind: "large", pixelSize: 64, physicalSizeMm: 192 },
	{ id: "07", kind: "small", pixelSize: 32, physicalSizeMm: 128 },
];

/**
 * Default wall arrangement, derived from the Figma "State — Text" stage
 * (node 10:134), converting its px coordinates to millimeters using the
 * design's own px-per-mm scale (176px / 128mm = 264px / 192mm = 1.375).
 */
export const DEFAULT_LAYOUT: LayoutPosition[] = [
	{ screenId: "01", xMm: 508, yMm: 3 },
	{ screenId: "02", xMm: 269, yMm: 91 },
	{ screenId: "03", xMm: 7, yMm: 91 },
	{ screenId: "04", xMm: 482, yMm: 140 },
	{ screenId: "05", xMm: 57, yMm: 246 },
	{ screenId: "06", xMm: 269, yMm: 308 },
	{ screenId: "07", xMm: 482, yMm: 399 },
];

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
 * Real physical gap between two rects along whichever axis they face each
 * other on (0 if they overlap on that axis, e.g. stacked directly above one
 * another). Returns null if the rects don't face each other on either axis
 * (e.g. diagonal placement) — there is no single well-defined "gap" then.
 */
export function gapBetweenMm(a: RectMm, b: RectMm): number | null {
	const xOverlaps = a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm;
	const yOverlaps = a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm;

	if (xOverlaps && !yOverlaps) {
		return a.yMm < b.yMm ? b.yMm - (a.yMm + a.heightMm) : a.yMm - (b.yMm + b.heightMm);
	}
	if (yOverlaps && !xOverlaps) {
		return a.xMm < b.xMm ? b.xMm - (a.xMm + a.widthMm) : a.xMm - (b.xMm + b.widthMm);
	}
	if (xOverlaps && yOverlaps) {
		return 0;
	}
	return null;
}

/**
 * Two screens count as adjacent (for selection-contiguity purposes) if they
 * face each other on one axis and the real gap between them is within a
 * tolerance, rather than requiring pixel-exact touching — dragged positions
 * are never perfectly precise, and a real physical gap between chained large
 * screens is expected (see CONTEXT.md "Text") and should still count as
 * contiguous. 60mm is a placeholder pending a real cable/mounting spec.
 */
export function areAdjacent(a: RectMm, b: RectMm, toleranceMm = 60): boolean {
	const gap = gapBetweenMm(a, b);
	return gap !== null && gap >= 0 && gap <= toleranceMm;
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
	const candidateRect = rectFor(movingSpec, { screenId: movingScreenId, ...candidate });

	return positions
		.filter((p) => p.screenId !== movingScreenId)
		.some((p) => rectsOverlap(candidateRect, rectFor(specById(specs, p.screenId), p)));
}

/** Smallest axis-aligned box (in mm, from the wall-space origin) containing every screen. */
export function boundingBoxMm(specs: ScreenSpec[], positions: LayoutPosition[]): { widthMm: number; heightMm: number } {
	let maxX = 0;
	let maxY = 0;
	for (const position of positions) {
		const spec = specById(specs, position.screenId);
		maxX = Math.max(maxX, position.xMm + spec.physicalSizeMm);
		maxY = Math.max(maxY, position.yMm + spec.physicalSizeMm);
	}
	return { widthMm: maxX, heightMm: maxY };
}
