import type { CSSProperties } from "react";
import { TEMPLATES } from "../domain/content";

interface TemplateIconProps {
	templateId: string;
	className?: string;
	style?: CSSProperties;
}

/** Menu preview for a template: the actual `public/visuals/*.svg` artwork
 * (including any embedded SVG animation), not a redrawn approximation —
 * see render/rasterize.ts for the rasterized version sent to the wall. */
export function TemplateIcon({
	templateId,
	className,
	style,
}: TemplateIconProps) {
	const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
	return (
		<img
			src={`/visuals/${template.file}`}
			alt=""
			aria-hidden="true"
			className={className}
			style={style}
		/>
	);
}
