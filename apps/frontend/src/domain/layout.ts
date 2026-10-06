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
 * The wall's physical arrangement — fixed at install time (see CONTEXT.md
 * "Layout"). These are the positions the screens were last dragged to on the
 * physical wall (read from its `GET /api/state` and rounded to whole
 * millimetres — the drag gesture's sub-pixel precision isn't meaningful
 * physical precision), now the permanent arrangement rather than an editable
 * default.
 */
export const DEFAULT_LAYOUT: LayoutPosition[] = [
	{ screenId: "01", xMm: 0, yMm: 63 },
	{ screenId: "02", xMm: 546, yMm: 4 },
	{ screenId: "03", xMm: 474, yMm: 410 },
	{ screenId: "04", xMm: 243, yMm: 283 },
	{ screenId: "05", xMm: 445, yMm: 156 },
	{ screenId: "06", xMm: 40, yMm: 208 },
	{ screenId: "07", xMm: 242, yMm: 81 },
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
