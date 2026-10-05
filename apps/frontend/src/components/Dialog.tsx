import {
	useEffect,
	useRef,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from "react";

interface DialogProps {
	role?: "dialog" | "alertdialog";
	"aria-modal"?: boolean;
	labelledBy: string;
	/** Escape, the close button, and a click on the backdrop all call this. */
	onClose: () => void;
	className: string;
	children: ReactNode;
}

/** A centred panel over a dimmed backdrop, with a close button in the corner. */
export function Dialog({
	role = "dialog",
	"aria-modal": ariaModal,
	labelledBy,
	onClose,
	className,
	children,
}: DialogProps) {
	// Read through a ref so a parent passing a fresh closure every render
	// doesn't re-register the keydown listener each time.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onCloseRef.current();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	// On mousedown, not click, so that releasing a text selection outside the
	// dialog doesn't close it.
	function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	return (
		<div
			onMouseDown={handleBackdropMouseDown}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		>
			<div
				role={role}
				aria-modal={ariaModal}
				aria-labelledby={labelledBy}
				className={`relative w-full rounded-[10px] bg-white p-6 shadow-lg ${className}`}
			>
				<button
					type="button"
					onClick={onClose}
					aria-label="Schließen"
					className="absolute right-3 top-3 rounded-[6px] p-1.5 text-[#767671] hover:bg-[#f4f4f2] hover:text-[#20201b]"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M1 1L13 13M13 1L1 13"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</button>
				{children}
			</div>
		</div>
	);
}
