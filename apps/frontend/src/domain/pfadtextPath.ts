import {
	DEFAULT_LAYOUT,
	LARGE_SCREEN_IDS,
	PITCH_MM_PER_PX,
	SCREEN_SPECS,
	specById,
} from "./layout";
import { computeDisplayComposite } from "./mapping";

interface Vec2 {
	x: number;
	y: number;
}

export interface PathPoint {
	x: number;
	y: number;
	/** Tangent direction at this point, in radians (`Math.atan2` convention) —
	 * what a glyph placed here should be rotated to, so it follows the curve
	 * rather than staying upright (see CONTEXT.md "Content"). */
	angleRad: number;
}

export interface PfadtextPath {
	/** Total length of the path in device px, as walked by `pointAt`. */
	lengthPx: number;
	/**
	 * The point and tangent at `distancePx` along the path, measured from its
	 * start. Values outside `[0, lengthPx]` extrapolate linearly along the
	 * tangent at the nearest end, rather than clamping — so running Pfadtext
	 * can slide text smoothly on/off both ends (mirroring how Lauftext starts
	 * and ends fully off-screen — see domain/scroll.ts's marqueeOffsetPx)
	 * instead of having it pop in/out.
	 */
	pointAt(distancePx: number): PathPoint;
}

/**
 * Orders points by sweeping angle around their centroid, starting from
 * whichever point `pickStart` selects. For the wall's actual large-screen
 * arrangement (a rough quadrilateral, not a line — see RENDERING.md "two
 * coordinate spaces") this walks the quadrilateral's perimeter instead of
 * cutting back and forth through its middle, which is what a distance-greedy
 * order would do here (the two screens nearest the middle sit almost
 * directly above/below each other).
 */
function perimeterOrder(
	points: Vec2[],
	pickStart: (sorted: Vec2[]) => number,
): Vec2[] {
	const centroid = points.reduce(
		(sum, p) => ({
			x: sum.x + p.x / points.length,
			y: sum.y + p.y / points.length,
		}),
		{ x: 0, y: 0 },
	);
	const sorted = [...points].sort(
		(a, b) =>
			Math.atan2(a.y - centroid.y, a.x - centroid.x) -
			Math.atan2(b.y - centroid.y, b.x - centroid.x),
	);
	const startIndex = pickStart(sorted);
	return [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)];
}

const leftmostOf = (points: Vec2[]): number =>
	points.reduce((best, p, i) => (p.x < points[best].x ? i : best), 0);
const topmostOf = (points: Vec2[]): number =>
	points.reduce((best, p, i) => (p.y < points[best].y ? i : best), 0);

/** Orders points by a greedy nearest-neighbour walk starting from the
 * leftmost one — cuts directly through the middle of the wall's arrangement
 * rather than around its perimeter (see `perimeterOrder`), which is what
 * gives the "Diagonal" path its distinct, more angular character. */
function nearestNeighborOrder(points: Vec2[]): Vec2[] {
	const remaining = [...points];
	remaining.sort((a, b) => a.x - b.x);
	const order: Vec2[] = [remaining.shift() as Vec2];
	while (remaining.length > 0) {
		const last = order[order.length - 1];
		let bestIndex = 0;
		let bestDist = Infinity;
		remaining.forEach((point, index) => {
			const dist = Math.hypot(point.x - last.x, point.y - last.y);
			if (dist < bestDist) {
				bestDist = dist;
				bestIndex = index;
			}
		});
		order.push(remaining.splice(bestIndex, 1)[0]);
	}
	return order;
}

function vecSub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

function vecScale(a: Vec2, s: number): Vec2 {
	return { x: a.x * s, y: a.y * s };
}

/**
 * One point (and its tangent direction) at local `u` in `[0, 1]` along the
 * Catmull-Rom-with-tension Hermite segment between `p1` and `p2`, using `p0`
 * and `p3` to derive the end tangents. Passes through `p1` exactly at u=0 and
 * `p2` exactly at u=1 regardless of `tension` (it only scales the tangents,
 * which the Hermite basis zeroes out at the segment's own endpoints).
 * `tension` is the textbook Catmull-Rom curve at 1 (close to the straight
 * polygon between points); pushing it higher bows the curve further out
 * between points, reading as softer/rounder/more open rather than hugging
 * the direct line between screens.
 */
