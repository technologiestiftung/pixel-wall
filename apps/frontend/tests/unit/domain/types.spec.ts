import { describe, expect, it } from "vitest";
import {
	EMPTY_LAYERS,
	NO_ANIMATION_TEMPLATE_ID,
	withEdit,
} from "../../../src/domain/types";
import type {
	AnimationContent,
	ScreenLayers,
	UploadedMedia,
} from "../../../src/domain/types";

const raute: AnimationContent = {
	type: "animation",
	mode: "template",
	templateId: "raute-animiert",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const gameOfLife: AnimationContent = {
	type: "animation",
	mode: "gameOfLife",
	templateId: "ohne",
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

	it("writes a gameOfLife selection as the foreground like any other content", () => {
		const next = withEdit(EMPTY_LAYERS, gameOfLife);
		expect(next.foreground).toEqual(gameOfLife);
	});

	it("does not apply the 'ohne' sentinel to a gameOfLife selection", () => {
		// gameOfLife's templateId is a meaningless placeholder (see
		// AnimationContent) — even if it happens to equal the "ohne" sentinel,
		// that clearing behaviour is template-mode-only.
		const next = withEdit(EMPTY_LAYERS, gameOfLife);
		expect(next.foreground).not.toBeNull();
	});

	it("suspends rather than discards a screen's Hintergrund when gameOfLife is selected", () => {
		const applied: ScreenLayers = { background: "#FE4441", foreground: raute };
		const next = withEdit(applied, gameOfLife);
		expect(next.foreground).toEqual(gameOfLife);
		expect(next.background).toBe("#FE4441");
	});
});

const media: UploadedMedia = {
	name: "cat.gif",
	sheetDataUrl: "data:image/png;base64,AAAA",
	frameWidthPx: 32,
	frameHeightPx: 32,
	frameCount: 4,
	columns: 2,
	frameDurationMs: 62.5,
};

describe("withEdit: uploads", () => {
	it("leaves the layers untouched while no file has been chosen", () => {
		const applied: ScreenLayers = { background: "#FE4441", foreground: raute };
		const next = withEdit(applied, { ...raute, mode: "upload" });
		expect(next).toBe(applied);
	});

	it("writes a chosen upload as the foreground", () => {
		const upload: AnimationContent = {
			...raute,
			mode: "upload",
			upload: media,
		};
		expect(withEdit(EMPTY_LAYERS, upload).foreground).toEqual(upload);
	});

	it("drops a leftover upload when saving a template", () => {
		const next = withEdit(EMPTY_LAYERS, { ...raute, upload: media });
		expect(next.foreground).toEqual(raute);
	});
});
