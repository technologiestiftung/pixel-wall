import type {
	AnimationContent,
	Content,
	HorizontalAlign,
	UploadedMedia,
	VerticalAlign,
} from "../domain/types";
import { getTemplateImage, getUploadImage } from "./templateImages";

/** Position of a `size`-long span within a `containerSize`-long axis, for a
 * given alignment — shared by both the animation icon and static text.
 * `paddingPx` insets the span from whichever edge it's pushed toward; a
 * "center" alignment ignores it, since there's no edge to inset from. */
// eslint-disable-next-line max-params -- all four are needed; splitting into an options object adds indirection for no benefit here.
export function alignOffset(
	align: "left" | "center" | "right" | "top" | "bottom",
	containerSize: number,
	size: number,
	paddingPx = 0,
): number {
	if (align === "left" || align === "top") {
		return paddingPx;
	}
	if (align === "right" || align === "bottom") {
		return containerSize - size - paddingPx;
	}
	return (containerSize - size) / 2;
}

/**
 * Where a template icon (or an animated template's frame strip — see
 * render/animatedTemplate.ts) sits within a canvas: "cover" sizing, scaled
 * uniformly by the *larger* composite dimension so a multi-screen composite
 * gets filled/spanned rather than fitting a single-screen-sized icon into
 * whichever axis is narrower (see CONTEXT.md "Content"). Shared by both the
 * static and animated draw paths so they place/scale identically at the same
 * scalePercent/align.
 */
export function templateBox(
	content: AnimationContent,
	canvasSize: { widthPx: number; heightPx: number },
): { x: number; y: number; size: number } {
	const size =
		Math.max(canvasSize.widthPx, canvasSize.heightPx) *
		(content.scalePercent / 100);
	return {
		x: alignOffset(content.hAlign, canvasSize.widthPx, size),
		y: alignOffset(content.vAlign, canvasSize.heightPx, size),
		size,
	};
}

/**
 * Where an uploaded frame sits within a canvas. Unlike `templateBox`, uploads
 * aren't square, so this "contains" them: at 100% the whole picture fits the
 * composite, keeping its aspect ratio, and alignment pushes it within the
 * leftover space.
 */
export function uploadBox(
	content: AnimationContent,
	media: UploadedMedia,
	canvasSize: { widthPx: number; heightPx: number },
): { x: number; y: number; widthPx: number; heightPx: number } {
	const fit =
		Math.min(
			canvasSize.widthPx / media.frameWidthPx,
			canvasSize.heightPx / media.frameHeightPx,
		) *
		(content.scalePercent / 100);
	const widthPx = media.frameWidthPx * fit;
	const heightPx = media.frameHeightPx * fit;
	return {
		x: alignOffset(content.hAlign, canvasSize.widthPx, widthPx),
		y: alignOffset(content.vAlign, canvasSize.heightPx, heightPx),
		widthPx,
		heightPx,
	};
}

/** Draws one frame out of an upload's sprite sheet. Enlarging keeps hard
 * pixel edges, since uploads are often pixel art already at LED size. */
// eslint-disable-next-line max-params -- mirrors drawImage's own shape; an options object would only rename the same five values.
export function drawUploadFrame(
	ctx: CanvasRenderingContext2D,
	sheet: HTMLImageElement,
	media: UploadedMedia,
	frameIndex: number,
	box: { x: number; y: number; widthPx: number; heightPx: number },
) {
	const sx = (frameIndex % media.columns) * media.frameWidthPx;
	const sy = Math.floor(frameIndex / media.columns) * media.frameHeightPx;
	ctx.save();
	ctx.imageSmoothingEnabled = box.widthPx < media.frameWidthPx;
	ctx.drawImage(
		sheet,
		sx,
		sy,
		media.frameWidthPx,
		media.frameHeightPx,
		box.x,
		box.y,
		box.widthPx,
		box.heightPx,
	);
	ctx.restore();
}

export function isImageReady(
	img: HTMLImageElement | undefined,
): img is HTMLImageElement {
	return img !== undefined && img.complete && img.naturalWidth > 0;
}

/**
 * Draws the template's `public/visuals/*.svg` artwork (all authored on a
 * square viewBox) at its true colours — the wire format this feeds into is
 * always `pal4` for Animation/Bild content (see render/wire.ts), which
 * carries a real palette rather than one flat colour, so nothing here needs
 * to flatten the source SVG's own colours away.
 *
 * If the image hasn't finished loading yet (async decode — see
 * render/templateImages.ts), this draws nothing; the caller re-renders once
 * it's ready via `useTemplateImagesVersion`.
 */
function drawTemplateIcon(
	ctx: CanvasRenderingContext2D,
	templateId: string,
	box: { x: number; y: number; size: number },
) {
	const img = getTemplateImage(templateId);
	if (!img || !img.complete || img.naturalWidth === 0) {
		return;
	}
	const scale = box.size / Math.max(img.naturalWidth, img.naturalHeight);
	ctx.save();
	ctx.translate(box.x, box.y);
	ctx.scale(scale, scale);
	ctx.drawImage(img, 0, 0);
	ctx.restore();
}

