/** Selected-state checkmark badge, exact geometry from the Figma design
 * (used on the Animation/Bild template grid and the colour swatches). */
export function SelectedBadge({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 18 18"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<circle cx="9" cy="9" r="9" fill="#20201B" />
			<path
				d="M4.5 9.29L7.85 13 15.5 5"
				stroke="white"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="9" cy="9" r="8.2" stroke="white" strokeWidth="1.6" />
		</svg>
	);
}
