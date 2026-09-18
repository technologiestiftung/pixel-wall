import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { displayScaleForKind, pitchMmPerPx } from "../../domain/layout";
import type { LayoutPosition, ScreenSpec } from "../../domain/types";
import { ContentLayer } from "../../render/ContentLayer";
import type { AppliedRender } from "../../state/reducer";

interface ScreenTileProps {
	spec: ScreenSpec;
	position: LayoutPosition;
	mmToPx: number;
	selected: boolean;
	render: AppliedRender | null;
	draggable: boolean;
	dragging: boolean;
	onToggle: (screenId: string, additive: boolean) => void;
	onDragStart: (clientXPx: number, clientYPx: number) => void;
	onDragMove: (clientXPx: number, clientYPx: number) => void;
	onDragEnd: () => void;
}

function dragCursorClass(draggable: boolean, dragging: boolean): string {
	if (!draggable) {
		return "";
	}
	return dragging ? "cursor-grabbing" : "cursor-grab";
}

export function ScreenTile({
	spec,
	position,
	mmToPx,
	selected,
	render,
	draggable,
	dragging,
	onToggle,
	onDragStart,
	onDragMove,
	onDragEnd,
}: ScreenTileProps) {
	const sizePx = spec.physicalSizeMm * mmToPx;
	const scale = displayScaleForKind(spec.kind, mmToPx);

	function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
		if (!draggable) {
			return;
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		onDragStart(e.clientX, e.clientY);
	}

	function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
		if (!draggable || !dragging) {
			return;
		}
		onDragMove(e.clientX, e.clientY);
	}

	function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
		if (!draggable || !dragging) {
			return;
		}
		e.currentTarget.releasePointerCapture(e.pointerId);
		onDragEnd();
	}

	function handleClick(e: ReactMouseEvent<HTMLButtonElement>) {
		if (draggable) {
			return;
		}
		onToggle(spec.id, e.shiftKey);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			aria-pressed={selected}
			title={
				draggable
					? undefined
					: `${spec.physicalSizeMm}×${spec.physicalSizeMm} mm · ${spec.pixelSize}×${spec.pixelSize} px (Shift+Klick für Mehrfachauswahl)`
			}
			// The extra thickness when selected is an outline rather than a
			// wider border: the tile is sized to the screen's physical size, so
			// growing the border would eat into the content box and nudge the
			// rendered bitmap by a pixel or two on every click.
			className={`absolute overflow-hidden rounded-sm border-2 bg-neutral-900 transition-colors ${
				selected
					? "border-yellow-400 outline outline-2 outline-yellow-400"
					: "border-transparent"
			} ${dragCursorClass(draggable, dragging)}`}
			style={{
				left: position.xMm * mmToPx,
				top: position.yMm * mmToPx,
				width: sizePx,
				height: sizePx,
				touchAction: draggable ? "none" : undefined,
			}}
		>
			{render && (
				<div
					className="pointer-events-none absolute left-0 top-0"
					style={{
						width: spec.pixelSize,
						height: spec.pixelSize,
						transform: `scale(${scale})`,
						transformOrigin: "top left",
					}}
				>
					<ContentLayer render={render} />
				</div>
			)}
			<span className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-white/90 px-1 text-[11px] font-medium leading-[15px] text-neutral-900">
				{spec.id}
			</span>
			<span className="sr-only">
				Bildschirm {spec.id} ({pitchMmPerPx(spec)}mm Pitch)
			</span>
		</button>
	);
}