/** True when a real 2D canvas context is actually available — false under
 * jsdom without the optional `canvas` npm package. jsdom's `Image` exists
 * but never actually decodes anything in that case either (setting `.src`
 * never fires `load` or `error`), so render/wire.ts uses this to skip
 * waiting on a template image that would otherwise hang forever. */
export function hasCanvasSupport(): boolean {
	return document.createElement("canvas").getContext("2d") !== null;
}

/**
 * Renders `content` onto a real device-pixel canvas and returns it as a
 * base64 PNG — this is the actual bitmap that would be sent to the backend
 * in the ApplyRequest (see CONTEXT.md "Rendering split" and api/types.ts).
 * Unlike the live DOM/CSS preview in render/ContentLayer.tsx, sizes here are
 * literal device pixels, not display-scaled.
 */
export function rasterizeContent(
	content: Content,
	size: { widthPx: number; heightPx: number },
	background: string | null = null,
): string {
	const canvas = drawContentToCanvas(content, size, { background });
	return canvas === null ? "" : canvas.toDataURL("image/png");
}

/**
 * Renders `content` onto a device-pixel canvas. `monochrome` draws Farbe
 * fills in white regardless of the content's own colour, which is what the
 * `mask1` wire format needs — it carries one colour alongside a 1-bit
 * coverage mask, so the colour must not be baked into the pixels (see
 * docs/wire-format.md). The live preview passes `false` so colours show.
 * Text and Animation/Bild template artwork ignore this flag entirely and
 * always draw in their true colours, since they travel as `pal4` instead —
 * see render/wire.ts.
 *
 * Returns null where no 2D context is available (jsdom without the optional
 * `canvas` package); callers degrade rather than throw.
 */
export function drawContentToCanvas(
	content: Content,
	canvasSize: { widthPx: number; heightPx: number },
	options: { monochrome?: boolean; background?: string | null } = {},
): HTMLCanvasElement | null {
	const { monochrome = false, background = null } = options;
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(canvasSize.widthPx));
	canvas.height = Math.max(1, Math.round(canvasSize.heightPx));
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}

	// The background layer goes down first so the foreground is drawn over it
	// and the whole thing quantizes to one pal4 frame — see render/layers.ts.
	// Under `monochrome` it is skipped: that path wants a coverage mask, and a
	// filled canvas would make every pixel covered.
	if (background !== null && !monochrome) {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	if (content.type === "color") {
		// "ohne" leaves the canvas clear, which is an unlit screen.
		if (content.hex !== null) {
			ctx.fillStyle = monochrome ? "#ffffff" : content.hex;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		return canvas;
	}

	if (content.type === "animation" && content.mode === "upload") {
		const sheet = content.upload && getUploadImage(content.upload.sheetDataUrl);
		if (content.upload && isImageReady(sheet)) {
			drawUploadFrame(
				ctx,
				sheet,
				content.upload,
				0,
				uploadBox(content, content.upload, {
					widthPx: canvas.width,
					heightPx: canvas.height,
				}),
			);
		}
		return canvas;
	}

	if (content.type === "animation") {
		drawTemplateIcon(
			ctx,
			content.templateId,
			templateBox(content, { widthPx: canvas.width, heightPx: canvas.height }),
		);
		return canvas;
	}

	ctx.fillStyle = monochrome ? "#ffffff" : content.color;
	ctx.font = `${content.fontWeight} ${content.fontSizePx}px ${content.fontFamily}`;

	if (content.mode === "static") {
		drawStaticText(ctx, {
			value: content.value,
			widthPx: canvas.width,
			heightPx: canvas.height,
			fontSizePx: content.fontSizePx,
			hAlign: content.hAlign,
			vAlign: content.vAlign,
			paddingPx: content.paddingPx ?? 0,
		});
	} else {
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		const y =
			alignOffset(
				content.vAlign,
				canvas.height,
				content.fontSizePx,
				content.paddingPx ?? 0,
			) +
			content.fontSizePx / 2;
		ctx.fillText(content.value, 0, y);
	}
	return canvas;
}

/** Static text supports multiple lines (the editor's textarea allows them);
 * the whole text block is positioned as a unit per hAlign/vAlign. */
function drawStaticText(
	ctx: CanvasRenderingContext2D,
	options: {
		value: string;
		widthPx: number;
		heightPx: number;
		fontSizePx: number;
		hAlign: HorizontalAlign;
		vAlign: VerticalAlign;
		paddingPx: number;
	},
) {
	const { value, widthPx, heightPx, fontSizePx, hAlign, vAlign, paddingPx } =
		options;
	const lines = value.split("\n");
	const lineHeight = fontSizePx * 1.2;
	const blockHeight = lines.length * lineHeight;
	const blockTop = alignOffset(vAlign, heightPx, blockHeight, paddingPx);

	ctx.textAlign = hAlign;
	ctx.textBaseline = "middle";
	const x = alignOffset(hAlign, widthPx, 0, paddingPx);

	lines.forEach((line, i) => {
		ctx.fillText(line, x, blockTop + i * lineHeight + lineHeight / 2);
	});
}
