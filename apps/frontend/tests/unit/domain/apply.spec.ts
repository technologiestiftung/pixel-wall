// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { buildApplyRequest } from "../../../src/domain/apply";
import type { Content } from "../../../src/domain/types";
import { EMPTY_LAYERS, withEdit } from "../../../src/domain/types";

/** Keeps these cases reading as (wall, selection, content) — the content is
 * folded into empty layers, i.e. an edit on screens showing nothing yet. */
function build(
	wall: Parameters<typeof buildApplyRequest>[0],
	selection: Parameters<typeof buildApplyRequest>[1],
	content: Content,
) {
	return buildApplyRequest(wall, selection, {
		layers: withEdit(EMPTY_LAYERS, content),
	});
}

import type { LayoutPosition, ScreenSpec } from "../../../src/domain/types";

const largeA: ScreenSpec = {
	id: "a",
	kind: "large",
	pixelSize: 64,
	physicalSizeMm: 192,
};
const largeB: ScreenSpec = {
	id: "b",
	kind: "large",
	pixelSize: 64,
	physicalSizeMm: 192,
};
const positions: LayoutPosition[] = [
	{ screenId: "a", xMm: 0, yMm: 0 },
	{ screenId: "b", xMm: 201, yMm: 0 }, // 9mm real gap → 3 device px at 3mm pitch
];

describe("buildApplyRequest", () => {
	test("color content: per-screen window uses each screen's own device pixel size", async () => {
		const request = await build(
			{ specs: [largeA, largeB], positions },
			{ kind: "large", screenIds: ["a", "b"] },
			{ type: "color", hex: "#FE4441" },
		);

		expect(request.selectionKind).toBe("large");
		expect(request.screens).toEqual([
			{
				screenId: "a",
				window: { offsetXPx: 0, offsetYPx: 0, widthPx: 64, heightPx: 64 },
			},
			{
				screenId: "b",
				window: { offsetXPx: 67, offsetYPx: 0, widthPx: 64, heightPx: 64 },
			},
		]);
		// Actual PNG rendering is only meaningful in a real browser canvas
		// (jsdom has no canvas backend) — window and contract shape is what
		// this test covers; see the e2e suite for real bitmap verification.
		expect(request.content.format).toBe("mask1");
		expect(typeof request.content.data).toBe("string");
		expect(request.content.scroll).toBeUndefined();
	});

	test("scrolling text: includes scroll metadata with the fixed loop pause", async () => {
		const request = await build(
			{ specs: [largeA], positions },
			{ kind: "large", screenIds: ["a"] },
			{
				type: "text",
				mode: "scrolling",
				value: "HALLO",
				fontSizePx: 16,
				fontFamily: "monospace",
				fontWeight: "700",
				color: "#FFFFFF",
				direction: "left",
				speedPxPerSec: 40,
				hAlign: "center",
				vAlign: "center",
			},
		);

		expect(request.content.scroll).toMatchObject({
			direction: "left",
			speedPxPerSec: 40,
			pauseMs: 2000,
		});
		// The composite the text travels across, not the filmstrip width —
		// a single 64px screen here.
		expect(request.content.scroll?.compositeWidthPx).toBe(64);
	});

	test("static content has no scroll metadata", async () => {
		const request = await build(
			{ specs: [largeA], positions },
			{ kind: "large", screenIds: ["a"] },
			{
				type: "text",
				mode: "static",
				value: "HALLO",
				fontSizePx: 16,
				fontFamily: "monospace",
				fontWeight: "700",
				color: "#FFFFFF",
				hAlign: "center",
				vAlign: "center",
			},
		);

		expect(request.content.scroll).toBeUndefined();
	});
});
