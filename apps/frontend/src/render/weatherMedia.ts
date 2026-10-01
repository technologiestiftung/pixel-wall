import type { AnimationContent, UploadedMedia } from "../domain/types";
import { weatherIconUrl, type WeatherVariant } from "../domain/weather";
import { decodeUpload } from "./uploadedMedia";

const mediaCache = new Map<WeatherVariant, Promise<UploadedMedia>>();

/** A weather icon sampled exactly like an uploaded animated SVG (see
 * render/animatedSvg.ts), once per page load — sampling takes long enough to
 * be noticeable, and every screen showing weather needs the same frames. */
export function loadWeatherMedia(
	variant: WeatherVariant,
): Promise<UploadedMedia> {
	let cached = mediaCache.get(variant);
	if (!cached) {
		cached = fetch(weatherIconUrl(variant))
			.then((response) => response.text())
			.then((text) =>
				decodeUpload(
					new File([text], `${variant}.svg`, { type: "image/svg+xml" }),
				),
			);
		cached.catch(() => mediaCache.delete(variant));
		mediaCache.set(variant, cached);
	}
	return cached;
}

/** Weather content showing one particular icon, as the upload it is drawn
 * as — so placement, the frame strip and the wire payload all go through the
 * same code as an uploaded animation. */
export function asWeatherUpload(
	content: AnimationContent,
	media: UploadedMedia,
): AnimationContent {
	return { ...content, mode: "upload", upload: media };
}
