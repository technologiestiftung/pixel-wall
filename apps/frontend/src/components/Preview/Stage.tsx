import { useState } from "react";
import { putLayout } from "../../api/client";
import { MM_TO_PX, boundingBoxMm, specById, wouldOverlapAny } from "../../domain/layout";
import type { LayoutPosition } from "../../domain/types";
import { resolveScreenRender } from "../../state/selectors";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { ScreenTile } from "./ScreenTile";

interface StageProps {
	containerWidthPx: number;
	containerHeightPx: number;
}

interface DragState {
	screenId: string;
	startClientXPx: number;
	startClientYPx: number;
	startXmm: number;
	startYmm: number;
	/** Last position that didn't overlap anything — what's actually shown. */
	currentXmm: number;
	currentYmm: number;
}

export function Stage({ containerWidthPx, containerHeightPx }: StageProps) {
	const state = useWallState();
	const { specs, layout, selection, layoutEditMode } = state;
	const dispatch = useWallDispatch();
	const { widthMm, heightMm } = boundingBoxMm(specs, layout);
	const [drag, setDrag] = useState<DragState | null>(null);

	const fitScale = Math.min(containerWidthPx / widthMm, containerHeightPx / heightMm);
	const mmToPx = Number.isFinite(fitScale) && fitScale > 0 ? Math.min(MM_TO_PX, fitScale) : MM_TO_PX;

	function handleDragStart(screenId: string, clientXPx: number, clientYPx: number) {
		const position = layout.find((p) => p.screenId === screenId);
		if (!position) {
			return;
		}
		setDrag({
			screenId,
			startClientXPx: clientXPx,
			startClientYPx: clientYPx,
			startXmm: position.xMm,
			startYmm: position.yMm,
			currentXmm: position.xMm,
			currentYmm: position.yMm,
		});
	}

	function handleDragMove(clientXPx: number, clientYPx: number) {
		if (!drag) {
			return;
		}
		const candidate = {
			xMm: Math.max(0, drag.startXmm + (clientXPx - drag.startClientXPx) / mmToPx),
			yMm: Math.max(0, drag.startYmm + (clientYPx - drag.startClientYPx) / mmToPx),
		};
		// Sticky: a candidate that would overlap is simply ignored, so the
		// tile stays at its last valid spot rather than jumping around.
		if (!wouldOverlapAny({ specs, positions: layout }, drag.screenId, candidate)) {
			setDrag({ ...drag, currentXmm: candidate.xMm, currentYmm: candidate.yMm });
		}
	}

	function handleDragEnd() {
		if (!drag) {
			return;
		}
		dispatch({ type: "move-screen", screenId: drag.screenId, xMm: drag.currentXmm, yMm: drag.currentYmm });
		const nextLayout: LayoutPosition[] = layout.map((p) =>
			p.screenId === drag.screenId ? { ...p, xMm: drag.currentXmm, yMm: drag.currentYmm } : p,
		);
		setDrag(null);
		putLayout(nextLayout).catch(() => {
			// Layout persistence failing silently just means the next poll
			// (see useWallSync) won't reflect this move for other clients —
			// the local arrangement itself isn't lost.
		});
	}

	return (
		<div className="relative" style={{ width: widthMm * mmToPx, height: heightMm * mmToPx }}>
			{layout.map((position) => {
				const spec = specById(specs, position.screenId);
				const isDragging = drag?.screenId === spec.id;
				const displayPosition = isDragging ? { ...position, xMm: drag.currentXmm, yMm: drag.currentYmm } : position;
				return (
					<ScreenTile
						key={spec.id}
						spec={spec}
						position={displayPosition}
						mmToPx={mmToPx}
						selected={selection?.screenIds.includes(spec.id) ?? false}
						render={resolveScreenRender(state, spec.id)}
						draggable={layoutEditMode}
						dragging={isDragging}
						onToggle={(screenId, additive) => dispatch({ type: "toggle-screen", screenId, additive })}
						onDragStart={(clientXPx, clientYPx) => handleDragStart(spec.id, clientXPx, clientYPx)}
						onDragMove={handleDragMove}
						onDragEnd={handleDragEnd}
					/>
				);
			})}
		</div>
	);
}
