import { describe, expect, it } from "vitest";
import {
	EMPTY_LAYERS,
	NO_ANIMATION_TEMPLATE_ID,
	withEdit,
} from "../../../src/domain/types";
import type { AnimationContent, ScreenLayers } from "../../../src/domain/types";

const raute: AnimationContent = {
	type: "animation",
	templateId: "raute-animiert",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

describe("withEdit", () => {
	it("writes a real template as the foreground", () => {
		const next = withEdit(EMPTY_LAYERS, raute);
		expect(next.foreground).toEqual(raute);
	});

	it("clears the foreground for the 'ohne' sentinel instead of storing it", () => {
		const applied: ScreenLayers = {
			background: "#FE4441",
			foreground: raute,
		};
		const next = withEdit(applied, {
			...raute,
			templateId: NO_ANIMATION_TEMPLATE_ID,
		});
		expect(next.foreground).toBeNull();
		// The background is a separate layer and must survive untouched.
		expect(next.background).toBe("#FE4441");
	});

	it("leaves an already-empty foreground empty when 'ohne' is chosen again", () => {
		const next = withEdit(EMPTY_LAYERS, {
			...raute,
			templateId: NO_ANIMATION_TEMPLATE_ID,
		});
		expect(next).toEqual(EMPTY_LAYERS);
	});
});
