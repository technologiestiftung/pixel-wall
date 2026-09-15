import { useEffect, useRef, useState } from "react";
import { Stage } from "./Stage";
import { Toolbar } from "./Toolbar";

export function Preview() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({
		widthPx: 0,
		heightPx: 0,
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return () => {};
		}
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				setContainerSize({
					widthPx: entry.contentRect.width,
					heightPx: entry.contentRect.height,
				});
			}
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	return (
		<section className="flex flex-1 flex-col overflow-hidden bg-neutral-50 p-9">
			<Toolbar />
			{/* The wall never scrolls — Stage shrinks to fit whatever space this
			 * container measures out to (see domain/layout.ts MM_TO_PX). */}
			<div
				ref={containerRef}
				className="mt-8 flex flex-1 items-center justify-center overflow-hidden"
			>
				{containerSize.widthPx > 0 && containerSize.heightPx > 0 && (
					<Stage
						containerWidthPx={containerSize.widthPx}
						containerHeightPx={containerSize.heightPx}
					/>
				)}
			</div>
		</section>
	);
}
