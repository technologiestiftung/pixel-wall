import { useEffect, type MouseEvent as ReactMouseEvent } from "react";

const STEPS: { title: string; text: string }[] = [
	{
		title: "Bildschirme auswählen",
		text: "Klicke in der Vorschau auf einen Bildschirm. Mit Shift + Klick wählst du mehrere Bildschirme gleichzeitig aus.",
	},
	{
		title: "Inhalt gestalten",
		text: "Wähle links zwischen Text, Animation/Bild (Vorlage, Hochladen, Wetter, Game of Life) und Hintergrund.",
	},
	{
		title: "Vorschau prüfen",
		text: "Änderungen erscheinen zunächst nur in der digitalen Vorschau – die echten Bildschirme bleiben unverändert.",
	},
	{
		title: "Speichern",
		text: "Mit „Speichern“ werden die Inhalte auf die Bildschirme an der Wand übertragen. Ungespeicherte Änderungen gehen verloren.",
	},
];

interface HowToDialogProps {
	onClose: () => void;
}

export function HowToDialog({ onClose }: HowToDialogProps) {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

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
				role="dialog"
				aria-modal="true"
				aria-labelledby="how-to-title"
				className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-[10px] bg-white p-6 shadow-lg"
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
				<h2
					id="how-to-title"
					className="pr-6 text-[17px] font-semibold text-[#20201b]"
				>
					So funktioniert's
				</h2>
				<ol className="mt-4 flex flex-col gap-4">
					{STEPS.map((step, index) => (
						<li key={step.title} className="flex gap-3">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#20201b] text-[12px] font-semibold text-white">
								{index + 1}
							</span>
							<div>
								<h3 className="text-[14px] font-semibold text-[#20201b]">
									{step.title}
								</h3>
								<p className="mt-0.5 text-[13px] text-[#6b6b66]">{step.text}</p>
							</div>
						</li>
					))}
				</ol>
				<div className="mt-6 flex justify-end">
					<button
						type="button"
						onClick={onClose}
						className="rounded-[8px] bg-[#006fff] px-3 py-2 text-[13.5px] font-semibold text-white"
					>
						Verstanden
					</button>
				</div>
			</div>
		</div>
	);
}
