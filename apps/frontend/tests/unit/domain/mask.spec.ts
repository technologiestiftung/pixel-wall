import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	createMask,
	decodeBlock,
	decodeMaskBase64,
	decodeMaskBlock,
	decodePal4Base64,
	decodePal4Block,
	encodeMaskBase64,
	encodeMaskBlock,
	encodePal4Base64,
	encodePal4Block,
	maskFromImageData,
	maskFromRows,
	maskToRows,
	pal4FromImageData,
	pal4FromRows,
	pal4StrideFor,
	pal4ToRows,
	setBit,
	strideFor,
} from "../../../src/domain/mask";

interface Fixture {
	name: string;
	widthPx: number;
	heightPx: number;
	rows: string[];
	strideBytes: number;
	rawHex: string;
	rleHex: string;
	encodedHex: string;
	encodedBase64: string;
	encoding: "raw" | "rle";
}

const fixtures: { cases: Fixture[] } = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL("../../../../../docs/wire-format-fixtures.json", import.meta.url),
		),
		"utf8",
	),
);

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

describe("mask1 shared fixtures", () => {
	it("has cases to check", () => {
		expect(fixtures.cases.length).toBeGreaterThan(0);
	});

	for (const fixture of fixtures.cases) {
		describe(fixture.name, () => {
			it("encodes to the fixture bytes", () => {
				const block = encodeMaskBlock(maskFromRows(fixture.rows));
				expect(toHex(block)).toBe(fixture.encodedHex);
			});

			it("encodes to the fixture base64", () => {
				expect(encodeMaskBase64(maskFromRows(fixture.rows))).toBe(
					fixture.encodedBase64,
				);
			});

			it("decodes the raw form back to the fixture rows", () => {
				expect(maskToRows(decodeMaskBlock(fromHex(fixture.rawHex)))).toEqual(
					fixture.rows,
				);
			});

			it("decodes the RLE form back to the fixture rows", () => {
				expect(maskToRows(decodeMaskBlock(fromHex(fixture.rleHex)))).toEqual(
					fixture.rows,
				);
			});

			it("agrees with the fixture stride and dimensions", () => {
				const mask = maskFromRows(fixture.rows);
				expect(mask.widthPx).toBe(fixture.widthPx);
				expect(mask.heightPx).toBe(fixture.heightPx);
				expect(strideFor(mask.widthPx)).toBe(fixture.strideBytes);
			});
		});
	}
});

describe("encodeMaskBlock", () => {
	it("never exceeds the raw size", () => {
		for (const fixture of fixtures.cases) {
			const block = encodeMaskBlock(maskFromRows(fixture.rows));
			expect(block.length).toBeLessThanOrEqual(fixture.rawHex.length / 2);
		}
	});

	it("picks RLE for a large sparse mask", () => {
		const mask = createMask(64, 64);
		setBit(mask, 10, 10);
		const block = encodeMaskBlock(mask);
		expect(block[2]).toBe(0x01);
		expect(block.length).toBeLessThan(64);
	});

	it("picks raw for a dense alternating mask", () => {
		const mask = createMask(64, 64);
		for (let y = 0; y < 64; y++) {
			for (let x = 0; x < 64; x += 2) {
				setBit(mask, x + (y % 2), y);
			}
		}
		expect(encodeMaskBlock(mask)[2]).toBe(0x00);
	});

	it("round-trips a wide Lauftext-shaped filmstrip", () => {
		const mask = createMask(2000, 64);
		for (let x = 0; x < 2000; x += 7) {
			setBit(mask, x, x % 64);
		}
		const decoded = decodeMaskBase64(encodeMaskBase64(mask));
		expect(decoded.widthPx).toBe(2000);
		expect(decoded.heightPx).toBe(64);
		expect(maskToRows(decoded)).toEqual(maskToRows(mask));
	});
});

