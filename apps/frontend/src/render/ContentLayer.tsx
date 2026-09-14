import { useMemo, type CSSProperties } from "react";
import { LOOP_PAUSE_MS } from "../domain/content";
import type { Content, TextContent } from "../domain/types";
import type { AppliedRender } from "../state/reducer";
import { rasterizeContent } from "./rasterize";
import { measureTextWidthPx } from "./text";
import { useMarqueeOffset } from "./useMarqueeOffset";

interface ContentLayerProps {
	render: AppliedRender;
}

// Tailwind's preflight reset applies `img { max-width: 100%; height: auto }`
// globally, which silently shrinks these bitmaps to fit their (much
// smaller) single-screen container whenever a composite spans more than
// one screen — exactly the case this whole mechanism exists for. Explicit
// width/height + maxWidth: "none" defeats that reset so the negative-offset
// slicing technique actually gets the true, natural-pixel-sized image.
const PIXELATED: CSSProperties = { imageRendering: "pixelated", maxWidth: "none" };

/**
 * Renders one screen's slice of a (possibly multi-screen) composite content
 * area, entirely in real device pixels — the parent (ScreenTile) magnifies
 * the whole thing with a single CSS transform for the preview, so nothing
 * in here needs to know about display scale.
 *
 * Both sources render an actual rasterized bitmap with `image-rendering:
 * pixelated`, so the preview looks like the real 32×32/64×64 LED grid
 * rather than smooth vector text/icons — "local" rasterizes live via
 * render/rasterize.ts (the same function used to build the real backend
 * payload — see domain/apply.ts), "remote" is a bitmap already hydrated
 * from the backend. See CONTEXT.md "Rendering split": the backend only
 * ever stores/forwards a rendered bitmap, never the original editable
 * content, so a server-hydrated screen can only show a static frame, not
 * reconstruct a live animation — that's not a limitation, it's exactly
 * what the real hardware contract expects.
 */
export function ContentLayer({ render }: ContentLayerProps) {
	if (render.source === "remote") {
		return <Bitmap src={render.bitmap} offsetXPx={render.offsetXPx} offsetYPx={render.offsetYPx} />;
	}

	const { content, compositeWidthPx, compositeHeightPx, offsetXPx, offsetYPx } = render;

	if (content.type === "text" && content.mode === "scrolling") {
		return (
			<ScrollingBitmap
				content={content}
				compositeWidthPx={compositeWidthPx}
				compositeHeightPx={compositeHeightPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		);
	}

	return (
		<StaticBitmap
			content={content}
			widthPx={compositeWidthPx}
			heightPx={compositeHeightPx}
			offsetXPx={offsetXPx}
			offsetYPx={offsetYPx}
		/>
	);
}

function Bitmap({ src, offsetXPx, offsetYPx }: { src: string; offsetXPx: number; offsetYPx: number }) {
	return (
		<div className="absolute inset-0 overflow-hidden">
			<img src={src} alt="" style={{ ...PIXELATED, position: "absolute", left: -offsetXPx, top: -offsetYPx }} />
		</div>
	);
}

function StaticBitmap({
	content,
	widthPx,
	heightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: Content;
	widthPx: number;
	heightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const bitmap = useMemo(() => rasterizeContent(content, widthPx, heightPx), [JSON.stringify(content), widthPx, heightPx]);
	return <Bitmap src={bitmap} offsetXPx={offsetXPx} offsetYPx={offsetYPx} />;
}

function ScrollingBitmap({
	content,
	compositeWidthPx,
	compositeHeightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: TextContent;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const font = { fontSizePx: content.fontSizePx, fontWeight: content.fontWeight, fontFamily: content.fontFamily };
	const textWidthPx = useMemo(() => Math.max(1, Math.round(measureTextWidthPx(content.value, font))), [
		content.value,
		content.fontSizePx,
		content.fontWeight,
		content.fontFamily,
	]);
	const bitmap = useMemo(
		() => rasterizeContent(content, textWidthPx, compositeHeightPx),
		[JSON.stringify(content), textWidthPx, compositeHeightPx],
	);
	const offset = useMarqueeOffset(content.value.length > 0, {
		compositeWidthPx,
		textWidthPx,
		speedPxPerSec: content.speedPxPerSec ?? 60,
		pauseMs: LOOP_PAUSE_MS,
		direction: content.direction ?? "left",
	});

	return (
		<div className="absolute inset-0 overflow-hidden">
			<div className="absolute overflow-hidden" style={{ left: -offsetXPx, top: -offsetYPx, width: compositeWidthPx, height: compositeHeightPx }}>
				<img src={bitmap} alt="" style={{ ...PIXELATED, position: "absolute", left: offset, top: 0 }} />
			</div>
		</div>
	);
}
