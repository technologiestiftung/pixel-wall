import { useEffect, useState } from "react";
import { marqueeOffsetPx, type MarqueeParams } from "../domain/scroll";

/**
 * Live x-offset for a scrolling Lauftext, driven by `performance.now()`
 * directly (rather than component-local elapsed time) so that every screen
 * tile rendering the same marquee stays in sync automatically — see
 * domain/scroll.ts.
 */
export function useMarqueeOffset(enabled: boolean, params: MarqueeParams): number {
	const [offset, setOffset] = useState(() => marqueeOffsetPx(performance.now(), params));

	useEffect(() => {
		if (!enabled) {
			return () => {};
		}
		let frame: number;
		const tick = () => {
			setOffset(marqueeOffsetPx(performance.now(), params));
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [
		enabled,
		params.compositeWidthPx,
		params.textWidthPx,
		params.speedPxPerSec,
		params.pauseMs,
		params.direction,
	]);

	return offset;
}