describe("decodeMaskBlock", () => {
	it("rejects a bad magic", () => {
		const block = encodeMaskBlock(maskFromRows(["#..."]));
		block[0] = 0x51;
		expect(() => decodeMaskBlock(block)).toThrow(/magic/);
	});

	it("rejects an unknown version", () => {
		const block = encodeMaskBlock(maskFromRows(["#..."]));
		block[1] = 0x02;
		expect(() => decodeMaskBlock(block)).toThrow(/magic\/version/);
	});

	it("rejects an unknown encoding", () => {
		const block = encodeMaskBlock(maskFromRows(["#..."]));
		block[2] = 0x07;
		expect(() => decodeMaskBlock(block)).toThrow(/encoding/);
	});

	it("rejects a truncated header", () => {
		expect(() => decodeMaskBlock(new Uint8Array([0x50, 0x01]))).toThrow(
			/too short/,
		);
	});

	it("rejects RLE runs that do not cover the declared size", () => {
		const block = Uint8Array.from([
			0x50, 0x01, 0x01, 0x00, 0x08, 0x00, 0x01, 0x04,
		]);
		expect(() => decodeMaskBlock(block)).toThrow(/covers 4 bits/);
	});
});

describe("maskFromImageData", () => {
	it("sets a pixel only when it is at least half opaque", () => {
		const data = new Uint8ClampedArray([
			255, 255, 255, 255, 255, 255, 255, 127, 255, 255, 255, 128, 0, 0, 0, 0,
		]);
		expect(
			maskToRows(maskFromImageData(data, { widthPx: 4, heightPx: 1 })),
		).toEqual(["#.#."]);
	});
});

