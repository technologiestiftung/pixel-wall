import type { Content, HorizontalAlign, VerticalAlign } from "../domain/types";
import { getTemplateImage } from "./templateImages";

/** Position of a `size`-long span within a `containerSize`-long axis, for a
 * given alignment — shared by both the animation icon and static text. */
function alignOffset(
	align: "left" | "center" | "right" | "top" | "bottom",
	containerSize: number,
	size: number,
): number {
	if (align === "left" || align === "top") {
		return 0;
	}
	if (align === "right" || align === "bottom") {
		return containerSize - size;
	}
	return (containerSize - size) / 2;
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

/**
 * Renders `content` onto a real device-pixel canvas and returns it as a
 * base64 PNG — this is the actual bitmap that would be sent to the backend
 * in the ApplyRequest (see CONTEXT.md "Rendering split" and api/types.ts).
 * Unlike the live DOM/CSS preview in render/ContentLayer.tsx, sizes here are
 * literal device pixels, not display-scaled.
 */
export function rasterizeContent(
	content: Content,
	widthPx: number,
	heightPx: number,
): string {
	const canvas = drawContentToCanvas(content, { widthPx, heightPx }, false);
	return canvas === null ? "" : canvas.toDataURL("image/png");
}

/**
 * Renders `content` onto a device-pixel canvas. `monochrome` draws text and
 * Farbe fills in white regardless of the content's own colour, which is what
 * the `mask1` wire format needs — it carries one colour alongside a 1-bit
 * coverage mask, so the colour must not be baked into the pixels (see
 * docs/wire-format.md). The live preview passes `false` so colours show.
 * Animation/Bild template artwork ignores this flag entirely and always
 * draws in its true colours, since it always travels as `pal4` instead —
 * see render/wire.ts.
 *
 * Returns null where no 2D context is available (jsdom without the optional
 * `canvas` package); callers degrade rather than throw.
 */
export function drawContentToCanvas(
	content: Content,
	canvasSize: { widthPx: number; heightPx: number },
	monochrome: boolean,
): HTMLCanvasElement | null {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(canvasSize.widthPx));
	canvas.height = Math.max(1, Math.round(canvasSize.heightPx));
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}

	if (content.type === "color") {
		ctx.fillStyle = monochrome ? "#ffffff" : content.hex;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		return canvas;
	}

	if (content.type === "animation") {
		// "Cover" sizing: scale uniformly by the *larger* composite dimension
		// so a multi-screen composite gets filled/spanned rather than fitting
		// a single-screen-sized icon into whichever axis is narrower (which
		// left it stranded at the seam between screens — see CONTEXT.md
		// "Content"). Matches the already-established "scaling beyond the
		// canvas crops" behavior for the smaller axis.
		const size =
			Math.max(canvas.width, canvas.height) * (content.scalePercent / 100);
		drawTemplateIcon(ctx, content.templateId, {
			x: alignOffset(content.hAlign, canvas.width, size),
			y: alignOffset(content.vAlign, canvas.height, size),
			size,
		});
		return canvas;
	}

	ctx.fillStyle = "#ffffff";
	ctx.font = `${content.fontWeight} ${content.fontSizePx}px ${content.fontFamily}`;

	if (content.mode === "static") {
		drawStaticText(ctx, {
			value: content.value,
			widthPx: canvas.width,
			heightPx: canvas.height,
			fontSizePx: content.fontSizePx,
			hAlign: content.hAlign,
			vAlign: content.vAlign,
		});
	} else {
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		const y =
			alignOffset(content.vAlign, canvas.height, content.fontSizePx) +
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
	},
) {
	const { value, widthPx, heightPx, fontSizePx, hAlign, vAlign } = options;
	const lines = value.split("\n");
	const lineHeight = fontSizePx * 1.2;
	const blockHeight = lines.length * lineHeight;
	const blockTop = alignOffset(vAlign, heightPx, blockHeight);

	ctx.textAlign = hAlign;
	ctx.textBaseline = "middle";
	const x = alignOffset(hAlign, widthPx, 0);

	lines.forEach((line, i) => {
		ctx.fillText(line, x, blockTop + i * lineHeight + lineHeight / 2);
	});
}
