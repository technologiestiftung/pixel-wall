import { isMovingAnimation } from "./content";
import {
	isAllLargeScreensSelection,
	PITCH_MM_PER_PX,
	rectFor,
	specById,
} from "./layout";
import type {
	LayoutPosition,
	ScreenLayers,
	ScreenSpec,
	SelectionGroup,
	SelectionKind,
} from "./types";

export function selectionKindOf(
	specs: ScreenSpec[],
	screenIds: string[],
): SelectionKind {
	const kinds = new Set(screenIds.map((id) => specById(specs, id).kind));
	if (kinds.size > 1) {
		return "mixed";
	}
	return kinds.has("small") ? "small" : "large";
}

/**
 * A selection is rendered and saved as one group per kind, since the two
 * kinds have different pixel densities and are driven by different hardware.
 * In a mixed selection every group is a window into one canvas spanning all
 * selected screens (see CONTEXT.md "Selection").
 */
export function selectionGroups(
	specs: ScreenSpec[],
	selection: { screenIds: string[] },
): SelectionGroup[] {
	const groups: SelectionGroup[] = [];
	for (const screenId of selection.screenIds) {
		const { kind } = specById(specs, screenId);
		const group = groups.find((g) => g.kind === kind);
		if (group) {
			group.screenIds.push(screenId);
		} else {
			groups.push({ kind, screenIds: [screenId] });
		}
	}
	if (groups.length > 1) {
		for (const group of groups) {
			group.canvasScreenIds = selection.screenIds;
		}
	}
	return groups;
}

/**
 * The screen whose layers a selection is edited from. In a mixed selection
 * that is a large screen, since sizes are specified in large-screen pixels
 * there (see `layersForGroup`).
 */
export function referenceScreenId(
	specs: ScreenSpec[],
	selection: { kind: SelectionKind; screenIds: string[] },
): string {
	if (selection.kind === "mixed") {
		const large = selection.screenIds.find(
			(id) => specById(specs, id).kind === "large",
		);
		if (large) {
			return large;
		}
	}
	return selection.screenIds[0];
}

/**
 * What a group actually renders of the selection's layers. Moving
 * Animation/Bild content isn't offered across a mixed selection (see
 * CONTEXT.md "Selection"), so an animation carried over from the reference
 * screen is dropped rather than spread onto the other kind; still images are
 * kept. Text size, padding and scroll speed are in
 * device pixels; within a mixed selection they are specified in large-screen
 * pixels, so a small-screen group rescales them to cover the same physical
 * size at its coarser pitch.
 *
 * Pfadtext is dropped outright — regardless of mixed or single-kind — when
 * the group isn't exactly the 4 large screens, since that's the one
 * selection shape it's defined for (see CONTEXT.md "Content" and
 * docs/adr/0005-pfadtext-motion-via-frame-strip.md): "like a moving
 * Animation/Bild foreground across a mixed selection, Pfadtext is dropped —
 * with a warning — if saved against a selection that isn't exactly those 4
 * screens."
 */
export function layersForGroup(
	layers: ScreenLayers,
	group: SelectionGroup,
): ScreenLayers {
	const { foreground } = layers;
	if (
		foreground?.type === "text" &&
		foreground.mode === "path" &&
		!isAllLargeScreensSelection(group.canvasScreenIds ?? group.screenIds)
	) {
		return { ...layers, foreground: null };
	}
	if (!group.canvasScreenIds) {
		return layers;
	}
	if (foreground?.type === "animation" && isMovingAnimation(foreground)) {
		return { ...layers, foreground: null };
	}
	if (foreground?.type !== "text") {
		return layers;
	}
	const factor = PITCH_MM_PER_PX.large / PITCH_MM_PER_PX[group.kind];
	if (factor === 1) {
		return layers;
	}
	return {
		...layers,
		foreground: {
			...foreground,
			fontSizePx: foreground.fontSizePx * factor,
			paddingPx:
				foreground.paddingPx === undefined
					? undefined
					: foreground.paddingPx * factor,
			speedPxPerSec:
				foreground.speedPxPerSec === undefined
					? undefined
					: foreground.speedPxPerSec * factor,
		},
	};
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
 * Maps a single-kind selection group onto one shared "composite" content area, in
 * on-screen preview pixels (mmToPx-scaled, not device pixels — see
 * CONTEXT.md "Rendering split": the device-pixel-accurate version of this is
 * a Phase 3 concern, for the bitmap actually sent to the backend).
 *
 * Content stretches across the selection's combined bounding box (including
 * any real physical gaps between screens, which naturally fall out of using
 * each screen's real mm position), so every selected screen shows its own
 * slice of one picture (see CONTEXT.md "Selection").
 */
export function computeDisplayComposite(
	wall: { specs: ScreenSpec[]; positions: LayoutPosition[] },
	selection: SelectionGroup,
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

	const rects = (selection.canvasScreenIds ?? selection.screenIds).map((id) =>
		rectFor(specById(specs, id), positionOf(id)),
	);
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
