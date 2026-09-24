// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decodeMaskBase64, maskToRows } from "../../../src/domain/mask";
import { EMPTY_LAYERS, withEdit } from "../../../src/domain/types";
import type { ScreenLayers, TextContent } from "../../../src/domain/types";
import { backgroundIsLost, layersToWire } from "../../../src/render/layers";

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

describe("backgroundIsLost", () => {
	it("is true for a background behind Lauftext on a small screen", () => {
		// Small screens (ESP32) don't support compositing a background behind a
		// panned filmstrip yet — see
		// docs/adr/0001-phase-lauftext-background-by-hardware-kind.md.
		expect(
			backgroundIsLost(
				{ background: "#B4B9FF", foreground: scrolling },
				"small",
			),
		).toBe(true);
		expect(
			backgroundIsLost({ background: "#B4B9FF", foreground: text }, "small"),
		).toBe(false);
		expect(
			backgroundIsLost({ background: null, foreground: scrolling }, "small"),
		).toBe(false);
	});

	it("is false for black — indistinguishable from a small screen's fallback", () => {
		// Also covers the default background (see domain/content.ts
		// DEFAULT_BACKGROUND_HEX), which is black — the warning shouldn't fire
		// just because a fresh edit hasn't touched Hintergrund yet.
		expect(
			backgroundIsLost(
				{ background: "#000000", foreground: scrolling },
				"small",
			),
		).toBe(false);
	});

	it("is false for a background behind Lauftext on a large screen — it composites instead", () => {
		expect(
			backgroundIsLost(
				{ background: "#B4B9FF", foreground: scrolling },
				"large",
			),
		).toBe(false);
	});
});

describe("layersToWire", () => {
	it("sends a foreground as one indexed frame, background painted under it", async () => {
		const wire = await layersToWire(
			{ background: "#B4B9FF", foreground: text },
			{ widthPx: 8, heightPx: 8 },
			{ screenKind: "large" },
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
			{ screenKind: "large" },
		);
		expect(wire.format).toBe("mask1");
		expect(wire.color).toEqual([180, 185, 255]);
	});

	it("renders an empty screen as an unlit frame", async () => {
		const wire = await layersToWire(
			EMPTY_LAYERS,
			{ widthPx: 8, heightPx: 8 },
			{ screenKind: "large" },
		);
		expect(wire.format).toBe("mask1");
		expect(maskToRows(decodeMaskBase64(wire.data)).join("")).not.toContain("#");
	});

	it("attaches a background behind Lauftext on a large screen, separately from the mask", async () => {
		const wire = await layersToWire(
			{ background: "#1E3791", foreground: scrolling },
			{ widthPx: 8, heightPx: 8 },
			{ screenKind: "large" },
		);
		expect(wire.background).toEqual([30, 55, 145]);
	});

	it("drops the background behind Lauftext on a small screen, exactly as before", async () => {
		const wire = await layersToWire(
			{ background: "#1E3791", foreground: scrolling },
			{ widthPx: 8, heightPx: 8 },
			{ screenKind: "small" },
		);
		expect(wire.background).toBeUndefined();
	});
});
