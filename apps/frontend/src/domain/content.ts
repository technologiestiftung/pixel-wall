import { preloadSvgTemplates } from "../render/svgTemplates";
import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	TextContent,
} from "./types";

export interface Template {
	id: string;
	label: string;
	/** Present only for real multi-colour brand artwork loaded from
	 * `public/visuals/` (see render/svgTemplates.ts) — these are rendered in
	 * their true colours and carried over the wire as `pal4`. Templates
	 * without it are the hand-drawn, genuinely single-colour Path2D icons in
	 * render/rasterize.ts, which stay on the smaller `mask1` format. */
	svgUrl?: string;
}

/** Fixed built-in template library (no user upload in v1) — see CONTEXT.md "Content". */
export const TEMPLATES: Template[] = [
	{ id: "pfeil", label: "Pfeil" },
	{ id: "baer", label: "Bär" },
	{ id: "raute", label: "Raute" },
	{ id: "herz", label: "Herz" },
	{ id: "stern", label: "Stern" },
	{ id: "sonne", label: "Sonne" },
	{ id: "clb-logo", label: "CLB Logo", svgUrl: "/visuals/CLB-Logo.svg" },
	{ id: "clb-raute", label: "CLB Raute", svgUrl: "/visuals/CLB-Raute.svg" },
	{
		id: "clb-arrow-round",
		label: "CLB Pfeil",
		svgUrl: "/visuals/CLB-arrow-round.svg",
	},
	{ id: "clb-smiley", label: "CLB Smiley", svgUrl: "/visuals/CLB-smiley.svg" },
];

preloadSvgTemplates(
	TEMPLATES.map((template) => template.svgUrl).filter(
		(url): url is string => url !== undefined,
	),
);

/** Fixed closed palette of exactly 4 presets (no free color picker in v1). */
export const PALETTE = ["#FEF177", "#B4B9FF", "#FE4441", "#FFCFD6"];

const DEFAULT_TEXT: TextContent = {
	type: "text",
	mode: "static",
	value: "",
	fontSizePx: 16,
	fontFamily: "Pixel Grotesk, ui-monospace, monospace",
	fontWeight: "700",
	direction: "left",
	speedPxPerSec: 40,
	hAlign: "center",
	vAlign: "center",
};

const DEFAULT_ANIMATION: AnimationContent = {
	type: "animation",
	templateId: TEMPLATES[0].id,
	scalePercent: 100,
	hAlign: "center",
	vAlign: "center",
};

const DEFAULT_COLOR: ColorContent = {
	type: "color",
	hex: PALETTE[0],
};

export function defaultContentFor(type: ContentType): Content {
	switch (type) {
		case "text":
			return { ...DEFAULT_TEXT };
		case "animation":
			return { ...DEFAULT_ANIMATION };
		case "color":
			return { ...DEFAULT_COLOR };
		default:
			throw new Error(`Unknown content type: ${type satisfies never}`);
	}
}

/** Fixed 2-second pause between Lauftext loop repeats — see CONTEXT.md "Content". */
export const LOOP_PAUSE_MS = 2000;