// eslint-disable-next-line max-params -- all five are needed; splitting into an options object adds indirection for no benefit here.
function hermiteSegmentPoint(
	p0: Vec2,
	p1: Vec2,
	p2: Vec2,
	p3: Vec2,
	u: number,
	tension: number,
): { point: Vec2; tangent: Vec2 } {
	const m1 = vecScale(vecSub(p2, p0), tension / 2);
	const m2 = vecScale(vecSub(p3, p1), tension / 2);

	const u2 = u * u;
	const u3 = u2 * u;
	const h00 = 2 * u3 - 3 * u2 + 1;
	const h10 = u3 - 2 * u2 + u;
	const h01 = -2 * u3 + 3 * u2;
	const h11 = u3 - u2;
	const point = {
		x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
		y: h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
	};

	// Derivative of the Hermite basis, for the tangent direction at u.
	const dh00 = 6 * u2 - 6 * u;
	const dh10 = 3 * u2 - 4 * u + 1;
	const dh01 = -6 * u2 + 6 * u;
	const dh11 = 3 * u2 - 2 * u;
	const tangent = {
		x: dh00 * p1.x + dh10 * m1.x + dh01 * p2.x + dh11 * m2.x,
		y: dh00 * p1.y + dh10 * m1.y + dh01 * p2.y + dh11 * m2.y,
	};
	return { point, tangent };
}

