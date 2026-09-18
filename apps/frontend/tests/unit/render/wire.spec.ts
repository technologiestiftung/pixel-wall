// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { contentToWire } from "../../../src/render/wire";
import {
	decodeMaskBase64,
	decodePal4Base64,
	maskToRows,
} from "../../../src/domain/mask";
import { blankRgba, solidUnderlay } from "../../../src/render/underlay";
import { hexToRgb } from "../../../src/domain/color";
import type {
	AnimationContent,
	ColorContent,
	TextContent,
} from "../../../src/domain/types";

const color: ColorContent = { type: "color", hex: "#FE4441" };

const text: TextContent = {
	type: "text",
	mode: "static",
	value: "HI",
	fontSizePx: 8,
	fontFamily: "monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	hAlign: "center",
	vAlign: "center",
};

const animation: AnimationContent = {
	type: "animation",
	templateId: "pfeil",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

describe("hexToRgb", () => {
	it("parses six-digit hex", () => {
		expect(hexToRgb("#FE4441")).toEqual([254, 68, 65]);
	});

	it("expands three-digit hex", () => {
		expect(hexToRgb("#f08")).toEqual([255, 0, 136]);
	});

	it("tolerates a missing hash", () => {
		expect(hexToRgb("000000")).toEqual([0, 0, 0]);
	});
});

describe("contentToWire", () => {
	it("carries the colour alongside the mask rather than baking it in", () => {
		const wire = contentToWire(color, { widthPx: 4, heightPx: 2 });
		expect(wire.format).toBe("mask1");
		expect(wire.color).toEqual([254, 68, 65]);
		expect(maskToRows(decodeMaskBase64(wire.data))).toEqual(["####", "####"]);
	});

	it("uses white for content that has no colour of its own", () => {
		expect(contentToWire(animation, { widthPx: 8, heightPx: 8 }).color).toEqual(
			[255, 255, 255],
		);
	});

	it("carries the text's own colour", () => {
		// mask1 is a 1-bit coverage mask plus one colour, so the tint has to
		// ride alongside the bitmap rather than being baked into its pixels.
		const wire = contentToWire(
			{ ...text, color: "#FE4441" },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(wire.format).toBe("mask1");
		expect(wire.color).toEqual([254, 68, 65]);
	});

	it("reports the requested dimensions", () => {
		const wire = contentToWire(color, { widthPx: 148, heightPx: 64 });
		expect(wire.widthPx).toBe(148);
		expect(wire.heightPx).toBe(64);
	});

	it("rounds and floors dimensions to at least one pixel", () => {
		const wire = contentToWire(color, { widthPx: 0, heightPx: 2.6 });
		expect(wire.widthPx).toBe(1);
		expect(wire.heightPx).toBe(3);
	});

	it("includes scroll metadata only when given", () => {
		expect(
			contentToWire(color, { widthPx: 4, heightPx: 2 }).scroll,
		).toBeUndefined();
		expect(
			contentToWire(
				color,
				{ widthPx: 4, heightPx: 2 },
				{
					scroll: {
						direction: "right",
						speedPxPerSec: 60,
						pauseMs: 2000,
						compositeWidthPx: 4,
					},
				},
			).scroll,
		).toMatchObject({ direction: "right", speedPxPerSec: 60, pauseMs: 2000 });
	});

	it("layers static text over what is already on the screens as pal4", () => {
		// mask1 carries one tint plus a coverage mask, so text on a background
		// needs the indexed format — and index 0 means "unlit" to every
		// renderer, so both real colours must land at index 1 or higher.
		const behind = solidUnderlay("#FFCFD6", 8, 8);
		const wire = contentToWire(
			{ ...text, color: "#FE4441" },
			{ widthPx: 8, heightPx: 8 },
			{ underlay: behind },
		);

		expect(wire.format).toBe("pal4");
		const image = decodePal4Base64(wire.data);
		expect(image.palette[0]).toEqual([0, 0, 0]);
		expect(image.palette).toContainEqual([254, 68, 65]);
		expect(image.palette).toContainEqual([255, 207, 214]);
		expect([...image.indices].every((index) => index > 0)).toBe(true);
	});

	it("stays on mask1 when there is nothing behind the text", () => {
		// An empty wall has no pixels to preserve, so the cheaper encoding
		// is kept rather than emitting a palette of one colour.
		const wire = contentToWire(
			text,
			{ widthPx: 8, heightPx: 8 },
			{
				underlay: blankRgba(8, 8),
			},
		);
		expect(wire.format).toBe("mask1");
	});
});
