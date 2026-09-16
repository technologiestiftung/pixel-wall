/**
 * Encoders for the `mask1` and `pal4` payloads — see docs/wire-format.md,
 * which is the normative spec. The shared test vectors in
 * docs/wire-format-fixtures.json are what keep this, the Python decoder and
 * the C++ decoder in agreement.
 */

const MAGIC = 0x50;
const PAL4_MAGIC = 0x51;
const PAL4_HEADER_BYTES = 8;
export const PAL4_MAX_COLORS = 16;
const VERSION = 0x01;
const HEADER_BYTES = 7;

export const ENCODING_RAW = 0x00;
export const ENCODING_RLE = 0x01;

export interface Mask {
	widthPx: number;
	heightPx: number;
	/** Packed rows, MSB = leftmost pixel, each row padded to `strideFor(widthPx)` bytes. */
	bits: Uint8Array;
}

export function strideFor(widthPx: number): number {
	return Math.ceil(widthPx / 8);
}

export function createMask(widthPx: number, heightPx: number): Mask {
	return {
		widthPx,
		heightPx,
		bits: new Uint8Array(strideFor(widthPx) * heightPx),
	};
}

export function getBit(mask: Mask, x: number, y: number): boolean {
	const index = y * strideFor(mask.widthPx) + (x >> 3);
	return (mask.bits[index] & (0x80 >> (x & 7))) !== 0;
}

export function setBit(mask: Mask, x: number, y: number): void {
	const index = y * strideFor(mask.widthPx) + (x >> 3);
	mask.bits[index] |= 0x80 >> (x & 7);
}

/**
 * Builds a mask from canvas `ImageData`. All v1 content is drawn as opaque
 * white on a transparent canvas (see render/rasterize.ts), so alpha alone
 * decides coverage — a pixel is set when it is at least half opaque.
 */
export function maskFromImageData(
	data: Uint8ClampedArray,
	options: { widthPx: number; heightPx: number; alphaThreshold?: number },
): Mask {
	const { widthPx, heightPx, alphaThreshold = 128 } = options;
	const mask = createMask(widthPx, heightPx);
	for (let y = 0; y < heightPx; y++) {
		for (let x = 0; x < widthPx; x++) {
			if (data[(y * widthPx + x) * 4 + 3] >= alphaThreshold) {
				setBit(mask, x, y);
			}
		}
	}
	return mask;
}

export function maskFromRows(rows: string[]): Mask {
	const heightPx = rows.length;
	const widthPx = heightPx === 0 ? 0 : rows[0].length;
	const mask = createMask(widthPx, heightPx);
	rows.forEach((row, y) => {
		if (row.length !== widthPx) {
			throw new Error(
				`Ragged mask rows: expected ${widthPx}, got ${row.length}`,
			);
		}
		for (let x = 0; x < widthPx; x++) {
			if (row[x] === "#") {
				setBit(mask, x, y);
			}
		}
	});
	return mask;
}

export function maskToRows(mask: Mask): string[] {
	const rows: string[] = [];
	for (let y = 0; y < mask.heightPx; y++) {
		let row = "";
		for (let x = 0; x < mask.widthPx; x++) {
			row += getBit(mask, x, y) ? "#" : ".";
		}
		rows.push(row);
	}
	return rows;
}

function header(encoding: number, widthPx: number, heightPx: number): number[] {
	return [
		MAGIC,
		VERSION,
		encoding,
		(widthPx >> 8) & 0xff,
		widthPx & 0xff,
		(heightPx >> 8) & 0xff,
		heightPx & 0xff,
	];
}

function appendLeb128(out: number[], value: number): void {
	let remaining = value;
	for (;;) {
		const septet = remaining & 0x7f;
		remaining >>>= 7;
		if (remaining === 0) {
			out.push(septet);
			return;
		}
		out.push(septet | 0x80);
	}
}

/** Run lengths over the whole padded bit stream, alternating, clear bits first. */
function rleBody(mask: Mask): number[] {
	const body: number[] = [];
	const totalBits = mask.bits.length * 8;
	let expected = 0;
	let index = 0;

	while (index < totalBits) {
		let run = 0;
		while (index < totalBits) {
			const byte = mask.bits[index >> 3];
			// Whole-byte fast path: text masks are overwhelmingly runs of
			// clear bytes, and stepping them one bit at a time makes a wide
			// Lauftext filmstrip needlessly slow to encode.
			if ((index & 7) === 0 && (byte === 0x00 || byte === 0xff)) {
				const byteValue = byte === 0x00 ? 0 : 1;
				if (byteValue !== expected) {
					break;
				}
				run += 8;
				index += 8;
				continue;
			}
			const bit = (byte >> (7 - (index & 7))) & 1;
			if (bit !== expected) {
				break;
			}
			run += 1;
			index += 1;
		}
		body.push(run);
		expected ^= 1;
	}

	const out: number[] = [];
	for (const run of body) {
		appendLeb128(out, run);
	}
	return out;
}

