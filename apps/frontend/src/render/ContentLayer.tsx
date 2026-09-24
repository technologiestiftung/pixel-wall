import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ANIMATION_FPS, LOOP_PAUSE_MS, TEMPLATES } from "../domain/content";
import type {
	AnimationContent,
	ScreenKind,
	ScreenLayers,
	TextContent,
} from "../domain/types";
import type { AppliedRender } from "../state/reducer";
import { frameCountFor, renderAnimationFrameStrip } from "./animatedTemplate";
import { useFontsVersion } from "./fonts";
import { rasterizeContent } from "./rasterize";
import { measureTextWidthPx } from "./text";
import { useTemplateImagesVersion } from "./templateImages";
import { useAnimationFrameIndex } from "./useAnimationFrameIndex";
import { useMarqueeOffset } from "./useMarqueeOffset";

interface ContentLayerProps {
	render: AppliedRender;
	screenKind: ScreenKind;
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
export function ContentLayer({ render, screenKind }: ContentLayerProps) {
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
				// Large screens composite a static background behind the panned
				// text (see render/layers.ts scrollBackgroundSupported); small
				// screens don't support that yet, so they keep showing on black
				// exactly as before — see
				// docs/adr/0001-phase-lauftext-background-by-hardware-kind.md.
				backgroundHex={screenKind === "large" ? layers.background : null}
				compositeWidthPx={compositeWidthPx}
				compositeHeightPx={compositeHeightPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		);
	}

	const animatedTemplate =
		foreground?.type === "animation"
			? TEMPLATES.find((t) => t.id === foreground.templateId)
			: undefined;
	if (foreground?.type === "animation" && animatedTemplate?.animated) {
		return (
			<AnimatedBitmap
				content={foreground}
				loopMs={animatedTemplate.loopMs ?? 4000}
				backgroundHex={layers.background}
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
	backgroundHex,
	compositeWidthPx,
	compositeHeightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: TextContent;
	backgroundHex: string | null;
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
					// Static and non-scrolling, unlike the filmstrip below: this div
					// itself never animates, only the <img> inside it does, so a
					// background painted here never travels with the panning text.
					backgroundColor: backgroundHex ?? undefined,
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

/**
 * Live preview of an animated Animation/Bild template: builds the same
 * frame-strip render/wire.ts sends to the wall (via
 * render/animatedTemplate.ts) and steps through it with `left` offsets —
 * the same sprite-sheet technique as `ScrollingBitmap` above, just stepped
 * per frame instead of panned continuously. Strip generation is async (DOM
 * injection + CSS animation scrubbing), so this renders nothing until the
 * first strip resolves, then keeps it until a real dependency changes rather
 * than flashing blank on every edit.
 */
function AnimatedBitmap({
	content,
	loopMs,
	backgroundHex,
	compositeWidthPx,
	compositeHeightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: AnimationContent;
	loopMs: number;
	backgroundHex: string | null;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const frameCount = frameCountFor(loopMs, ANIMATION_FPS);
	const frameDurationMs = loopMs / frameCount;

	const [stripUrl, setStripUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		renderAnimationFrameStrip(
			content,
			{ widthPx: compositeWidthPx, heightPx: compositeHeightPx },
			{ frameCount, background: backgroundHex },
		).then((canvas) => {
			if (!cancelled) {
				setStripUrl(canvas ? canvas.toDataURL("image/png") : null);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [
		JSON.stringify(content),
		backgroundHex,
		compositeWidthPx,
		compositeHeightPx,
		frameCount,
	]);

	const frameIndex = useAnimationFrameIndex(frameCount, frameDurationMs);

	if (stripUrl === null) {
		return null;
	}

	return (
		<div className="absolute inset-0 overflow-hidden">
			<img
				src={stripUrl}
				alt=""
				style={{
					...BITMAP_STYLE,
					position: "absolute",
					left: -(frameIndex * compositeWidthPx) - offsetXPx,
					top: -offsetYPx,
				}}
			/>
		</div>
	);
}
