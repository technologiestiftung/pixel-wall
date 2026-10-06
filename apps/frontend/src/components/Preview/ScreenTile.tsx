import { memo, type MouseEvent as ReactMouseEvent } from "react";
import {
	displayScaleForKind,
	displayScreenId,
	pitchMmPerPx,
} from "../../domain/layout";
import type { LayoutPosition, ScreenSpec } from "../../domain/types";
import { ContentLayer } from "../../render/ContentLayer";
import type { AppliedRender } from "../../state/reducer";

interface ScreenTileProps {
	spec: ScreenSpec;
	position: LayoutPosition;
	mmToPx: number;
	selected: boolean;
	render: AppliedRender | null;
	onToggle: (screenId: string, additive: boolean) => void;
}

// Real LED matrices have a small physical gap between adjacent LEDs within
// their pixel pitch (see PITCH_MM_PER_PX) — the LED itself doesn't fill the
// whole pitch. This is the fraction of one pixel's on-screen size reserved
// for that gap, rendered as a grid overlay in the panel's own dark color.
const PIXEL_GAP_FRACTION = 0.14;

/** Memoized: typing into the edit panel re-renders the Stage on every
 * keystroke, but only the selected tiles' renders actually change. */
export const ScreenTile = memo(function ScreenTile({
	spec,
	position,
	mmToPx,
	selected,
	render,
	onToggle,
}: ScreenTileProps) {
	const sizePx = spec.physicalSizeMm * mmToPx;
	const scale = displayScaleForKind(spec.kind, mmToPx);
	const gapPx = scale * PIXEL_GAP_FRACTION;

	function handleClick(e: ReactMouseEvent<HTMLButtonElement>) {
		onToggle(spec.id, e.shiftKey);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			aria-pressed={selected}
			title={`${spec.physicalSizeMm}×${spec.physicalSizeMm} mm · ${spec.pixelSize}×${spec.pixelSize} px (Shift+Klick für Mehrfachauswahl)`}
			// The extra thickness when selected is an outline rather than a
			// wider border: the tile is sized to the screen's physical size, so
			// growing the border would eat into the content box and nudge the
			// rendered bitmap by a pixel or two on every click.
			className={`absolute overflow-hidden rounded-sm border-2 bg-neutral-900 transition-colors ${
				selected
					? "border-yellow-400 outline outline-2 outline-yellow-400"
					: "border-transparent"
			}`}
			style={{
				left: position.xMm * mmToPx,
				top: position.yMm * mmToPx,
				width: sizePx,
				height: sizePx,
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
				{displayScreenId(spec.id)}
			</span>
			<span className="sr-only">
				Bildschirm {displayScreenId(spec.id)} ({pitchMmPerPx(spec)}mm Pitch)
			</span>
		</button>
	);
});