/**
 * Emits whichever of the two encodings is smaller, so a payload is never
 * larger than the raw form — see docs/wire-format.md "encoding = 0x01".
 */
export function encodeMaskBlock(mask: Mask): Uint8Array {
	const expectedBytes = strideFor(mask.widthPx) * mask.heightPx;
	if (mask.bits.length !== expectedBytes) {
		throw new Error(
			`Mask buffer is ${mask.bits.length} bytes, expected ${expectedBytes}`,
		);
	}

	const raw = [
		...header(ENCODING_RAW, mask.widthPx, mask.heightPx),
		...mask.bits,
	];
	const rle = [
		...header(ENCODING_RLE, mask.widthPx, mask.heightPx),
		...rleBody(mask),
	];

	return Uint8Array.from(rle.length < raw.length ? rle : raw);
}

export function decodeMaskBlock(block: Uint8Array): Mask {
	if (block.length < HEADER_BYTES) {
		throw new Error(
			`Mask block is ${block.length} bytes, too short for a header`,
		);
	}
	if (block[0] !== MAGIC || block[1] !== VERSION) {
		throw new Error(`Unexpected mask magic/version: ${block[0]}/${block[1]}`);
	}

	const encoding = block[2];
	const widthPx = (block[3] << 8) | block[4];
	const heightPx = (block[5] << 8) | block[6];
	const mask = createMask(widthPx, heightPx);
	const body = block.subarray(HEADER_BYTES);

	if (encoding === ENCODING_RAW) {
		if (body.length !== mask.bits.length) {
			throw new Error(
				`Raw body is ${body.length} bytes, expected ${mask.bits.length}`,
			);
		}
		mask.bits.set(body);
		return mask;
	}

	if (encoding !== ENCODING_RLE) {
		throw new Error(`Unknown mask encoding: ${encoding}`);
	}

	const totalBits = mask.bits.length * 8;
	let bitIndex = 0;
	let value = 0;
	let cursor = 0;

	while (cursor < body.length) {
		let run = 0;
		let shift = 0;
		for (;;) {
			if (cursor >= body.length) {
				throw new Error("Truncated varint in mask RLE body");
			}
			const byte = body[cursor++];
			run |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				break;
			}
			shift += 7;
		}

		if (bitIndex + run > totalBits) {
			throw new Error("Mask RLE runs overflow the declared size");
		}
		if (value === 1) {
			for (let i = 0; i < run; i++) {
				const index = bitIndex + i;
				mask.bits[index >> 3] |= 0x80 >> (index & 7);
			}
		}
		bitIndex += run;
		value ^= 1;
	}

	if (bitIndex !== totalBits) {
		throw new Error(`Mask RLE covers ${bitIndex} bits, expected ${totalBits}`);
	}
	return mask;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function encodeMaskBase64(mask: Mask): string {
	return bytesToBase64(encodeMaskBlock(mask));
}

export function decodeMaskBase64(encoded: string): Mask {
	return decodeMaskBlock(base64ToBytes(encoded));
}

export interface Palette4 {
	widthPx: number;
	heightPx: number;
	/** 1–16 entries of [r, g, b]. Index 0 is the background. */
	palette: number[][];
	/** One palette index per pixel, row-major, unpacked for ease of use. */
	indices: Uint8Array;
}

export function pal4StrideFor(widthPx: number): number {
	return Math.ceil(widthPx / 2);
}

export function pal4FromRows(rows: string[], palette: number[][]): Palette4 {
	const heightPx = rows.length;
	const widthPx = heightPx === 0 ? 0 : rows[0].length;
	const indices = new Uint8Array(widthPx * heightPx);
	rows.forEach((row, y) => {
		if (row.length !== widthPx) {
			throw new Error(
				`Ragged pal4 rows: expected ${widthPx}, got ${row.length}`,
			);
		}
		for (let x = 0; x < widthPx; x++) {
			const index = Number.parseInt(row[x], 16);
			if (Number.isNaN(index) || index >= palette.length) {
				throw new Error(`Pixel ${row[x]} is outside the palette`);
			}
			indices[y * widthPx + x] = index;
		}
	});
	return { widthPx, heightPx, palette, indices };
}

export function pal4ToRows(image: Palette4): string[] {
	const rows: string[] = [];
	for (let y = 0; y < image.heightPx; y++) {
		let row = "";
		for (let x = 0; x < image.widthPx; x++) {
			row += image.indices[y * image.widthPx + x].toString(16);
		}
		rows.push(row);
	}
	return rows;
}

