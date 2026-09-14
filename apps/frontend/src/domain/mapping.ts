import { areAdjacent, rectFor, specById } from "./layout";
import type { LayoutPosition, ScreenSpec, Selection } from "./types";

export interface SelectionValidation {
	valid: boolean;
	reason?: "mixed-kind" | "not-contiguous";
}

/**
 * A selection of large screens is only meaningful as one continuous canvas,
 * so every screen in it must be reachable from every other via a chain of
 * adjacent screens within the same selection (see CONTEXT.md "Selection").
 * Small screens never combine, so any non-empty, single-kind small selection
 * is automatically valid.
 */
export function validateSelection(
	specs: ScreenSpec[],
	positions: LayoutPosition[],
	screenIds: string[],
): SelectionValidation {
	if (screenIds.length === 0) {
		return { valid: true };
	}

	const selectedSpecs = screenIds.map((id) => specById(specs, id));
	const kinds = new Set(selectedSpecs.map((s) => s.kind));
	if (kinds.size > 1) {
		return { valid: false, reason: "mixed-kind" };
	}

	if (selectedSpecs[0].kind === "small" || selectedSpecs.length === 1) {
		return { valid: true };
	}

	const positionById = new Map(positions.map((p) => [p.screenId, p]));
	const rectById = new Map(
		selectedSpecs.map((spec) => {
			const position = positionById.get(spec.id);
			if (!position) {
				throw new Error(`No layout position for screen ${spec.id}`);
			}
			return [spec.id, rectFor(spec, position)] as const;
		}),
	);

	function rectOf(id: string) {
		const rect = rectById.get(id);
		if (!rect) {
			throw new Error(`No rect computed for screen ${id}`);
		}
		return rect;
	}

	const visited = new Set<string>([screenIds[0]]);
	const queue = [screenIds[0]];
	while (queue.length > 0) {
		const currentId = queue.pop();
		if (currentId === undefined) {
			break;
		}
		const currentRect = rectOf(currentId);
		for (const id of screenIds) {
			if (visited.has(id)) {
				continue;
			}
			if (areAdjacent(currentRect, rectOf(id))) {
				visited.add(id);
				queue.push(id);
			}
		}
	}

	return visited.size === screenIds.length ? { valid: true } : { valid: false, reason: "not-contiguous" };
}

export interface DisplayCompositeSlot {
	screenId: string;
	offsetXPx: number;
	offsetYPx: number;
}

export interface DisplayComposite {
	widthPx: number;
	heightPx: number;
	slots: DisplayCompositeSlot[];
}

/**
 * Maps a validated selection onto one shared "composite" content area, in
 * on-screen preview pixels (mmToPx-scaled, not device pixels — see
 * CONTEXT.md "Rendering split": the device-pixel-accurate version of this is
 * a Phase 3 concern, for the bitmap actually sent to the backend).
 *
 * Large selections stretch content across their combined bounding box
 * (including any real physical gaps between screens, which naturally fall
 * out of using each screen's real mm position). Small selections are
 * "independent copies" — every selected screen gets its own full-size
 * composite with a zero offset, i.e. the same content repeated whole on
 * each screen rather than split across them (see CONTEXT.md "Selection").
 */
export function computeDisplayComposite(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	selection: Selection,
	mmToPx: number,
): DisplayComposite {
	const { specs, positions } = wall;
	const positionById = new Map(positions.map((p) => [p.screenId, p]));

	function positionOf(id: string): LayoutPosition {
		const position = positionById.get(id);
		if (!position) {
			throw new Error(`No layout position for screen ${id}`);
		}
		return position;
	}

	if (selection.kind === "small") {
		const spec = specById(specs, selection.screenIds[0]);
		const sizePx = spec.physicalSizeMm * mmToPx;
		return {
			widthPx: sizePx,
			heightPx: sizePx,
			slots: selection.screenIds.map((screenId) => ({ screenId, offsetXPx: 0, offsetYPx: 0 })),
		};
	}

	const rects = selection.screenIds.map((id) => rectFor(specById(specs, id), positionOf(id)));
	const minXmm = Math.min(...rects.map((r) => r.xMm));
	const minYmm = Math.min(...rects.map((r) => r.yMm));
	const maxXmm = Math.max(...rects.map((r) => r.xMm + r.widthMm));
	const maxYmm = Math.max(...rects.map((r) => r.yMm + r.heightMm));

	return {
		widthPx: (maxXmm - minXmm) * mmToPx,
		heightPx: (maxYmm - minYmm) * mmToPx,
		slots: selection.screenIds.map((screenId) => {
			const position = positionOf(screenId);
			return {
				screenId,
				offsetXPx: (position.xMm - minXmm) * mmToPx,
				offsetYPx: (position.yMm - minYmm) * mmToPx,
			};
		}),
	};
}
