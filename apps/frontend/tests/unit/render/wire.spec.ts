// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { contentToWire } from "../../../src/render/wire";
import {
	decodeMaskBase64,
	decodePal4Base64,
	maskToRows,
} from "../../../src/domain/mask";
import { hexToRgb } from "../../../src/domain/color";
import { TEMPLATES } from "../../../src/domain/content";
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

const logoTemplate: AnimationContent = {
	type: "animation",
	mode: "template",
	templateId: "logo",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const runningPathText: TextContent = {
	type: "text",
	mode: "path",
	pathRunning: true,
	value: "HI",
	fontSizePx: 8,
	fontFamily: "monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	hAlign: "center",
	vAlign: "center",
	speedPxPerSec: 40,
	pauseMs: 2000,
};

const gameOfLife: AnimationContent = {
	type: "animation",
	mode: "gameOfLife",
	templateId: "logo",
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
	it("carries the colour alongside the mask rather than baking it in", async () => {
		const wire = await contentToWire(color, { widthPx: 4, heightPx: 2 });
		expect(wire.format).toBe("mask1");
		expect(wire.color).toEqual([254, 68, 65]);
		expect(maskToRows(decodeMaskBase64(wire.data))).toEqual(["####", "####"]);
	});

	it("routes text to pal4 with its own colour rather than a flat mask colour", async () => {
		const wire = await contentToWire(text, { widthPx: 8, heightPx: 8 });
		expect(wire.format).toBe("pal4");
		expect(wire.color).toBeUndefined();
	});

	it("reports the requested dimensions", async () => {
		const wire = await contentToWire(color, { widthPx: 148, heightPx: 64 });
		expect(wire.widthPx).toBe(148);
		expect(wire.heightPx).toBe(64);
	});

	it("rounds and floors dimensions to at least one pixel", async () => {
		const wire = await contentToWire(color, { widthPx: 0, heightPx: 2.6 });
		expect(wire.widthPx).toBe(1);
		expect(wire.heightPx).toBe(3);
	});

	it("includes scroll metadata only when given", async () => {
		const withoutScroll = await contentToWire(color, {
			widthPx: 4,
			heightPx: 2,
		});
		expect(withoutScroll.scroll).toBeUndefined();

		const withScroll = await contentToWire(
			color,
			{ widthPx: 4, heightPx: 2 },
			{ scroll: { direction: "right", speedPxPerSec: 60, pauseMs: 2000 } },
		);
		expect(withScroll.scroll).toEqual({
			direction: "right",
			speedPxPerSec: 60,
			pauseMs: 2000,
		});
	});

	it("routes every Animation/Bild template to pal4 instead of forcing it to a flat colour", async () => {
		expect(TEMPLATES.find((t) => t.id === "logo")).toBeDefined();
		const wire = await contentToWire(logoTemplate, {
			widthPx: 32,
			heightPx: 32,
		});
		expect(wire.format).toBe("pal4");
		expect(wire.color).toBeUndefined();
		// `Image` never actually decodes anything under jsdom (see
		// render/templateImages.ts), so nothing actually rasterizes here —
		// this only exercises the format dispatch and the blank-frame
		// fallback, not real quantization, which pal4FromImageData in
		// mask.spec.ts covers.
		const decoded = decodePal4Base64(wire.data);
		expect(decoded.palette).toEqual([[0, 0, 0]]);
	});

	it("routes running Pfadtext to pal4 frames, the same filmstrip mechanism as an animated template", async () => {
		const wire = await contentToWire(runningPathText, {
			widthPx: 32,
			heightPx: 32,
		});
		expect(wire.format).toBe("pal4");
		if (wire.format !== "pal4") {
			return;
		}
		expect(wire.frames).toBeDefined();
		expect(wire.frames?.compositeWidthPx).toBe(32);
		expect(wire.scroll).toBeUndefined();
	});

	it("sends static Pfadtext as a plain pal4 frame, no frames metadata", async () => {
		const wire = await contentToWire(
			{ ...runningPathText, pathRunning: false },
			{ widthPx: 32, heightPx: 32 },
		);
		expect(wire.format).toBe("pal4");
		if (wire.format !== "pal4") {
			return;
		}
		expect(wire.frames).toBeUndefined();
	});

	it("sends gameOfLife as just the flag, no bitmap, even with a background option", async () => {
		const wire = await contentToWire(
			gameOfLife,
			{ widthPx: 32, heightPx: 32 },
			{ background: "#FE4441" },
		);
		expect(wire).toEqual({ format: "gameOfLife" });
	});
});