describe("pal4FromImageData", () => {
	/** Packs [r,g,b,a] rows of pixels into a flat Uint8ClampedArray. */
	function pixels(rows: number[][][]): Uint8ClampedArray {
		return Uint8ClampedArray.from(rows.flat(2));
	}

	it("assigns index 0 to fully transparent pixels", () => {
		const data = pixels([[[0, 0, 0, 0]]]);
		const image = pal4FromImageData(data, { widthPx: 1, heightPx: 1 });
		expect(image.palette[0]).toEqual([0, 0, 0]);
		expect(image.indices[0]).toBe(0);
	});

	it("builds a palette from the opaque colours actually present", () => {
		const data = pixels([
			[
				[254, 68, 65, 255],
				[30, 55, 145, 255],
				[0, 0, 0, 0],
			],
		]);
		const image = pal4FromImageData(data, { widthPx: 3, heightPx: 1 });
		expect(image.palette).toEqual([
			[0, 0, 0],
			[254, 68, 65],
			[30, 55, 145],
		]);
		expect([...image.indices]).toEqual([1, 2, 0]);
	});

	it("crisp: a half-covered edge is unlit or its own colour, never a darker neighbour", () => {
		const pink = [252, 170, 182];
		const navy = [30, 55, 145];
		const data = pixels([
			[
				[...pink, 255],
				[...navy, 255],
				[...pink, 150],
				[...pink, 100],
			],
		]);
		const image = pal4FromImageData(data, {
			widthPx: 4,
			heightPx: 1,
			crisp: true,
		});
		expect(image.palette).toEqual([[0, 0, 0], pink, navy]);
		expect([...image.indices]).toEqual([1, 2, 1, 0]);
	});

	it("crisp: rare blends and near-duplicates get no palette slot", () => {
		const red = [254, 68, 65, 255];
		const nearRed = [253, 67, 64, 255];
		const blend = [142, 61, 103, 255];
		const data = pixels([
			[...Array(200).fill(red), ...Array(50).fill(nearRed), blend],
		]);
		const image = pal4FromImageData(data, {
			widthPx: 251,
			heightPx: 1,
			crisp: true,
		});
		expect(image.palette).toEqual([
			[0, 0, 0],
			[254, 68, 65],
		]);
		expect(image.indices[250]).toBe(1);
	});

	it("crisp: a low-contrast but genuinely different background and shape colour both keep their own slot", () => {
		// Regression test: these two colours are close enough that a human
		// would call them "low contrast" (Euclidean RGB distance ~20), but
		// they are two deliberately different, fully-opaque fills — a
		// template's own colour and a separately-chosen background — not an
		// anti-aliasing blend of one into the other. Before this fix the
		// shape's colour was discarded as a "near duplicate" of the
		// background and every one of its pixels snapped onto the
		// background's palette entry instead, so the shape silently took on
		// the background colour (or vanished into it) only once the
		// background was changed to something close to the shape's colour.
		const background: [number, number, number] = [30, 55, 145];
		const shape = [44, 69, 150];
		const data = pixels([
			[
				...Array(80).fill([...background, 255]),
				...Array(20).fill([...shape, 255]),
			],
		]);
		const image = pal4FromImageData(data, {
			widthPx: 100,
			heightPx: 1,
			crisp: true,
			background,
		});
		expect(image.palette).toEqual([[0, 0, 0], background, shape]);
		expect(image.indices[0]).toBe(1);
		expect(image.indices[99]).toBe(2);
	});

	it("crisp: a small-area foreground colour still earns a slot against a large non-black background", () => {
		// Regression test for the more severe half of the same bug: `crisp`
		// mode only gives a colour its own palette slot once it covers at
		// least 1% of "the artwork" (CRISP_MIN_SHARE). Before this fix that
		// share was computed against every opaque pixel *including* the
		// background fill — fine when the background was literal black (the
		// only colour ever excluded), but the instant a real `background` is
		// chosen, its own enormous pixel count swamps the denominator and a
		// perfectly ordinary small-area shape (a thin line, a logo detail)
		// drops under 1% and loses its slot entirely — regardless of how much
		// contrast it has with that background. Passing the real background
		// in lets it be excluded from the count, same as black always was.
		const background: [number, number, number] = [30, 55, 145];
		const shape = [200, 80, 40]; // ample contrast; share is the only variable here
		const data = pixels([
			[
				...Array(985).fill([...background, 255]),
				...Array(15).fill([...shape, 255]),
			],
		]);
		const image = pal4FromImageData(data, {
			widthPx: 1000,
			heightPx: 1,
			crisp: true,
			background,
		});
		expect(image.palette).toEqual([[0, 0, 0], background, shape]);
		expect(image.indices[999]).toBe(2);
	});

	it("caps the palette at 16 entries, keeping the most frequent colours", () => {
		// Colour `n` (1-20, grayscale) appears `n` times, so frequency ranks
		// exactly by colour value with no ties.
		const row: number[][] = [];
		for (let color = 1; color <= 20; color++) {
			for (let count = 0; count < color; count++) {
				row.push([color, color, color, 255]);
			}
		}
		const data = pixels([row]);
		const image = pal4FromImageData(data, { widthPx: row.length, heightPx: 1 });
		expect(image.palette.length).toBe(16);
		expect(image.palette[0]).toEqual([0, 0, 0]);
		for (let color = 20; color >= 6; color--) {
			expect(image.palette).toContainEqual([color, color, color]);
		}
	});

	it("snaps anti-aliased edge pixels to the nearest palette entry instead of minting new colours", () => {
		const data = pixels([
			[
				[254, 68, 65, 255], // solid brand red
				[254, 68, 65, 128], // half-opaque edge of the same red
				[0, 0, 0, 0], // fully transparent background
			],
		]);
		const image = pal4FromImageData(data, { widthPx: 3, heightPx: 1 });
		// Only the solid colour (plus background) ever becomes a palette
		// entry; the edge pixel is classified against those two, not given
		// its own slot.
		expect(image.palette).toEqual([
			[0, 0, 0],
			[254, 68, 65],
		]);
		expect([...image.indices]).toEqual([1, 1, 0]);
	});

	it("round-trips through encode/decode", () => {
		const data = pixels([
			[
				[254, 68, 65, 255],
				[30, 55, 145, 255],
			],
			[
				[255, 207, 214, 255],
				[0, 0, 0, 0],
			],
		]);
		const image = pal4FromImageData(data, { widthPx: 2, heightPx: 2 });
		const decoded = decodePal4Block(encodePal4Block(image));
		expect(decoded.palette).toEqual(image.palette);
		expect([...decoded.indices]).toEqual([...image.indices]);
	});
});

interface Pal4Fixture {
	name: string;
	widthPx: number;
	heightPx: number;
	rows: string[];
	palette: number[][];
	strideBytes: number;
	rawHex: string;
	rleHex: string;
	encodedHex: string;
	encodedBase64: string;
	encoding: "raw" | "rle";
}

