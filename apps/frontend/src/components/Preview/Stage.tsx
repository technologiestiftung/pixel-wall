import { useCallback, useMemo } from "react";
import {
	DEFAULT_LAYOUT,
	MM_TO_PX,
	boundingBoxMm,
	specById,
} from "../../domain/layout";
import { resolveScreenRenders } from "../../state/selectors";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { ScreenTile } from "./ScreenTile";

interface StageProps {
	containerWidthPx: number;
	containerHeightPx: number;
}

export function Stage({ containerWidthPx, containerHeightPx }: StageProps) {
	const { specs, selection, applied, draftText, draftAnimation, draftColor } =
		useWallState();
	const dispatch = useWallDispatch();
	const { widthMm, heightMm } = boundingBoxMm(specs, DEFAULT_LAYOUT);

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
				selection,
				applied,
				draftText,
				draftAnimation,
				draftColor,
			}),
		[specs, selection, applied, draftText, draftAnimation, draftColor],
	);

	const handleToggle = useCallback(
		(screenId: string, additive: boolean) =>
			dispatch({
				type: "request-intent",
				intent: { kind: "toggle-screen", screenId, additive },
			}),
		[dispatch],
	);

	return (
		<div
			className="relative"
			style={{ width: widthMm * mmToPx, height: heightMm * mmToPx }}
		>
			{DEFAULT_LAYOUT.map((position) => {
				const spec = specById(specs, position.screenId);
				return (
					<ScreenTile
						key={spec.id}
						spec={spec}
						position={position}
						mmToPx={mmToPx}
						selected={selection?.screenIds.includes(spec.id) ?? false}
						render={renders.get(spec.id) ?? null}
						onToggle={handleToggle}
					/>
				);
			})}
		</div>
	);
}
