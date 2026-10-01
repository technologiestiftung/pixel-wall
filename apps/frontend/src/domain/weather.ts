import type { TemperatureStyle } from "./types";

/**
 * The icons live weather can show, one per file under `public/weather/`
 * (amCharts weather icons, CC BY 4.0 — see `public/weather/LICENSE`; `fog.svg`
 * is our own, drawn to match). Every
 * one of them is rendered on Speichern, and the backend switches between them
 * as the weather changes — see apps/backend/app/weather.py, which owns the
 * mapping from Bright Sky's weather onto these and must list the same ids.
 */
export const WEATHER_VARIANTS = [
	"sunny",
	"night",
	"cloudy-day-1",
	"cloudy-night-3",
	"cloudy",
	"fog",
	"rainy-6",
	"rainy-7",
	"snowy-5",
	"snowy-6",
	"thunder",
] as const;

export type WeatherVariant = (typeof WEATHER_VARIANTS)[number];

export const DEFAULT_TEMPERATURE_STYLE: TemperatureStyle = {
	fontSizePx: 16,
	fontFamily: "Host Grotesk, ui-monospace, monospace",
	fontWeight: "700",
	color: "#FFFFFF",
	hAlign: "center",
	vAlign: "bottom",
	paddingPx: 2,
};

/** Shown until the backend has fetched the weather for the first time. */
export const DEFAULT_WEATHER_VARIANT: WeatherVariant = "cloudy";

export const WEATHER_LABELS: Record<WeatherVariant, string> = {
	sunny: "Sonnig",
	night: "Klar",
	"cloudy-day-1": "Teils bewölkt",
	"cloudy-night-3": "Teils bewölkt",
	cloudy: "Bewölkt",
	fog: "Nebel",
	"rainy-6": "Regen",
	"rainy-7": "Hagel",
	"snowy-5": "Schneeregen",
	"snowy-6": "Schnee",
	thunder: "Gewitter",
};

export function weatherIconUrl(variant: WeatherVariant): string {
	return `/weather/${variant}.svg`;
}
