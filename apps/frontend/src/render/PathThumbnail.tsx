import {
	PFADTEXT_CANVAS_SIZE,
	PFADTEXT_SCREEN_RECTS,
	type PfadtextPathOption,
} from "../domain/pfadtextPath";

const SAMPLES = 48;

/** Builds an SVG polyline `points` attribute tracing `option`'s curve from
 * start to end, in the same fixed device-pixel composite space every
 * PFADTEXT_PATHS path and PFADTEXT_SCREEN_RECTS are defined in — so this and
 * the screen squares below line up without any extra scaling math. */
function pathPoints(option: PfadtextPathOption): string {
	const { path } = option;
	return Array.from({ length: SAMPLES + 1 }, (_, i) => {
		const p = path.pointAt((path.lengthPx * i) / SAMPLES);
		return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
	}).join(" ");
}

/**
 * Menu preview for a Pfadtext path: the 4 large screens (faint, for context)
 * with the curve threading through them — the Pfadtext equivalent of
 * render/TemplateIcon.tsx's Animation/Bild artwork preview, drawn rather than
 * loaded since a path is pure geometry, not a file.
 */
export function PathThumbnail({
	option,
	className,
}: {
	option: PfadtextPathOption;
	className?: string;
}) {
	const { widthPx, heightPx } = PFADTEXT_CANVAS_SIZE;
	return (
		<svg
			viewBox={`0 0 ${widthPx} ${heightPx}`}
			className={className}
			aria-hidden="true"
		>
			{PFADTEXT_SCREEN_RECTS.map((rect) => (
				<rect
					key={rect.id}
					x={rect.x}
					y={rect.y}
					width={rect.size}
					height={rect.size}
					rx={rect.size * 0.12}
					fill="none"
					stroke="#6b6b66"
					strokeWidth={2}
				/>
			))}
			<polyline
				points={pathPoints(option)}
				fill="none"
				stroke="#FEF177"
				strokeWidth={5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
