import type { CSSProperties, ReactNode } from "react";
import { TEMPLATES } from "../domain/content";

interface TemplateIconProps {
	templateId: string;
	className?: string;
	style?: CSSProperties;
}

/** Exact icon geometry from the Figma design (Menu Animation/Bild panel),
 * parameterized to `currentColor` — for the hand-drawn single-colour
 * templates. Real multi-colour brand artwork (see domain/content.ts's
 * `svgUrl`) is shown as an `<img>` instead, in its true colours. */
export function TemplateIcon({
	templateId,
	className,
	style,
}: TemplateIconProps) {
	const template = TEMPLATES.find((t) => t.id === templateId);
	if (template?.svgUrl) {
		return (
			<img src={template.svgUrl} alt="" className={className} style={style} />
		);
	}

	const icon = ICONS[templateId] ?? ICONS.pfeil;
	return (
		<svg
			viewBox={icon.viewBox}
			className={className}
			style={style}
			fill="none"
			aria-hidden="true"
		>
			{icon.node}
		</svg>
	);
}

const ICONS: Record<string, { viewBox: string; node: ReactNode }> = {
	pfeil: {
		viewBox: "0 0 25.8 27.8",
		node: (
			<path
				d="M3 16H25M16.75 27L25 16L16.75 5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		),
	},
	baer: {
		viewBox: "0 0 22 22",
		node: (
			<g stroke="currentColor">
				<path
					d="M11 7.75C14.2333 7.75 16.75 10.1559 16.75 13C16.75 15.8441 14.2333 18.25 11 18.25C7.76671 18.25 5.25 15.8441 5.25 13C5.25 10.1559 7.76671 7.75 11 7.75Z"
					strokeWidth="1.5"
				/>
				<circle cx="5.5" cy="5" r="1.8" strokeWidth="1.4" />
				<circle cx="16.5" cy="5" r="1.8" strokeWidth="1.4" />
				<ellipse
					cx="11"
					cy="14.3"
					rx="1"
					ry="0.8"
					fill="currentColor"
					stroke="none"
				/>
			</g>
		),
	},
	raute: {
		viewBox: "0 0 25.8 25.8",
		node: (
			<path
				d="M14 3L25 14L14 25L3 14L14 3Z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
		),
	},
	herz: {
		viewBox: "0 0 25 25",
		node: (
			<path
				d="M14 25C14 25 3 16.9333 3 9.74667C3 5.64 6.025 3 9.325 3C11.6625 3 13.3125 4.46667 14 6.22667C14.6875 4.46667 16.3375 3 18.675 3C21.975 3 25 5.64 25 9.74667C25 16.9333 14 25 14 25Z"
				fill="currentColor"
			/>
		),
	},
	stern: {
		viewBox: "0 0 24.92 24.5",
		node: (
			<path
				d="M13.92 2.5L16.8061 10.4961L24.92 10.8966L18.5759 16.2464L20.7269 24.5L13.92 19.8082L7.11307 24.5L9.26406 16.2464L2.92 10.8966L11.0339 10.4961L13.92 2.5Z"
				fill="currentColor"
			/>
		),
	},
	sonne: {
		viewBox: "0 0 23.7 23.7",
		node: (
			<g stroke="currentColor">
				<circle cx="11" cy="11" r="3.75" strokeWidth="1.5" />
				<path
					d="M12 1V3.42M12 20.58V23M1 12H3.42M20.58 12H23M4.52 4.52L6.28 6.28M17.72 17.72L19.48 19.48M4.52 19.48L6.28 17.72M19.48 4.52L17.72 6.28"
					strokeWidth="1.4"
					strokeLinecap="round"
				/>
			</g>
		),
	},
};
