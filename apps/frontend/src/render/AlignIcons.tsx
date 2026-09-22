/** Exact icon geometry from the Figma design (Menu > Position), parameterized
 * to `currentColor` so they follow the AlignmentPicker button's selected/
 * unselected text color — see render/TabIcons.tsx for the same convention. */

export function AlignHorizontalLeftIcon({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M2 22V2H4V22H2ZM6 17V14H16V17H6ZM6 10V7H22V10H6Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export function AlignHorizontalCenterIcon({
	className,
}: {
	className?: string;
}) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M11 22V17H6V14H11V10H3V7H11V2H13V7H21V10H13V14H18V17H13V22H11Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export function AlignHorizontalRightIcon({
	className,
}: {
	className?: string;
}) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M20 22V2H22V22H20ZM8 17V14H18V17H8ZM2 10V7H18V10H2Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export function AlignVerticalTopIcon({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path d="M2 4V2H22V4H2ZM10.5 20V6H13.5V20H10.5Z" fill="currentColor" />
		</svg>
	);
}

export function AlignVerticalCenterIcon({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M11 22V13.5H3V10.5H11V2H13V10.5H21V13.5H13V22H11Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export function AlignVerticalBottomIcon({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path d="M2 22V20H22V22H2ZM10.5 18V4H13.5V18H10.5Z" fill="currentColor" />
		</svg>
	);
}