const pal4Fixtures: Pal4Fixture[] = (
	fixtures as unknown as { pal4Cases: Pal4Fixture[] }
).pal4Cases;

describe("pal4 shared fixtures", () => {
	it("has cases to check", () => {
		expect(pal4Fixtures.length).toBeGreaterThan(0);
	});

	for (const fixture of pal4Fixtures) {
		describe(fixture.name, () => {
			const image = () => pal4FromRows(fixture.rows, fixture.palette);

			it("encodes to the fixture bytes", () => {
				expect(toHex(encodePal4Block(image()))).toBe(fixture.encodedHex);
			});

			it("encodes to the fixture base64", () => {
				expect(encodePal4Base64(image())).toBe(fixture.encodedBase64);
			});

			it("decodes the raw form back to the fixture rows", () => {
				const decoded = decodePal4Block(fromHex(fixture.rawHex));
				expect(pal4ToRows(decoded)).toEqual(fixture.rows);
				expect(decoded.palette).toEqual(fixture.palette);
			});

			it("decodes the RLE form back to the fixture rows", () => {
				const decoded = decodePal4Block(fromHex(fixture.rleHex));
				expect(pal4ToRows(decoded)).toEqual(fixture.rows);
				expect(decoded.palette).toEqual(fixture.palette);
			});

			it("agrees with the fixture stride, and never exceeds raw", () => {
				expect(pal4StrideFor(fixture.widthPx)).toBe(fixture.strideBytes);
				expect(encodePal4Block(image()).length).toBeLessThanOrEqual(
					fixture.rawHex.length / 2,
				);
			});
		});
	}
});

describe("encodePal4Block", () => {
	const palette = [
		[0, 0, 0],
		[254, 68, 65],
	];

	it("picks RLE for flat artwork", () => {
		const rows = [
			...Array.from({ length: 32 }, () => "0".repeat(64)),
			...Array.from({ length: 32 }, () => "1".repeat(64)),
		];
		const block = encodePal4Block(pal4FromRows(rows, palette));
		expect(block[2]).toBe(0x01);
		expect(block.length).toBeLessThan(64);
	});

	it("pads an odd width with index 0 and round-trips", () => {
		const image = pal4FromRows(["111"], palette);
		expect(pal4ToRows(decodePal4Base64(encodePal4Base64(image)))).toEqual([
			"111",
		]);
	});

	it("rejects an oversized palette", () => {
		const big = Array.from({ length: 17 }, (_, i) => [i, i, i]);
		expect(() =>
			encodePal4Block({
				widthPx: 1,
				heightPx: 1,
				palette: big,
				indices: new Uint8Array([0]),
			}),
		).toThrow(/palette has 17/);
	});

	it("rejects a pixel outside the palette", () => {
		expect(() => pal4FromRows(["05"], palette)).toThrow(/outside the palette/);
	});
});

describe("decodePal4Block", () => {
	const palette = [
		[0, 0, 0],
		[1, 1, 1],
	];

	it("rejects a bad palette count", () => {
		const block = encodePal4Block(pal4FromRows(["01"], palette));
		block[7] = 0;
		expect(() => decodePal4Block(block)).toThrow(/paletteCount/);
	});

	it("rejects a truncated palette", () => {
		const block = encodePal4Block(pal4FromRows(["01"], palette));
		expect(() => decodePal4Block(block.subarray(0, 9))).toThrow(
			/Truncated pal4 palette/,
		);
	});
});

describe("decodeBlock", () => {
	it("dispatches on the magic byte", () => {
		const mask = encodeMaskBlock(maskFromRows(["##.."]));
		const image = encodePal4Block(
			pal4FromRows(
				["01"],
				[
					[0, 0, 0],
					[9, 9, 9],
				],
			),
		);
		expect(decodeBlock(mask).format).toBe("mask1");
		expect(decodeBlock(image).format).toBe("pal4");
	});

	it("rejects an unknown magic", () => {
		expect(() => decodeBlock(Uint8Array.from([0x99, 0x01, 0x00]))).toThrow(
			/Unknown block magic/,
		);
	});

	it("rejects an empty block", () => {
		expect(() => decodeBlock(new Uint8Array(0))).toThrow(/Empty block/);
	});
});
