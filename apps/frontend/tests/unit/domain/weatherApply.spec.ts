// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { buildApplyRequest } from "../../../src/domain/apply";
import type { AnimationContent, ScreenSpec } from "../../../src/domain/types";
import { EMPTY_LAYERS, withEdit } from "../../../src/domain/types";
import {
	DEFAULT_TEMPERATURE_STYLE,
	DEFAULT_WEATHER_VARIANT,
	WEATHER_VARIANTS,
} from "../../../src/domain/weather";
import { loadWeatherMedia } from "../../../src/render/weatherMedia";

vi.mock("../../../src/render/weatherMedia", async (importOriginal) => ({
	...(await importOriginal<object>()),
	loadWeatherMedia: vi.fn(async (variant: string) => ({
		name: `${variant}.svg`,
		sheetDataUrl: "data:image/png;base64,",
		frameWidthPx: 128,
		frameHeightPx: 128,
		frameCount: 1,
		columns: 1,
		frameDurationMs: 100,
	})),
}));

const large: ScreenSpec = {
	id: "a",
	kind: "large",
	pixelSize: 64,
	physicalSizeMm: 192,
};

const weather: AnimationContent = {
	type: "animation",
	mode: "weather",
	templateId: "logo",
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

function build(content: AnimationContent) {
	return buildApplyRequest(
		{ specs: [large], positions: [{ screenId: "a", xMm: 0, yMm: 0 }] },
		{ kind: "large", screenIds: ["a"] },
		{ layers: withEdit(EMPTY_LAYERS, content) },
	);
}

describe("buildApplyRequest for live weather", () => {
	test("renders a variant for every weather icon", async () => {
		const request = await build(weather);

		expect(Object.keys(request.weather?.variants ?? {})).toEqual([
			...WEATHER_VARIANTS,
		]);
		for (const variant of WEATHER_VARIANTS) {
			expect(loadWeatherMedia).toHaveBeenCalledWith(variant);
		}
	});

	test("sends the default variant as the content to show until the weather is known", async () => {
		const request = await build(weather);

		expect(request.content).toBe(
			request.weather?.variants[DEFAULT_WEATHER_VARIANT],
		);
	});

	test("keeps the editor's weather layer in source, not the resolved upload", async () => {
		const request = await build(weather);

		expect(request.source?.foreground).toEqual(weather);
	});

	test("sends every glyph a temperature can need when the temperature is shown", async () => {
		const request = await build({
			...weather,
			temperature: { ...DEFAULT_TEMPERATURE_STYLE, color: "#FE4441" },
		});

		expect(Object.keys(request.weather?.temperature?.glyphs ?? {})).toEqual([
			..."0123456789-°",
		]);
		expect(request.weather?.temperature).toMatchObject({
			color: [254, 68, 65],
			hAlign: "center",
			vAlign: "bottom",
			paddingPx: 2,
		});
	});

	test("leaves the temperature out when it isn't shown", async () => {
		const request = await build(weather);

		expect(request.weather?.temperature).toBeUndefined();
	});

	test("other content carries no weather variants", async () => {
		const request = await build({ ...weather, mode: "template" });

		expect(request.weather).toBeUndefined();
	});
});
