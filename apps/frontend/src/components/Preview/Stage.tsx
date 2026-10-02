import { useCallback, useMemo, useRef, useState } from "react";
import { putLayout } from "../../api/wall";
import { useAuth } from "../../auth/AuthContext";
import {
	MM_TO_PX,
	boundingBoxMm,
	specById,
	wouldOverlapAny,
} from "../../domain/layout";
import type { LayoutPosition } from "../../domain/types";
import { resolveScreenRenders } from "../../state/selectors";
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
	const {
		specs,
		layout,
		selection,
		applied,
		draftText,
		draftAnimation,
		draftColor,
		layoutEditMode,
	} = useWallState();
	const dispatch = useWallDispatch();
	const { request } = useAuth();
	const { widthMm, heightMm } = boundingBoxMm(specs, layout);
	const [drag, setDrag] = useState<DragState | null>(null);
	// Mirrors `drag` so the drag handlers can stay stable across moves
	// (ScreenTile is memoized) while still reading the latest drag.
	const dragRef = useRef<DragState | null>(null);

	const fitScale = Math.min(
		containerWidthPx / widthMm,
		containerHeightPx / heightMm,
	);
	const mmToPx =
		Number.isFinite(fitScale) && fitScale > 0
			? Math.min(MM_TO_PX, fitScale)
			: MM_TO_PX;

	const renders = useMemo(
		() =>
			resolveScreenRenders({
				specs,
				layout,
				selection,
				applied,
				draftText,
				draftAnimation,
				draftColor,
			}),
		[specs, layout, selection, applied, draftText, draftAnimation, draftColor],
	);

	function updateDrag(next: DragState | null) {
		dragRef.current = next;
		setDrag(next);
	}

	const handleToggle = useCallback(
		(screenId: string, additive: boolean) =>
			dispatch({
				type: "request-intent",
				intent: { kind: "toggle-screen", screenId, additive },
			}),
		[dispatch],
	);

	const handleDragStart = useCallback(
		(screenId: string, clientXPx: number, clientYPx: number) => {
			const position = layout.find((p) => p.screenId === screenId);
			if (!position) {
				return;
			}
			updateDrag({
				screenId,
				startClientXPx: clientXPx,
				startClientYPx: clientYPx,
				startXmm: position.xMm,
				startYmm: position.yMm,
				currentXmm: position.xMm,
				currentYmm: position.yMm,
			});
		},
		[layout],
	);

	const handleDragMove = useCallback(
		(clientXPx: number, clientYPx: number) => {
			const current = dragRef.current;
			if (!current) {
				return;
			}
			const candidate = {
				xMm: Math.max(
					0,
					current.startXmm + (clientXPx - current.startClientXPx) / mmToPx,
				),
				yMm: Math.max(
					0,
					current.startYmm + (clientYPx - current.startClientYPx) / mmToPx,
				),
			};
			// Sticky: a candidate that would overlap is simply ignored, so the
			// tile stays at its last valid spot rather than jumping around.
			if (
				!wouldOverlapAny(
					{ specs, positions: layout },
					current.screenId,
					candidate,
				)
			) {
				updateDrag({
					...current,
					currentXmm: candidate.xMm,
					currentYmm: candidate.yMm,
				});
			}
		},
		[mmToPx, specs, layout],
	);

	const handleDragEnd = useCallback(() => {
		const current = dragRef.current;
		if (!current) {
			return;
		}
		dispatch({
			type: "move-screen",
			screenId: current.screenId,
			xMm: current.currentXmm,
			yMm: current.currentYmm,
		});
		const nextLayout: LayoutPosition[] = layout.map((p) =>
			p.screenId === current.screenId
				? { ...p, xMm: current.currentXmm, yMm: current.currentYmm }
				: p,
		);
		updateDrag(null);
		putLayout(request, nextLayout).catch(() => {
			// Layout persistence failing silently just means the next poll
			// (see useWallSync) won't reflect this move for other clients —
			// the local arrangement itself isn't lost.
		});
	}, [dispatch, layout, request]);

	return (
		<div
			className="relative"
			style={{ width: widthMm * mmToPx, height: heightMm * mmToPx }}
		>
			{layout.map((position) => {
				const spec = specById(specs, position.screenId);
				const isDragging = drag?.screenId === spec.id;
				const displayPosition = isDragging
					? { ...position, xMm: drag.currentXmm, yMm: drag.currentYmm }
					: position;
				return (
					<ScreenTile
						key={spec.id}
						spec={spec}
						position={displayPosition}
						mmToPx={mmToPx}
						selected={selection?.screenIds.includes(spec.id) ?? false}
						render={renders.get(spec.id) ?? null}
						draggable={layoutEditMode}
						dragging={isDragging}
						onToggle={handleToggle}
						onDragStart={handleDragStart}
						onDragMove={handleDragMove}
						onDragEnd={handleDragEnd}
					/>
				);
			})}
		</div>
	);
}
