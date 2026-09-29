// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { decodeMaskBase64, maskToRows } from "../../../src/domain/mask";
import { EMPTY_LAYERS, withEdit } from "../../../src/domain/types";
import type { ScreenLayers, TextContent } from "../../../src/domain/types";
import { layersToWire } from "../../../src/render/layers";
import * as wire from "../../../src/render/wire";

const text: TextContent = {
	type: "text",
	mode: "static",
	value: "HI",
	fontSizePx: 8,
	fontFamily: "monospace",
	fontWeight: "700",
	color: "#FE4441",
	hAlign: "center",
	vAlign: "center",
};

const scrolling: TextContent = { ...text, mode: "scrolling" };

describe("withEdit", () => {
	it("keeps the text when the background changes", () => {
		// The whole point of layers: the Hintergrund tab used to replace the
		// screen outright, taking any text on it with it.
		const withText = withEdit(EMPTY_LAYERS, text);
		const recoloured = withEdit(withText, { type: "color", hex: "#B4B9FF" });

		expect(recoloured.foreground).toEqual(text);
		expect(recoloured.background).toBe("#B4B9FF");
	});

	it("keeps the background when the text changes", () => {
		const onPink: ScreenLayers = { background: "#FFCFD6", foreground: null };
		const next = withEdit(onPink, text);

		expect(next.background).toBe("#FFCFD6");
		expect(next.foreground).toEqual(text);
	});

	it("'ohne' clears the background without touching the foreground", () => {
		const both: ScreenLayers = { background: "#FFCFD6", foreground: text };
		const next = withEdit(both, { type: "color", hex: null });

		expect(next.background).toBeNull();
		expect(next.foreground).toEqual(text);
	});
});

describe("layersToWire", () => {
	it("sends a foreground as one indexed frame, background painted under it", async () => {
		const wire = await layersToWire(
			{ background: "#B4B9FF", foreground: text },
			{ widthPx: 8, heightPx: 8 },
		);
		// pal4 carries up to 16 colours, so the background and the text colour
		// travel in one frame. jsdom has no canvas to rasterize with, so only
		// the format dispatch is provable here — mask.spec.ts covers the
		// quantization itself.
		expect(wire.format).toBe("pal4");
		expect(wire.color).toBeUndefined();
	});

	it("sends a lone background as a plain filled frame", async () => {
		const wire = await layersToWire(
			{ background: "#B4B9FF", foreground: null },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(wire.format).toBe("mask1");
		expect(wire.color).toEqual([180, 185, 255]);
	});

	it("renders an empty screen as an unlit frame", async () => {
		const wire = await layersToWire(EMPTY_LAYERS, { widthPx: 8, heightPx: 8 });
		expect(wire.format).toBe("mask1");
		expect(maskToRows(decodeMaskBase64(wire.data)).join("")).not.toContain("#");
	});

	it("attaches a background behind Lauftext on any screen, separately from the mask", async () => {
		const wire = await layersToWire(
			{ background: "#1E3791", foreground: scrolling },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(wire.background).toEqual([30, 55, 145]);
	});

	it("omits the background field when none is set", async () => {
		const result = await layersToWire(
			{ background: null, foreground: scrolling },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(result.background).toBeUndefined();
	});

	// Regression coverage: `wire.format`/`wire.color` alone (above) can't tell
	// jsdom-without-canvas apart from a real bug here, since contentToWire's
	// no-context fallback looks the same either way — a prior version of
	// layersToWire passed `background: null` into contentToWire for *every*
	// non-scrolling case (it meant to gate only the scrolling one), silently
	// breaking Hintergrund for static text and Animation/Bild. Spying on the
	// actual call is the only way to catch that here.
	it("bakes the background into the canvas for static text, not just Lauftext", async () => {
		const spy = vi.spyOn(wire, "contentToWire");
		await layersToWire(
			{ background: "#B4B9FF", foreground: text },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(spy).toHaveBeenCalledWith(
			text,
			{ widthPx: 8, heightPx: 8 },
			{ scroll: undefined, background: "#B4B9FF" },
		);
		spy.mockRestore();
	});

	it("keeps the background out of the canvas for Lauftext specifically", async () => {
		const spy = vi.spyOn(wire, "contentToWire");
		await layersToWire(
			{ background: "#B4B9FF", foreground: scrolling },
			{ widthPx: 8, heightPx: 8 },
		);
		expect(spy).toHaveBeenCalledWith(
			scrolling,
			{ widthPx: 8, heightPx: 8 },
			{ scroll: undefined, background: null },
		);
		spy.mockRestore();
	});
});
