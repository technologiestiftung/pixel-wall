import { useMemo, type CSSProperties } from "react";
import { LOOP_PAUSE_MS } from "../domain/content";
import type { ScreenLayers, TextContent } from "../domain/types";
import type { AppliedRender } from "../state/reducer";
import { useFontsVersion } from "./fonts";
import { rasterizeContent } from "./rasterize";
import { measureTextWidthPx } from "./text";
import { useTemplateImagesVersion } from "./templateImages";
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
const BITMAP_STYLE: CSSProperties = {
	imageRendering: "pixelated",
	maxWidth: "none",
};

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
	const { layers, compositeWidthPx, compositeHeightPx, offsetXPx, offsetYPx } =
		render;

	// No layers to render from: this screen was hydrated from a state file
	// that only had the flattened frame, so the picture is all there is.
	if (render.bitmap !== null) {
		return (
			<Bitmap src={render.bitmap} offsetXPx={offsetXPx} offsetYPx={offsetYPx} />
		);
	}

	const { foreground } = layers;
	if (foreground?.type === "text" && foreground.mode === "scrolling") {
		return (
			<ScrollingBitmap
				content={foreground}
				compositeWidthPx={compositeWidthPx}
				compositeHeightPx={compositeHeightPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		);
	}

	return (
		<StaticBitmap
			layers={layers}
			widthPx={compositeWidthPx}
			heightPx={compositeHeightPx}
			offsetXPx={offsetXPx}
			offsetYPx={offsetYPx}
		/>
	);
}

function Bitmap({
	src,
	offsetXPx,
	offsetYPx,
}: {
	src: string;
	offsetXPx: number;
	offsetYPx: number;
}) {
	return (
		<div className="absolute inset-0 overflow-hidden">
			<img
				src={src}
				alt=""
				style={{
					...BITMAP_STYLE,
					position: "absolute",
					left: -offsetXPx,
					top: -offsetYPx,
				}}
			/>
		</div>
	);
}

function StaticBitmap({
	layers,
	widthPx,
	heightPx,
	offsetXPx,
	offsetYPx,
}: {
	layers: ScreenLayers;
	widthPx: number;
	heightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	// Template artwork loads async (see templateImages.ts); this version
	// bumps once it's ready so an animation template's first render — drawn
	// before its image decoded — gets replaced with the real bitmap.
	const templateImagesVersion = useTemplateImagesVersion();
	// Custom Schriftart fonts (see render/fonts.ts) load async, just like
	// template artwork — this re-rasterizes once the real typeface is ready.
	const fontsVersion = useFontsVersion();
	// Same canvas the wire encoder rasterizes: background painted first, then
	// the foreground over it, which is what makes one pal4 frame out of two
	// layers (see render/layers.ts).
	const bitmap = useMemo(
		() =>
			rasterizeContent(
				layers.foreground ?? { type: "color", hex: layers.background },
				{ widthPx, heightPx },
				layers.foreground === null ? null : layers.background,
			),
		[
			JSON.stringify(layers),
			widthPx,
			heightPx,
			templateImagesVersion,
			fontsVersion,
		],
	);
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
	const font = {
		fontSizePx: content.fontSizePx,
		fontWeight: content.fontWeight,
		fontFamily: content.fontFamily,
	};
	const fontsVersion = useFontsVersion();
	const textWidthPx = useMemo(
		() => Math.max(1, Math.round(measureTextWidthPx(content.value, font))),
		[
			content.value,
			content.fontSizePx,
			content.fontWeight,
			content.fontFamily,
			fontsVersion,
		],
	);
	const bitmap = useMemo(
		() =>
			rasterizeContent(content, {
				widthPx: textWidthPx,
				heightPx: compositeHeightPx,
			}),
		[JSON.stringify(content), textWidthPx, compositeHeightPx, fontsVersion],
	);
	const offset = useMarqueeOffset(content.value.length > 0, {
		compositeWidthPx,
		textWidthPx,
		speedPxPerSec: content.speedPxPerSec ?? 60,
		pauseMs: content.pauseMs ?? LOOP_PAUSE_MS,
		direction: content.direction ?? "left",
	});

	return (
		<div className="absolute inset-0 overflow-hidden">
			<div
				className="absolute overflow-hidden"
				style={{
					left: -offsetXPx,
					top: -offsetYPx,
					width: compositeWidthPx,
					height: compositeHeightPx,
				}}
			>
				<img
					src={bitmap}
					alt=""
					style={{
						...BITMAP_STYLE,
						position: "absolute",
						left: offset,
						top: 0,
					}}
				/>
			</div>
		</div>
	);
}
