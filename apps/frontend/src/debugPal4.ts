/**
 * Standalone debug page (debug-pal4.html) — not part of the app, not linked
 * from anywhere in the UI. Lets you compare the live editor preview (true
 * colour, never quantized) against the actual pal4 payload a pixel screen
 * would receive, for any template/background/line-colour combination,
 * without needing the physical hardware. See the low-contrast bug writeup
 * for why these two can diverge: the preview draws a canvas directly, the
 * wire payload additionally runs it through pal4FromImageData's palette
 * quantizer, which — in `crisp` mode, used for animated templates — can fold
 * a genuinely distinct but low-contrast colour into a neighbouring palette
 * entry instead of giving it its own slot.
 */
import { TEMPLATES, lineColorFor } from "./domain/content";
import type { AnimationContent } from "./domain/types";
import {
	animationTiming,
	renderAnimationFrameStrip,
} from "./render/animatedTemplate";
import { drawContentToCanvas } from "./render/rasterize";
import { waitForTemplateImage } from "./render/templateImages";
import { contentToWire, compositeWidthOf } from "./render/wire";
import { decodeBlock, pal4FromImageData, type Palette4 } from "./domain/mask";
import { base64ToBytes } from "./lib/base64";

const templateSelect = byId<HTMLSelectElement>("template");
const sizeSelect = byId<HTMLSelectElement>("size");
const bgColor = byId<HTMLInputElement>("bgColor");
const bgHex = byId<HTMLInputElement>("bgHex");
const lineColorInput = byId<HTMLInputElement>("lineColor");
const lineHex = byId<HTMLInputElement>("lineHex");
const lineField = byId<HTMLDivElement>("lineField");
const mergeDistanceInput = byId<HTMLInputElement>("mergeDistance");
const statusEl = byId<HTMLSpanElement>("status");
const distanceReadout = byId<HTMLDivElement>("distanceReadout");

const trueCanvas = byId<HTMLCanvasElement>("trueCanvas");
const wireCanvas = byId<HTMLCanvasElement>("wireCanvas");
const customCanvas = byId<HTMLCanvasElement>("customCanvas");
const wireSwatches = byId<HTMLDivElement>("wireSwatches");
const customSwatches = byId<HTMLDivElement>("customSwatches");

function byId<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error(`Missing #${id}`);
	}
	return el as T;
}

for (const template of TEMPLATES) {
	const option = document.createElement("option");
	option.value = template.id;
	option.textContent = `${template.id}${template.animated ? " (animiert)" : ""}${template.lineArt ? " · lineArt" : ""}`;
	templateSelect.append(option);
}
templateSelect.value = "welle";

// Keep each colour's swatch/hex pair in sync both ways.
function linkColorInputs(swatch: HTMLInputElement, hex: HTMLInputElement) {
	swatch.addEventListener("input", () => {
		hex.value = swatch.value;
		regenerate();
	});
	hex.addEventListener("change", () => {
		if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
			swatch.value = hex.value;
			regenerate();
		}
	});
}
linkColorInputs(bgColor, bgHex);
linkColorInputs(lineColorInput, lineHex);

for (const control of [templateSelect, sizeSelect, mergeDistanceInput]) {
	control.addEventListener("change", regenerate);
}

const presets: Record<
	string,
	{ template: string; background: string; line: string }
> = {
	lowContrastBug: {
		template: "welle",
		background: "#1e3791",
		line: "#2c4596",
	},
	highContrast: { template: "welle", background: "#000000", line: "#ffffff" },
	boundary: { template: "welle", background: "#1e3791", line: "#304a9e" },
};

document.querySelectorAll<HTMLButtonElement>("button.preset").forEach((btn) => {
	btn.addEventListener("click", () => {
		const preset = presets[btn.dataset.preset ?? ""];
		if (!preset) {
			return;
		}
		templateSelect.value = preset.template;
		bgHex.value = preset.background;
		bgColor.value = preset.background;
		lineHex.value = preset.line;
		lineColorInput.value = preset.line;
		regenerate();
	});
});

function currentTemplate() {
	return (
		TEMPLATES.find((t) => t.id === templateSelect.value) ?? TEMPLATES[0]
	);
}