/**
 * Quantizes canvas `ImageData` into a `Palette4` image — the `pal4`
 * counterpart of `maskFromImageData` above, for real multi-colour template
 * artwork (see render/templateImages.ts and render/wire.ts). Index 0 is always
 * `[0, 0, 0]` (background/unlit, per docs/wire-format.md's "pal4 binary
 * block"), and every pixel is alpha-composited onto black before matching so
 * a) fully transparent pixels land exactly on index 0 and b) anti-aliased
 * edge pixels — which would otherwise mint a near-infinite number of
 * in-between colours and blow through the 16-colour cap — snap to whichever
 * existing palette entry (background included) they're closest to, rather
 * than each becoming its own colour.
 */
export function pal4FromImageData(
	data: Uint8ClampedArray,
	options: { widthPx: number; heightPx: number },
): Palette4 {
	const { widthPx, heightPx } = options;
	const pixelCount = widthPx * heightPx;

	// Only fully (or near-fully) opaque pixels vote for palette entries —
	// this keeps the palette itself built from the artwork's real colours
	// rather than the faint anti-aliased fringe around them.
	const SOLID_ALPHA_THRESHOLD = 250;
	const frequency = new Map<number, number>();
	for (let i = 0; i < pixelCount; i++) {
		const alpha = data[i * 4 + 3];
		if (alpha < SOLID_ALPHA_THRESHOLD) {
			continue;
		}
		const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
		frequency.set(key, (frequency.get(key) ?? 0) + 1);
	}

	// Solid black is already index 0 (the background), so it doesn't need
	// (and shouldn't waste) a second palette slot.
	frequency.delete(0);
	const byFrequencyDesc = [...frequency.entries()].sort((a, b) => b[1] - a[1]);
	const palette: number[][] = [[0, 0, 0]];
	for (const [key] of byFrequencyDesc) {
		if (palette.length >= PAL4_MAX_COLORS) {
			break;
		}
		palette.push([(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]);
	}

	const indices = new Uint8Array(pixelCount);
	for (let i = 0; i < pixelCount; i++) {
		const alpha = data[i * 4 + 3];
		// Premultiply by alpha (i.e. blend onto a black background) so a
		// half-covered edge pixel is judged by how it will actually look
		// next to unlit neighbours, not by the fully-saturated colour under
		// its fringe.
		const r = (data[i * 4] * alpha) / 255;
		const g = (data[i * 4 + 1] * alpha) / 255;
		const b = (data[i * 4 + 2] * alpha) / 255;

		let bestIndex = 0;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (let p = 0; p < palette.length; p++) {
			const [pr, pg, pb] = palette[p];
			const dr = r - pr;
			const dg = g - pg;
			const db = b - pb;
			const distance = dr * dr + dg * dg + db * db;
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = p;
			}
		}
		indices[i] = bestIndex;
	}

	return { widthPx, heightPx, palette, indices };
}

/** Packed rows including the index-0 padding nibble on odd widths. */
function pal4PackedRows(image: Palette4): Uint8Array {
	const stride = pal4StrideFor(image.widthPx);
	const packed = new Uint8Array(stride * image.heightPx);
	for (let y = 0; y < image.heightPx; y++) {
		for (let x = 0; x < image.widthPx; x++) {
			const value = image.indices[y * image.widthPx + x] & 0x0f;
			const target = y * stride + (x >> 1);
			packed[target] |= x % 2 === 0 ? value << 4 : value;
		}
	}
	return packed;
}

function pal4Header(encoding: number, image: Palette4): number[] {
	const out = [
		PAL4_MAGIC,
		VERSION,
		encoding,
		(image.widthPx >> 8) & 0xff,
		image.widthPx & 0xff,
		(image.heightPx >> 8) & 0xff,
		image.heightPx & 0xff,
		image.palette.length,
	];
	for (const [r, g, b] of image.palette) {
		out.push(r & 0xff, g & 0xff, b & 0xff);
	}
	return out;
}

/** Runs over the padded nibble stream; each run is an explicit index byte
 * plus a varint length, since 16 values cannot simply alternate. */
function pal4RleBody(packed: Uint8Array): number[] {
	const out: number[] = [];
	const totalNibbles = packed.length * 2;
	let index = 0;

	while (index < totalNibbles) {
		const nibbleAt = (i: number) =>
			i % 2 === 0 ? (packed[i >> 1] >> 4) & 0x0f : packed[i >> 1] & 0x0f;
		const value = nibbleAt(index);
		let run = 0;
		while (index < totalNibbles && nibbleAt(index) === value) {
			run += 1;
			index += 1;
		}
		out.push(value);
		appendLeb128(out, run);
	}
	return out;
}

