import type { Content, HorizontalAlign, VerticalAlign } from "../domain/types";

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

interface IconBBox {
	x0: number;
	y0: number;
	width: number;
	height: number;
}

/**
 * Same path geometry as render/TemplateIcon.tsx, kept in sync with the
 * Figma source. `bbox` is the glyph's *tight* drawn bounding box, not its
 * nominal Figma viewBox — several of these (pfeil especially) have
 * significant uneven padding baked into their original viewBox (e.g.
 * pfeil's glyph sits at x:[3,25] in a 0–27.8 box), so scaling/centering
 * against the viewBox left them visibly off-center. Centering against the
 * tight bbox instead makes the visible glyph itself centered.
 */
const ICONS: Record<
	string,
	{ bbox: IconBBox; draw: (ctx: CanvasRenderingContext2D) => void }
> = {
	pfeil: {
		bbox: { x0: 3, y0: 5, width: 22, height: 22 },
		draw: (ctx) => {
			ctx.lineWidth = 1.6;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.stroke(new Path2D("M3 16H25M16.75 27L25 16L16.75 5"));
		},
	},
	baer: {
		bbox: { x0: 3.7, y0: 3.2, width: 14.6, height: 16.8 },
		draw: (ctx) => {
			ctx.lineWidth = 1.5;
			ctx.stroke(
				new Path2D(
					"M11 7.75C14.2333 7.75 16.75 10.1559 16.75 13C16.75 15.8441 14.2333 18.25 11 18.25C7.76671 18.25 5.25 15.8441 5.25 13C5.25 10.1559 7.76671 7.75 11 7.75Z",
				),
			);
			ctx.lineWidth = 1.4;
			for (const [cx, cy] of [
				[5.5, 5],
				[16.5, 5],
			]) {
				ctx.beginPath();
				ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.ellipse(11, 14.3, 1, 0.8, 0, 0, Math.PI * 2);
			ctx.fill();
		},
	},
	raute: {
		bbox: { x0: 3, y0: 3, width: 22, height: 22 },
		draw: (ctx) => {
			ctx.lineWidth = 1.6;
			ctx.lineJoin = "round";
			ctx.stroke(new Path2D("M14 3L25 14L14 25L3 14L14 3Z"));
		},
	},
	herz: {
		bbox: { x0: 3, y0: 3, width: 22, height: 22 },
		draw: (ctx) => {
			ctx.fill(
				new Path2D(
					"M14 25C14 25 3 16.9333 3 9.74667C3 5.64 6.025 3 9.325 3C11.6625 3 13.3125 4.46667 14 6.22667C14.6875 4.46667 16.3375 3 18.675 3C21.975 3 25 5.64 25 9.74667C25 16.9333 14 25 14 25Z",
				),
			);
		},
	},
	stern: {
		bbox: { x0: 2.92, y0: 2.5, width: 22, height: 22 },
		draw: (ctx) => {
			ctx.fill(
				new Path2D(
					"M13.92 2.5L16.8061 10.4961L24.92 10.8966L18.5759 16.2464L20.7269 24.5L13.92 19.8082L7.11307 24.5L9.26406 16.2464L2.92 10.8966L11.0339 10.4961L13.92 2.5Z",
				),
			);
		},
	},
	sonne: {
		bbox: { x0: 1, y0: 1, width: 22, height: 22 },
		draw: (ctx) => {
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(11, 11, 3.75, 0, Math.PI * 2);
			ctx.stroke();
			ctx.lineWidth = 1.4;
			ctx.lineCap = "round";
			ctx.stroke(
				new Path2D(
					"M12 1V3.42M12 20.58V23M1 12H3.42M20.58 12H23M4.52 4.52L6.28 6.28M17.72 17.72L19.48 19.48M4.52 19.48L6.28 17.72M19.48 4.52L17.72 6.28",
				),
			);
		},
	},
};

function drawTemplateIcon(
	ctx: CanvasRenderingContext2D,
	templateId: string,
	box: { x: number; y: number; size: number },
) {
	const icon = ICONS[templateId] ?? ICONS.pfeil;
	const scale = box.size / Math.max(icon.bbox.width, icon.bbox.height);
	ctx.save();
	// Shift so the glyph's own tight bbox (not the raw path's 0,0 origin)
	// lands exactly at box.x/box.y — this is what makes centering land on
	// the visible glyph instead of the uneven padding in its source viewBox.
	ctx.translate(box.x - icon.bbox.x0 * scale, box.y - icon.bbox.y0 * scale);
	ctx.scale(scale, scale);
	ctx.fillStyle = "#ffffff";
	ctx.strokeStyle = "#ffffff";
	icon.draw(ctx);
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
 * Renders `content` onto a device-pixel canvas. `monochrome` draws everything
 * in white regardless of the content's own colour, which is what the `mask1`
 * wire format needs — it carries one colour alongside a 1-bit coverage mask,
 * so the colour must not be baked into the pixels (see docs/wire-format.md).
 * The live preview passes `false` so colours show.
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
