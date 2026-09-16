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
