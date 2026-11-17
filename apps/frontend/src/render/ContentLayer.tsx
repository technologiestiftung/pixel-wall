import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LOOP_PAUSE_MS } from "../domain/content";
import type {
	AnimationContent,
	ScreenLayers,
	TemperatureStyle,
	TextContent,
	UploadedMedia,
} from "../domain/types";
import type { MarqueeParams } from "../domain/scroll";
import { DEFAULT_WEATHER_VARIANT } from "../domain/weather";
import type { AppliedRender } from "../state/reducer";
import { useCurrentWeather } from "../state/useCurrentWeather";
import { animationTiming, renderAnimationFrameStrip } from "./animatedTemplate";
import { useFontsVersion } from "./fonts";
import { pathTextTiming, renderPathTextFrameStrip } from "./pathText";
import { createCanvas, rasterizeContent } from "./rasterize";
import {
	drawTemperature,
	formatTemperature,
	renderTemperatureGlyphs,
	TEMPERATURE_PLACEHOLDER,
} from "./temperature";
import { measureTextWidthPx } from "./text";
import { useTemplateImagesVersion } from "./templateImages";
import { useAnimationFrameIndex } from "./useAnimationFrameIndex";
import { useMarqueeOffset } from "./useMarqueeOffset";
import { asWeatherUpload, loadWeatherMedia } from "./weatherMedia";

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
				// Both hardware kinds composite a static background behind the
				// panned text now — see render/layers.ts layersToWire and
				// docs/adr/0001-phase-lauftext-background-by-hardware-kind.md.
				backgroundHex={layers.background}
				compositeWidthPx={compositeWidthPx}
				compositeHeightPx={compositeHeightPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		);
	}

	if (foreground?.type === "text" && foreground.mode === "path") {
		const timing = pathTextTiming(foreground);
		if (timing) {
			return (
				<PathTextBitmap
					content={foreground}
					frameCount={timing.frameCount}
					frameDurationMs={timing.frameDurationMs}
					backgroundHex={layers.background}
					compositeWidthPx={compositeWidthPx}
					compositeHeightPx={compositeHeightPx}
					offsetXPx={offsetXPx}
					offsetYPx={offsetYPx}
				/>
			);
		}
		// Static Pfadtext falls through to StaticBitmap below — already generic
		// via rasterizeContent (see render/rasterize.ts's drawStaticPathText).
	}

	// No bitmap ever crosses the wire for Game of Life (see CONTEXT.md
	// "Rendering split"), so unlike every other content type here the
	// preview cannot mirror the real device — it shows a static placeholder
	// instead of a rendered frame. Checked before the animated-template
	// branch below since a gameOfLife AnimationContent's `templateId` is a
	// meaningless placeholder value, not a real template to look up.
	if (foreground?.type === "animation" && foreground.mode === "gameOfLife") {
		return <GameOfLifePlaceholder />;
	}

	if (foreground?.type === "animation" && foreground.mode === "weather") {
		return (
			<WeatherBitmap
				content={foreground}
				backgroundHex={layers.background}
				compositeWidthPx={compositeWidthPx}
				compositeHeightPx={compositeHeightPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		);
	}

	const timing =
		foreground?.type === "animation" ? animationTiming(foreground) : null;
	if (foreground?.type === "animation" && timing) {
		return (
			<AnimatedBitmap
				content={foreground}
				frameCount={timing.frameCount}
				frameDurationMs={timing.frameDurationMs}
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

/** Static stand-in for a screen currently running Game of Life — see the
 * comment above where this is used. Always the whole tile, ignoring the
 * screen's window: every screen runs its own board rather than a slice of a
 * shared picture (see CONTEXT.md "Content" — Game of Life). */
function GameOfLifePlaceholder() {
	return (
		<Bitmap
			src="/visuals/game-of-life-placeholder.svg"
			offsetXPx={0}
			offsetYPx={0}
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
				<MarqueeImage
					src={bitmap}
					enabled={content.value.length > 0}
					compositeWidthPx={compositeWidthPx}
					textWidthPx={textWidthPx}
					speedPxPerSec={content.speedPxPerSec ?? 60}
					pauseMs={content.pauseMs ?? LOOP_PAUSE_MS}
					direction={content.direction ?? "left"}
				/>
			</div>
		</div>
	);
}

/** Split out so only this `<img>` re-renders every animation frame, not the
 * rasterizing parent. */
function MarqueeImage({
	src,
	enabled,
	...params
}: MarqueeParams & { src: string; enabled: boolean }) {
	const offset = useMarqueeOffset(enabled, params);
	return (
		<img
			src={src}
			alt=""
			style={{
				...BITMAP_STYLE,
				position: "absolute",
				left: offset,
				top: 0,
			}}
		/>
	);
}

/** Live weather previews whichever icon the backend says the wall is
 * showing right now, drawn exactly like an uploaded animation. */
function WeatherBitmap({
	content,
	...placement
}: {
	content: AnimationContent;
	backgroundHex: string | null;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const weather = useCurrentWeather();
	const variant = weather?.variant ?? DEFAULT_WEATHER_VARIANT;
	const [media, setMedia] = useState<UploadedMedia | null>(null);
	useEffect(() => {
		let cancelled = false;
		loadWeatherMedia(variant)
			.then((loaded) => {
				if (!cancelled) {
					setMedia(loaded);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [variant]);

	if (media === null) {
		return null;
	}
	return (
		<>
			<AnimatedBitmap
				content={asWeatherUpload(content, media)}
				frameCount={media.frameCount}
				frameDurationMs={media.frameDurationMs}
				{...placement}
			/>
			{content.temperature && (
				<TemperatureOverlay
					style={content.temperature}
					text={
						typeof weather?.temperature === "number"
							? formatTemperature(weather.temperature)
							: TEMPERATURE_PLACEHOLDER
					}
					widthPx={placement.compositeWidthPx}
					heightPx={placement.compositeHeightPx}
					offsetXPx={placement.offsetXPx}
					offsetYPx={placement.offsetYPx}
				/>
			)}
		</>
	);
}

/** Drawn from the same pre-rendered glyphs the backend stamps onto the
 * wall's frames, so the preview shows exactly what the panels will. */
function TemperatureOverlay({
	style,
	text,
	widthPx,
	heightPx,
	offsetXPx,
	offsetYPx,
}: {
	style: TemperatureStyle;
	text: string;
	widthPx: number;
	heightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const [src, setSrc] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		renderTemperatureGlyphs(style).then((glyphs) => {
			const canvas = createCanvas({ widthPx, heightPx });
			const ctx = canvas.getContext("2d");
			if (cancelled || !ctx) {
				return;
			}
			drawTemperature(ctx, { text, glyphs, style });
			setSrc(canvas.toDataURL("image/png"));
		});
		return () => {
			cancelled = true;
		};
	}, [JSON.stringify(style), text, widthPx, heightPx]);

	if (src === null) {
		return null;
	}
	return <Bitmap src={src} offsetXPx={offsetXPx} offsetYPx={offsetYPx} />;
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
	frameCount,
	frameDurationMs,
	backgroundHex,
	compositeWidthPx,
	compositeHeightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: AnimationContent;
	frameCount: number;
	frameDurationMs: number;
	backgroundHex: string | null;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
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

	if (stripUrl === null) {
		return null;
	}

	return (
		<div className="absolute inset-0 overflow-hidden">
			<FrameStripImage
				src={stripUrl}
				frameCount={frameCount}
				frameDurationMs={frameDurationMs}
				frameWidthPx={compositeWidthPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		</div>
	);
}

/** Split out so stepping frames re-renders only this `<img>`, not the parent
 * whose effect dependencies serialize the whole content (an upload's sprite
 * sheet included) on every render. */
function FrameStripImage({
	src,
	frameCount,
	frameDurationMs,
	frameWidthPx,
	offsetXPx,
	offsetYPx,
}: {
	src: string;
	frameCount: number;
	frameDurationMs: number;
	frameWidthPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const frameIndex = useAnimationFrameIndex(frameCount, frameDurationMs);
	return (
		<img
			src={src}
			alt=""
			style={{
				...BITMAP_STYLE,
				position: "absolute",
				left: -(frameIndex * frameWidthPx) - offsetXPx,
				top: -offsetYPx,
			}}
		/>
	);
}

/**
 * Live preview of running Pfadtext: builds the same frame strip
 * render/wire.ts sends to the wall (via render/pathText.ts) and steps
 * through it with the same `FrameStripImage` sprite-sheet technique as
 * `AnimatedBitmap` above — the two differ only in which module builds the
 * strip (an SVG template's own animation vs. glyphs walked along
 * PFADTEXT_PATH).
 */
function PathTextBitmap({
	content,
	frameCount,
	frameDurationMs,
	backgroundHex,
	compositeWidthPx,
	compositeHeightPx,
	offsetXPx,
	offsetYPx,
}: {
	content: TextContent;
	frameCount: number;
	frameDurationMs: number;
	backgroundHex: string | null;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
}) {
	const fontsVersion = useFontsVersion();
	const [stripUrl, setStripUrl] = useState<string | null>(null);
	useEffect(() => {
		const canvas = renderPathTextFrameStrip(
			content,
			{ widthPx: compositeWidthPx, heightPx: compositeHeightPx },
			{ frameCount, background: backgroundHex },
		);
		setStripUrl(canvas ? canvas.toDataURL("image/png") : null);
	}, [
		JSON.stringify(content),
		backgroundHex,
		compositeWidthPx,
		compositeHeightPx,
		frameCount,
		fontsVersion,
	]);

	if (stripUrl === null) {
		return null;
	}

	return (
		<div className="absolute inset-0 overflow-hidden">
			<FrameStripImage
				src={stripUrl}
				frameCount={frameCount}
				frameDurationMs={frameDurationMs}
				frameWidthPx={compositeWidthPx}
				offsetXPx={offsetXPx}
				offsetYPx={offsetYPx}
			/>
		</div>
	);
}
