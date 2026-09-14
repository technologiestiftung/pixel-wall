import type { Content } from "../domain/types";

/** Same geometry as render/TemplateIcon.tsx, kept in sync with the Figma
 * source — see that file's comment. Each icon's own viewBox size is used
 * to compute its scale (they aren't all drawn on a uniform grid). */
const ICONS: Record<string, { viewBox: number; draw: (ctx: CanvasRenderingContext2D) => void }> = {
	pfeil: {
		viewBox: 27.8,
		draw: (ctx) => {
			ctx.lineWidth = 1.6;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.stroke(new Path2D("M3 16H25M16.75 27L25 16L16.75 5"));
		},
	},
	baer: {
		viewBox: 22,
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
		viewBox: 25.8,
		draw: (ctx) => {
			ctx.lineWidth = 1.6;
			ctx.lineJoin = "round";
			ctx.stroke(new Path2D("M14 3L25 14L14 25L3 14L14 3Z"));
		},
	},
	herz: {
		viewBox: 25,
		draw: (ctx) => {
			ctx.fill(
				new Path2D(
					"M14 25C14 25 3 16.9333 3 9.74667C3 5.64 6.025 3 9.325 3C11.6625 3 13.3125 4.46667 14 6.22667C14.6875 4.46667 16.3375 3 18.675 3C21.975 3 25 5.64 25 9.74667C25 16.9333 14 25 14 25Z",
				),
			);
		},
	},
	stern: {
		viewBox: 24.92,
		draw: (ctx) => {
			ctx.fill(
				new Path2D(
					"M13.92 2.5L16.8061 10.4961L24.92 10.8966L18.5759 16.2464L20.7269 24.5L13.92 19.8082L7.11307 24.5L9.26406 16.2464L2.92 10.8966L11.0339 10.4961L13.92 2.5Z",
				),
			);
		},
	},
	sonne: {
		viewBox: 23.7,
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
	ctx.save();
	ctx.translate(box.x, box.y);
	const scale = box.size / icon.viewBox;
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
export function rasterizeContent(content: Content, widthPx: number, heightPx: number): string {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(widthPx));
	canvas.height = Math.max(1, Math.round(heightPx));
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return "";
	}

	if (content.type === "color") {
		ctx.fillStyle = content.hex;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/png");
	}

	if (content.type === "animation") {
		const size = Math.min(canvas.width, canvas.height) * (content.scalePercent / 100);
		drawTemplateIcon(ctx, content.templateId, {
			x: (canvas.width - size) / 2,
			y: (canvas.height - size) / 2,
			size,
		});
		return canvas.toDataURL("image/png");
	}

	ctx.fillStyle = "#ffffff";
	ctx.font = `${content.fontWeight} ${content.fontSizePx}px ${content.fontFamily}`;
	ctx.textBaseline = "middle";
	if (content.mode === "static") {
		ctx.textAlign = "center";
		ctx.fillText(content.value, canvas.width / 2, canvas.height / 2);
	} else {
		ctx.textAlign = "left";
		ctx.fillText(content.value, 0, canvas.height / 2);
	}
	return canvas.toDataURL("image/png");
}
