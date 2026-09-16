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

// Real LED matrices have a small physical gap between adjacent LEDs within
// their pixel pitch (see PITCH_MM_PER_PX) — the LED itself doesn't fill the
// whole pitch. This is the fraction of one pixel's on-screen size reserved
// for that gap, rendered as a grid overlay in the panel's own dark color.
const PIXEL_GAP_FRACTION = 0.14;

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
	const gapPx = scale * PIXEL_GAP_FRACTION;

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
			className={`absolute overflow-hidden rounded-sm border-2 bg-neutral-900 transition-colors ${
				selected ? "border-blue-500" : "border-transparent"
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
			{render && (
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						backgroundImage:
							"linear-gradient(to right, #171717 0, #171717 var(--gap), transparent var(--gap)), linear-gradient(to bottom, #171717 0, #171717 var(--gap), transparent var(--gap))",
						backgroundSize: `${scale}px ${scale}px`,
						["--gap" as string]: `${gapPx}px`,
					}}
				/>
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