function buildContent(): AnimationContent {
	const template = currentTemplate();
	return {
		type: "animation",
		mode: "template",
		templateId: template.id,
		scalePercent: 100,
		hAlign: "center",
		vAlign: "center",
		lineColor: template.lineArt ? lineHex.value : undefined,
	};
}

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]) {
	return Math.sqrt(
		(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
	);
}

function renderSwatches(container: HTMLDivElement, image: Palette4) {
	const counts = new Map<number, number>();
	for (const index of image.indices) {
		counts.set(index, (counts.get(index) ?? 0) + 1);
	}
	const total = image.indices.length;
	container.innerHTML = "";
	image.palette.forEach(([r, g, b], index) => {
		const count = counts.get(index) ?? 0;
		const pct = total > 0 ? ((100 * count) / total).toFixed(1) : "0.0";
		const row = document.createElement("div");
		row.className = "swatch";
		const chip = document.createElement("span");
		chip.className = "chip";
		chip.style.background = `rgb(${r},${g},${b})`;
		row.append(chip);
		const label = document.createElement("span");
		label.textContent = `#${index} rgb(${r},${g},${b}) · ${pct}%`;
		row.append(label);
		container.append(row);
	});
}

/** Paints a decoded pal4/mask1 block onto a same-size canvas, index 0 (or a
 * clear mask bit) as solid black — exactly how an unlit LED looks, matching
 * wireToDataUrl's convention but opaque so it's visible on any page
 * background, not just one that happens to already be black. */
function paintDecodedFrame(
	canvas: HTMLCanvasElement,
	decoded: ReturnType<typeof decodeBlock>,
	frameWidthPx: number,
	heightPx: number,
	color: [number, number, number],
) {
	canvas.width = frameWidthPx;
	canvas.height = heightPx;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	const image = ctx.createImageData(frameWidthPx, heightPx);
	for (let y = 0; y < heightPx; y++) {
		for (let x = 0; x < frameWidthPx; x++) {
			const target = (y * frameWidthPx + x) * 4;
			image.data[target + 3] = 255;
			if (decoded.format === "pal4") {
				const index = decoded.image.indices[y * decoded.image.widthPx + x];
				if (index === 0) {
					continue;
				}
				const [r, g, b] = decoded.image.palette[index] ?? color;
				image.data[target] = r;
				image.data[target + 1] = g;
				image.data[target + 2] = b;
			} else {
				const stride = Math.ceil(decoded.mask.widthPx / 8);
				const bitSet =
					(decoded.mask.bits[y * stride + (x >> 3)] & (0x80 >> (x & 7))) !==
					0;
				if (!bitSet) {
					continue;
				}
				image.data[target] = color[0];
				image.data[target + 1] = color[1];
				image.data[target + 2] = color[2];
			}
		}
	}
	ctx.putImageData(image, 0, 0);
}

let animationHandle = 0;
let currentFrameWidthPx = 64;
let currentFrameCount = 1;
let currentFrameDurationMs = 1000;
let trueStrip: HTMLCanvasElement | null = null;
let wirePalette: Palette4 | null = null;
let wireStripCanvas: HTMLCanvasElement | null = null;
let customPalette: Palette4 | null = null;
let customStripCanvas: HTMLCanvasElement | null = null;
let stripStartMs = performance.now();

function drawFrame(timestampMs: number) {
	const elapsed = timestampMs - stripStartMs;
	const frameIndex =
		currentFrameCount > 0
			? Math.floor(elapsed / currentFrameDurationMs) % currentFrameCount
			: 0;
	const slotX = frameIndex * currentFrameWidthPx;

	if (trueStrip) {
		trueCanvas.width = currentFrameWidthPx;
		trueCanvas.height = trueStrip.height;
		const ctx = trueCanvas.getContext("2d");
		ctx?.clearRect(0, 0, trueCanvas.width, trueCanvas.height);
		ctx?.drawImage(
			trueStrip,
			slotX,
			0,
			currentFrameWidthPx,
			trueStrip.height,
			0,
			0,
			currentFrameWidthPx,
			trueStrip.height,
		);
	}
	if (wireStripCanvas) {
		const ctx = wireCanvas.getContext("2d");
		wireCanvas.width = currentFrameWidthPx;
		wireCanvas.height = wireStripCanvas.height;
		ctx?.clearRect(0, 0, wireCanvas.width, wireCanvas.height);
		ctx?.drawImage(
			wireStripCanvas,
			slotX,
			0,
			currentFrameWidthPx,
			wireStripCanvas.height,
			0,
			0,
			currentFrameWidthPx,
			wireStripCanvas.height,
		);
	}
	if (customStripCanvas) {
		const ctx = customCanvas.getContext("2d");
		customCanvas.width = currentFrameWidthPx;
		customCanvas.height = customStripCanvas.height;
		ctx?.clearRect(0, 0, customCanvas.width, customCanvas.height);
		ctx?.drawImage(
			customStripCanvas,
			slotX,
			0,
			currentFrameWidthPx,
			customStripCanvas.height,
			0,
			0,
			currentFrameWidthPx,
			customStripCanvas.height,
		);
	}
	animationHandle = requestAnimationFrame(drawFrame);
}

async function regenerate() {
	cancelAnimationFrame(animationHandle);
	statusEl.textContent = "rendere…";

	const template = currentTemplate();
	lineField.style.display = template.lineArt ? "flex" : "none";

	const size = Number(sizeSelect.value);
	const background = bgHex.value;
	const mergeDistance = Number(mergeDistanceInput.value);
	const content = buildContent();

	const timing = animationTiming(content);
	const frameCount = timing?.frameCount ?? 1;
	const frameDurationMs = timing?.frameDurationMs ?? 1000;

	// True-colour side: the exact function the live editor preview uses.
	if (timing) {
		trueStrip = await renderAnimationFrameStrip(
			content,
			{ widthPx: size, heightPx: size },
			{ frameCount, background },
		);
	} else {
		await waitForTemplateImage(content.templateId, lineColorFor(content));
		trueStrip = drawContentToCanvas(
			content,
			{ widthPx: size, heightPx: size },
			{ background },
		);
	}

	// Production wire payload: exactly what contentToWire would send.
	const wire = await contentToWire(
		content,
		{ widthPx: size, heightPx: size },
		{ background },
	);
	if (wire.format === "gameOfLife") {
		statusEl.textContent = "kein Bitmap für gameOfLife";
		return;
	}
	const decodedWire = decodeBlock(base64ToBytes(wire.data));
	wirePalette = decodedWire.format === "pal4" ? decodedWire.image : null;
	const frameWidthPx = compositeWidthOf(wire);
	wireStripCanvas = document.createElement("canvas");
	paintDecodedFrame(
		wireStripCanvas,
		decodedWire,
		wire.widthPx,
		wire.heightPx,
		wire.color ?? [255, 255, 255],
	);
	if (wirePalette) {
		renderSwatches(wireSwatches, wirePalette);
	} else {
		wireSwatches.innerHTML = "";
	}

	// Same quantizer, user-chosen merge radius — re-run directly against the
	// same pixels the production path drew, so a fixed threshold can be
	// compared against the live one above without re-deriving the artwork.
	const sourceCanvas = trueStrip;
	if (sourceCanvas) {
		const ctx = sourceCanvas.getContext("2d");
		if (ctx) {
			const data = ctx.getImageData(
				0,
				0,
				sourceCanvas.width,
				sourceCanvas.height,
			).data;
			customPalette = pal4FromImageData(data, {
				widthPx: sourceCanvas.width,
				heightPx: sourceCanvas.height,
				crisp: timing !== null,
				crispMergeDistance: mergeDistance,
				background: hexToRgb(background),
			});
			customStripCanvas = document.createElement("canvas");
			paintDecodedFrame(
				customStripCanvas,
				{ format: "pal4", image: customPalette },
				sourceCanvas.width,
				sourceCanvas.height,
				[255, 255, 255],
			);
			renderSwatches(customSwatches, customPalette);
		}
	}

	currentFrameWidthPx = frameWidthPx;
	currentFrameCount = frameCount;
	currentFrameDurationMs = frameDurationMs;
	stripStartMs = performance.now();
	animationHandle = requestAnimationFrame(drawFrame);

	if (template.lineArt) {
		const bg = hexToRgb(background);
		const line = hexToRgb(lineHex.value);
		const distance = rgbDistance(bg, line);
		const merged =
			wirePalette !== null &&
			!wirePalette.palette.some(
				([r, g, b]) => r === line[0] && g === line[1] && b === line[2],
			);
		distanceReadout.innerHTML =
			`RGB-Abstand Hintergrund↔Linie: <b>${distance.toFixed(1)}</b> ` +
			(merged
				? `<span class="merged">— im Standard-Pal4 verschmolzen: die Linienfarbe hat keinen eigenen Paletteneintrag mehr.</span>`
				: `<span class="ok">— bleibt im Standard-Pal4 ein eigener Paletteneintrag.</span>`);
	} else {
		distanceReadout.textContent =
			"Dieses Template hat keine wählbare Linienfarbe.";
	}

	statusEl.textContent = `fertig · ${frameCount} Frame(s) · Fenster ${currentFrameWidthPx}×${size}px`;
}

regenerate();
