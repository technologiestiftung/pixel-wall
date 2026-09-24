import { useEffect, useState } from "react";

/**
 * Live frame index for an animated Animation/Bild template, driven by
 * `performance.now()` directly — the same pattern as useMarqueeOffset.ts —
 * so every screen tile previewing the same content stays in phase
 * automatically, with no shared start-time state to thread through.
 */
export function useAnimationFrameIndex(
	frameCount: number,
	frameDurationMs: number,
): number {
	const compute = (): number => {
		if (frameCount <= 1 || !(frameDurationMs > 0)) {
			return 0;
		}
		const cycleMs = frameCount * frameDurationMs;
		const t = performance.now() % cycleMs;
		return Math.min(frameCount - 1, Math.floor(t / frameDurationMs));
	};

	const [index, setIndex] = useState(compute);

	useEffect(() => {
		if (frameCount <= 1 || !(frameDurationMs > 0)) {
			return () => {};
		}
		let frame: number;
		const tick = () => {
			setIndex(compute());
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [frameCount, frameDurationMs]);

	return index;
}
