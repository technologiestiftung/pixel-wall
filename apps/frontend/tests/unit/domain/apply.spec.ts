// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { buildApplyRequest } from "../../../src/domain/apply";
import type { LayoutPosition, ScreenSpec } from "../../../src/domain/types";

const largeA: ScreenSpec = { id: "a", kind: "large", pixelSize: 64, physicalSizeMm: 192 };
const largeB: ScreenSpec = { id: "b", kind: "large", pixelSize: 64, physicalSizeMm: 192 };
const positions: LayoutPosition[] = [
	{ screenId: "a", xMm: 0, yMm: 0 },
	{ screenId: "b", xMm: 201, yMm: 0 }, // 9mm real gap → 3 device px at 3mm pitch
];

describe("buildApplyRequest", () => {
	test("color content: per-screen geometry uses each screen's own device pixel size", () => {
		const request = buildApplyRequest(
			{ specs: [largeA, largeB], positions },
			{ kind: "large", screenIds: ["a", "b"] },
			{ type: "color", hex: "#FE4441" },
		);

		expect(request.selectionKind).toBe("large");
		expect(request.screens).toEqual([
			{ screenId: "a", geometry: { offsetXPx: 0, offsetYPx: 0, widthPx: 64, heightPx: 64 } },
			{ screenId: "b", geometry: { offsetXPx: 67, offsetYPx: 0, widthPx: 64, heightPx: 64 } },
		]);
		// Actual PNG rendering is only meaningful in a real browser canvas
		// (jsdom has no canvas backend) — geometry and contract shape is what
		// this test covers; see the e2e suite for real bitmap verification.
		expect(typeof request.content.bitmap).toBe("string");
		expect(request.content.scroll).toBeUndefined();
	});

	test("scrolling text: includes scroll metadata with the fixed loop pause", () => {
		const request = buildApplyRequest(
			{ specs: [largeA], positions },
			{ kind: "large", screenIds: ["a"] },
			{
				type: "text",
				mode: "scrolling",
				value: "HALLO",
				fontSizePx: 16,
				fontFamily: "monospace",
				fontWeight: "700",
				direction: "left",
				speedPxPerSec: 40,
			},
		);

		expect(request.content.scroll).toEqual({ direction: "left", speedPxPerSec: 40, pauseMs: 2000 });
	});

	test("static content has no scroll metadata", () => {
		const request = buildApplyRequest(
			{ specs: [largeA], positions },
			{ kind: "large", screenIds: ["a"] },
			{
				type: "text",
				mode: "static",
				value: "HALLO",
				fontSizePx: 16,
				fontFamily: "monospace",
				fontWeight: "700",
			},
		);

		expect(request.content.scroll).toBeUndefined();
	});
});
