export interface MarqueeParams {
	/** Width of the composite content area the text scrolls across, in preview px. */
	compositeWidthPx: number;
	/** Natural rendered width of the full text at its chosen font, in preview px. */
	textWidthPx: number;
	speedPxPerSec: number;
	pauseMs: number;
	direction: "left" | "right";
}

/**
 * Pure function of elapsed time → the text's current x offset (preview px)
 * within the composite content area. Being a pure function of
 * `performance.now()` (rather than component-local state) is what keeps
 * multiple screen tiles showing the same scrolling text in sync "for free" —
 * see CONTEXT.md "Rendering split" and the ContentLayer implementation.
 *
 * The text starts fully hidden past one edge, travels across to fully
 * hidden past the other edge, then holds there for `pauseMs` before looping
 * (a fixed 2s pause is used for real Lauftext — see CONTEXT.md "Content").
 */
export function marqueeOffsetPx(
	elapsedMs: number,
	params: MarqueeParams,
): number {
	const { compositeWidthPx, textWidthPx, speedPxPerSec, pauseMs, direction } =
		params;
	const travelPx = compositeWidthPx + textWidthPx;
	const durationMs = speedPxPerSec > 0 ? (travelPx / speedPxPerSec) * 1000 : 0;
	const cycleMs = durationMs + pauseMs;

	const start = direction === "left" ? compositeWidthPx : -textWidthPx;
	const end = direction === "left" ? -textWidthPx : compositeWidthPx;

	if (cycleMs <= 0) {
		return start;
	}

	const t = ((elapsedMs % cycleMs) + cycleMs) % cycleMs;
	if (t >= durationMs) {
		return end;
	}

	const progress = t / durationMs;
	return start + (end - start) * progress;
}