// eslint-disable-next-line max-params -- all five are needed; splitting into an options object adds indirection for no benefit here.
function lerpVec2(a: Vec2, b: Vec2, ta: number, tb: number, t: number): Vec2 {
	if (tb - ta < 1e-9) {
		return a;
	}
	const f = (t - ta) / (tb - ta);
	return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * Builds a fixed path through `points`, in order, as a clamped Catmull-Rom
 * Hermite spline (see `hermiteSegmentPoint`'s `tension`) — the curve passes
 * through every given point, with a natural tangent at the first/last via
 * reflected phantom control points, rather than just approaching them.
 * Exported separately from the named `PFADTEXT_PATHS` so the geometry is
 * testable with plain synthetic points.
 */
export function buildPathThroughPoints(
	points: Vec2[],
	options: { samplesPerSegment?: number; tension?: number } = {},
): PfadtextPath {
	const { samplesPerSegment = 32, tension = 1 } = options;
	if (points.length < 2) {
		throw new Error("buildPathThroughPoints needs at least 2 points");
	}

	const first = points[0];
	const second = points[1];
	const last = points[points.length - 1];
	const secondLast = points[points.length - 2];
	const phantomStart: Vec2 = {
		x: 2 * first.x - second.x,
		y: 2 * first.y - second.y,
	};
	const phantomEnd: Vec2 = {
		x: 2 * last.x - secondLast.x,
		y: 2 * last.y - secondLast.y,
	};
	const extended = [phantomStart, ...points, phantomEnd];

	const samples: Vec2[] = [];
	const tangents: Vec2[] = [];
	const segmentCount = points.length - 1;
	for (let segment = 0; segment < segmentCount; segment++) {
		const [p0, p1, p2, p3] = [
			extended[segment],
			extended[segment + 1],
			extended[segment + 2],
			extended[segment + 3],
		];
		const steps =
			segment === segmentCount - 1 ? samplesPerSegment : samplesPerSegment - 1;
		for (let step = 0; step <= steps; step++) {
			const { point, tangent } = hermiteSegmentPoint(
				p0,
				p1,
				p2,
				p3,
				step / samplesPerSegment,
				tension,
			);
			samples.push(point);
			tangents.push(tangent);
		}
	}

	const cumulativeLengthPx = [0];
	for (let i = 1; i < samples.length; i++) {
		const dist = Math.hypot(
			samples[i].x - samples[i - 1].x,
			samples[i].y - samples[i - 1].y,
		);
		cumulativeLengthPx.push(cumulativeLengthPx[i - 1] + dist);
	}
	const lengthPx = cumulativeLengthPx[cumulativeLengthPx.length - 1];

	function angleOf(tangent: Vec2): number {
		return Math.atan2(tangent.y, tangent.x);
	}

	function extrapolate(
		from: Vec2,
		angleRad: number,
		distancePx: number,
	): PathPoint {
		return {
			x: from.x + Math.cos(angleRad) * distancePx,
			y: from.y + Math.sin(angleRad) * distancePx,
			angleRad,
		};
	}

	function pointAt(distancePx: number): PathPoint {
		if (distancePx <= 0) {
			return extrapolate(samples[0], angleOf(tangents[0]), distancePx);
		}
		if (distancePx >= lengthPx) {
			return extrapolate(
				samples[samples.length - 1],
				angleOf(tangents[tangents.length - 1]),
				distancePx - lengthPx,
			);
		}

		// Binary search for the last sample whose cumulative length is <= distancePx.
		let low = 0;
		let high = cumulativeLengthPx.length - 1;
		while (low < high - 1) {
			const mid = Math.floor((low + high) / 2);
			if (cumulativeLengthPx[mid] <= distancePx) {
				low = mid;
			} else {
				high = mid;
			}
		}
		const segmentLength = cumulativeLengthPx[high] - cumulativeLengthPx[low];
		const point = lerpVec2(
			samples[low],
			samples[high],
			cumulativeLengthPx[low],
			cumulativeLengthPx[high],
			segmentLength < 1e-9 ? cumulativeLengthPx[low] : distancePx,
		);
		const tangent = lerpVec2(tangents[low], tangents[high], 0, 1, 0.5);
		return { ...point, angleRad: angleOf(tangent) };
	}

	return { lengthPx, pointAt };
}

/**
 * The arc-length distance, beyond each end of `path`, a glyph must travel
 * past before it's guaranteed to have left `canvasSize` entirely — not
 * necessarily close to 0, since the path's own extrapolated tangent can keep
 * a point inside a screen's rectangle for a while after it's already past
 * the path's nominal start/end (the screens sit close together, and the
 * path's end tangent heads into, not away from, its own screen's corner).
 * Used to pad running Pfadtext's hidden/off-path hold position (see
 * render/pathText.ts) so it doesn't loop with a visible jump — leaving one
 * screen must not pop the text onto another.
 */
function offCanvasMarginPx(
	path: PfadtextPath,
	canvasSize: { widthPx: number; heightPx: number },
): number {
	function exitDistance(
		origin: PathPoint,
		direction: { x: number; y: number },
	): number {
		// A point inside the box leaves it at the EARLIEST crossing of either
		// axis's bound — not the latest, which would wait until both axes have
		// cleared and overshoot by however much the ray travels diagonally.
		let t = Infinity;
		if (direction.x > 1e-9) {
			t = Math.min(t, (canvasSize.widthPx - origin.x) / direction.x);
		} else if (direction.x < -1e-9) {
			t = Math.min(t, (0 - origin.x) / direction.x);
		}
		if (direction.y > 1e-9) {
			t = Math.min(t, (canvasSize.heightPx - origin.y) / direction.y);
		} else if (direction.y < -1e-9) {
			t = Math.min(t, (0 - origin.y) / direction.y);
		}
		// +2px safety margin for floating-point/sampling slack at the boundary.
		return (t === Infinity ? 0 : Math.max(0, t)) + 2;
	}

	const startPoint = path.pointAt(0);
	const endPoint = path.pointAt(path.lengthPx);
	const start = exitDistance(startPoint, {
		x: -Math.cos(startPoint.angleRad),
		y: -Math.sin(startPoint.angleRad),
	});
	const end = exitDistance(endPoint, {
		x: Math.cos(endPoint.angleRad),
		y: Math.sin(endPoint.angleRad),
	});
	// The larger of the two is used for both ends (see render/pathText.ts) —
	// simpler than threading two separate numbers through marqueeOffsetPx's
	// single, symmetric textWidthPx parameter, at the cost of a slightly
	// longer-than-strictly-needed hold on whichever end needed less.
	return Math.max(start, end);
}

/** One of the fixed, built-in curved paths Pfadtext can run along, spanning
 * the 4 large screens (see CONTEXT.md "Content"). */
export interface PfadtextPathOption {
	id: string;
	/** Shown on the path's thumbnail in the editor. */
	label: string;
	path: PfadtextPath;
	offCanvasMarginPx: number;
}

/** A large screen's rectangle in the same fixed device-pixel composite space
 * every PFADTEXT_PATHS path is built in — exported for the thumbnail preview
 * (render/PathThumbnail.tsx) to draw the 4 screens for context behind the
 * curve. Identical for every path, so computed once. */
export interface ScreenRect {
	id: string;
	x: number;
	y: number;
	size: number;
}

function computeScreenCenters(): { id: string; center: Vec2 }[] {
	const composite = computeDisplayComposite(
		{ specs: SCREEN_SPECS, positions: DEFAULT_LAYOUT },
		{ kind: "large", screenIds: LARGE_SCREEN_IDS },
		1 / PITCH_MM_PER_PX.large,
	);
	return composite.slots.map((slot) => {
		const spec = specById(SCREEN_SPECS, slot.screenId);
		return {
			id: slot.screenId,
			center: {
				x: slot.offsetXPx + spec.pixelSize / 2,
				y: slot.offsetYPx + spec.pixelSize / 2,
			},
		};
	});
}

const screenCenters = computeScreenCenters();

export const PFADTEXT_CANVAS_SIZE: { widthPx: number; heightPx: number } =
	(() => {
		const composite = computeDisplayComposite(
			{ specs: SCREEN_SPECS, positions: DEFAULT_LAYOUT },
			{ kind: "large", screenIds: LARGE_SCREEN_IDS },
			1 / PITCH_MM_PER_PX.large,
		);
		return { widthPx: composite.widthPx, heightPx: composite.heightPx };
	})();

export const PFADTEXT_SCREEN_RECTS: ScreenRect[] = screenCenters.map(
	({ id, center }) => {
		const spec = specById(SCREEN_SPECS, id);
		return {
			id,
			x: center.x - spec.pixelSize / 2,
			y: center.y - spec.pixelSize / 2,
			size: spec.pixelSize,
		};
	},
);

// eslint-disable-next-line max-params -- all four are needed; splitting into an options object adds indirection for no benefit here.
function namedPath(
	id: string,
	label: string,
	points: Vec2[],
	tension: number,
): PfadtextPathOption {
	const path = buildPathThroughPoints(points, { tension });
	return {
		id,
		label,
		path,
		offCanvasMarginPx: offCanvasMarginPx(path, PFADTEXT_CANVAS_SIZE),
	};
}

const centers = screenCenters.map((s) => s.center);

/** An explicit, named visiting order — for a curated path where "whichever
 * order a generic strategy derives" (see `perimeterOrder`/
 * `nearestNeighborOrder`) isn't the point; the specific order *is* the
 * design. */
function byIds(ids: string[]): Vec2[] {
	return ids.map(
		(id) =>
			(screenCenters.find((s) => s.id === id) as { id: string; center: Vec2 })
				.center,
	);
}

/**
 * The 3 fixed, built-in curved paths Pfadtext can run along. Each orders the
 * 4 large screens' centers differently and fits a Hermite spline through
 * them with its own tension (see `hermiteSegmentPoint`) — deliberately
 * curated rather than offering a single "one true" derived shape:
 *
 * - "rund": sweeps the wall's actual physical arrangement's perimeter
 *   (see `perimeterOrder`) starting from the leftmost screen — open, round,
 *   never crosses itself.
 * - "diagonal": cuts straight through the middle (see `nearestNeighborOrder`)
 *   instead of around it, the more angular shape this project started with,
 *   softened with a touch more tension than a plain Catmull-Rom curve would
 *   have so its sharper turn reads as a curve rather than a corner.
 * - "schwung": the same perimeter sweep as "rund" but starting from the
 *   topmost screen instead, at standard tension — a visibly different
 *   entry/exit pair while staying just as open.
 * - "welle": enters at 06, bends up through 07, back down through 04, then
 *   out through 05 — an explicit, named order (not a general strategy; see
 *   `byIds`) at a high tension for one big, soft double-bend rather than a
 *   tight self-crossing loop (an earlier version of this path looped fully
 *   around 07/04, which read as needlessly busy).
 */
export const PFADTEXT_PATHS: PfadtextPathOption[] = [
	namedPath("rund", "Rund", perimeterOrder(centers, leftmostOf), 1.5),
	namedPath("diagonal", "Diagonal", nearestNeighborOrder(centers), 1.85),
	namedPath("schwung", "Schwung", perimeterOrder(centers, topmostOf), 1.8),
	namedPath("welle", "Welle", byIds(["06", "07", "04", "05"]), 2.2),
];

/** The path content saved before multiple paths existed keeps showing — the
 * one this whole feature originally shipped with. */
export const DEFAULT_PFADTEXT_PATH_ID = "rund";

/** Resolves a saved/drafted `TextContent.pathId` to its path, falling back to
 * `DEFAULT_PFADTEXT_PATH_ID` for both `undefined` (older content) and an
 * unrecognised id (should never happen, but a renderer must still show
 * something sane rather than throw). */
export function pfadtextPathOption(id: string | undefined): PfadtextPathOption {
	return (
		PFADTEXT_PATHS.find((option) => option.id === id) ??
		(PFADTEXT_PATHS.find(
			(option) => option.id === DEFAULT_PFADTEXT_PATH_ID,
		) as PfadtextPathOption)
	);
}
