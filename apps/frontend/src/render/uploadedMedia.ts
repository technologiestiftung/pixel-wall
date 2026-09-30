import { ANIMATION_FPS } from "../domain/content";
import type { UploadedMedia } from "../domain/types";

/** The largest composite is a few 64px panels across, so anything bigger is
 * wasted bytes in the stored `source` and the apply request. */
const MAX_EDGE_PX = 128;
/** 8s at ANIMATION_FPS — the same length as the longest built-in template,
 * which keeps a 128px-wide strip inside the backend's bitmap width limit. */
export const MAX_UPLOAD_FRAMES = 128;
const DEFAULT_FRAME_DURATION_MS = 100;

export const ACCEPTED_UPLOAD_TYPES =
	"image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/apng";

type DrawableSource = Parameters<CanvasRenderingContext2D["drawImage"]>[0];

// WebCodecs' ImageDecoder isn't in TypeScript's DOM lib yet (it ships in
// fewer than two engines), so only the slice used here is declared.
interface DecodedFrame {
	image: DrawableSource & {
		displayWidth: number;
		displayHeight: number;
		duration: number | null;
		close(): void;
	};
}
interface ImageDecoderLike {
	tracks: {
		ready: Promise<void>;
		selectedTrack: { frameCount: number } | null;
	};
	completed: Promise<void>;
	decode(options: { frameIndex: number }): Promise<DecodedFrame>;
	close(): void;
}
interface ImageDecoderConstructor {
	new (init: {
		data: ReadableStream<Uint8Array>;
		type: string;
	}): ImageDecoderLike;
	isTypeSupported(type: string): Promise<boolean>;
}

interface SourceFrame {
	canvas: HTMLCanvasElement;
	durationMs: number;
}

/**
 * Turns a user-chosen file into an `UploadedMedia`: every frame decoded,
 * downscaled to at most MAX_EDGE_PX, resampled to ANIMATION_FPS (the rate
 * the wire's `frames` steps at — GIF frame delays vary per frame, the wire's
 * don't) and packed into one PNG sprite sheet. Animations longer than
 * MAX_UPLOAD_FRAMES are cut off rather than sped up.
 */
export async function decodeUpload(file: File): Promise<UploadedMedia> {
	const sourceFrames = (await decodeAnimatedFrames(file)) ?? [
		await decodeStillFrame(file),
	];
	const { frames, frameDurationMs } = resample(sourceFrames);
	const { width: frameWidthPx, height: frameHeightPx } = frames[0];
	const columns = Math.ceil(Math.sqrt(frames.length));
	const rows = Math.ceil(frames.length / columns);

	const sheet = document.createElement("canvas");
	sheet.width = frameWidthPx * columns;
	sheet.height = frameHeightPx * rows;
	const ctx = sheet.getContext("2d");
	if (!ctx) {
		throw new Error("Canvas wird von diesem Browser nicht unterstützt.");
	}
	frames.forEach((frame, i) => {
		ctx.drawImage(
			frame,
			(i % columns) * frameWidthPx,
			Math.floor(i / columns) * frameHeightPx,
		);
	});

	return {
		name: file.name,
		sheetDataUrl: sheet.toDataURL("image/png"),
		frameWidthPx,
		frameHeightPx,
		frameCount: frames.length,
		columns,
		frameDurationMs,
	};
}

async function decodeAnimatedFrames(file: File): Promise<SourceFrame[] | null> {
	const Decoder = (globalThis as { ImageDecoder?: ImageDecoderConstructor })
		.ImageDecoder;
	if (!Decoder || !(await Decoder.isTypeSupported(file.type))) {
		return null;
	}

	const decoder = new Decoder({ data: file.stream(), type: file.type });
	try {
		await decoder.tracks.ready;
		await decoder.completed;
		const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
		if (frameCount <= 1) {
			return null;
		}

		const frames: SourceFrame[] = [];
		let totalMs = 0;
		for (let i = 0; i < frameCount; i++) {
			const { image } = await decoder.decode({ frameIndex: i });
			const durationMs =
				image.duration !== null && image.duration > 0
					? image.duration / 1000
					: DEFAULT_FRAME_DURATION_MS;
			frames.push({
				canvas: downscale(image, image.displayWidth, image.displayHeight),
				durationMs,
			});
			image.close();
			totalMs += durationMs;
			if (totalMs >= (MAX_UPLOAD_FRAMES * 1000) / ANIMATION_FPS) {
				break;
			}
		}
		return frames;
	} finally {
		decoder.close();
	}
}

async function decodeStillFrame(file: File): Promise<SourceFrame> {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode().catch(() => {
			throw new Error("Die Datei konnte nicht als Bild gelesen werden.");
		});
		// SVGs without explicit width/height report 0 — give them the full
		// budget instead, since they scale losslessly anyway.
		const width = img.naturalWidth || MAX_EDGE_PX;
		const height = img.naturalHeight || MAX_EDGE_PX;
		return {
			canvas: downscale(img, width, height),
			durationMs: DEFAULT_FRAME_DURATION_MS,
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

function downscale(
	source: DrawableSource,
	width: number,
	height: number,
): HTMLCanvasElement {
	const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const ctx = canvas.getContext("2d");
	if (ctx) {
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	}
	return canvas;
}

/** Picks, for each evenly-spaced output tick, whichever source frame was on
 * screen at that moment. The step is stretched slightly so the loop length
 * divides evenly, keeping the loop seam exact. */
function resample(sourceFrames: SourceFrame[]): {
	frames: HTMLCanvasElement[];
	frameDurationMs: number;
} {
	if (sourceFrames.length === 1) {
		return {
			frames: [sourceFrames[0].canvas],
			frameDurationMs: DEFAULT_FRAME_DURATION_MS,
		};
	}

	const totalMs = sourceFrames.reduce((sum, f) => sum + f.durationMs, 0);
	const tickCount = Math.max(1, Math.round((totalMs / 1000) * ANIMATION_FPS));
	const frameDurationMs = totalMs / tickCount;
	const frames: HTMLCanvasElement[] = [];
	let source = 0;
	let sourceEndMs = sourceFrames[0].durationMs;
	for (let tick = 0; tick < Math.min(tickCount, MAX_UPLOAD_FRAMES); tick++) {
		const t = tick * frameDurationMs;
		while (t >= sourceEndMs && source < sourceFrames.length - 1) {
			source += 1;
			sourceEndMs += sourceFrames[source].durationMs;
		}
		frames.push(sourceFrames[source].canvas);
	}
	return { frames, frameDurationMs };
}