export function encodePal4Block(image: Palette4): Uint8Array {
	if (image.palette.length < 1 || image.palette.length > PAL4_MAX_COLORS) {
		throw new Error(
			`pal4 palette has ${image.palette.length} entries, expected 1-${PAL4_MAX_COLORS}`,
		);
	}
	if (image.indices.length !== image.widthPx * image.heightPx) {
		throw new Error(
			`pal4 index buffer is ${image.indices.length}, expected ${image.widthPx * image.heightPx}`,
		);
	}

	const packed = pal4PackedRows(image);
	const raw = [...pal4Header(ENCODING_RAW, image), ...packed];
	const rle = [...pal4Header(ENCODING_RLE, image), ...pal4RleBody(packed)];
	return Uint8Array.from(rle.length < raw.length ? rle : raw);
}

function unpackPal4Rle(body: Uint8Array, packed: Uint8Array): void {
	const totalNibbles = packed.length * 2;
	let nibble = 0;
	let cursor = 0;

	while (cursor < body.length) {
		const value = body[cursor++];
		if (value > 0x0f) {
			throw new Error(`pal4 run value ${value} is not a nibble`);
		}

		let run = 0;
		let shift = 0;
		for (;;) {
			if (cursor >= body.length) {
				throw new Error("Truncated varint in pal4 RLE body");
			}
			const byte = body[cursor++];
			run |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				break;
			}
			shift += 7;
		}

		if (nibble + run > totalNibbles) {
			throw new Error("pal4 RLE runs overflow the declared size");
		}
		for (let i = 0; i < run; i++) {
			const target = nibble + i;
			packed[target >> 1] |= target % 2 === 0 ? value << 4 : value;
		}
		nibble += run;
	}

	if (nibble !== totalNibbles) {
		throw new Error(
			`pal4 RLE covers ${nibble} nibbles, expected ${totalNibbles}`,
		);
	}
}

export function decodePal4Block(block: Uint8Array): Palette4 {
	if (block.length < PAL4_HEADER_BYTES) {
		throw new Error(
			`pal4 block is ${block.length} bytes, too short for a header`,
		);
	}
	if (block[0] !== PAL4_MAGIC || block[1] !== VERSION) {
		throw new Error(`Unexpected pal4 magic/version: ${block[0]}/${block[1]}`);
	}

	const encoding = block[2];
	const widthPx = (block[3] << 8) | block[4];
	const heightPx = (block[5] << 8) | block[6];
	const paletteCount = block[7];
	if (paletteCount < 1 || paletteCount > PAL4_MAX_COLORS) {
		throw new Error(`pal4 paletteCount is ${paletteCount}, expected 1-16`);
	}

	const paletteEnd = PAL4_HEADER_BYTES + paletteCount * 3;
	if (block.length < paletteEnd) {
		throw new Error("Truncated pal4 palette");
	}
	const palette: number[][] = [];
	for (let i = PAL4_HEADER_BYTES; i < paletteEnd; i += 3) {
		palette.push([block[i], block[i + 1], block[i + 2]]);
	}

	const stride = pal4StrideFor(widthPx);
	const packed = new Uint8Array(stride * heightPx);
	const body = block.subarray(paletteEnd);

	if (encoding === ENCODING_RAW) {
		if (body.length !== packed.length) {
			throw new Error(
				`pal4 raw body is ${body.length} bytes, expected ${packed.length}`,
			);
		}
		packed.set(body);
	} else if (encoding === ENCODING_RLE) {
		unpackPal4Rle(body, packed);
	} else {
		throw new Error(`Unknown pal4 encoding: ${encoding}`);
	}

	const indices = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y++) {
		for (let x = 0; x < widthPx; x++) {
			const source = packed[y * stride + (x >> 1)];
			indices[y * widthPx + x] =
				x % 2 === 0 ? (source >> 4) & 0x0f : source & 0x0f;
		}
	}
	return { widthPx, heightPx, palette, indices };
}

export function encodePal4Base64(image: Palette4): string {
	return bytesToBase64(encodePal4Block(image));
}

export function decodePal4Base64(encoded: string): Palette4 {
	return decodePal4Block(base64ToBytes(encoded));
}

export type DecodedBlock =
	| { format: "mask1"; mask: Mask }
	| { format: "pal4"; image: Palette4 };

/** Dispatches on the block's own magic byte — this is how the MQTT envelope,
 * which carries no format field, knows what it is holding. */
export function decodeBlock(block: Uint8Array): DecodedBlock {
	if (block.length === 0) {
		throw new Error("Empty block");
	}
	if (block[0] === MAGIC) {
		return { format: "mask1", mask: decodeMaskBlock(block) };
	}
	if (block[0] === PAL4_MAGIC) {
		return { format: "pal4", image: decodePal4Block(block) };
	}
	throw new Error(`Unknown block magic: ${block[0]}`);
}
