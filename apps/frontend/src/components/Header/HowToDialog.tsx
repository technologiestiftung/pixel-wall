import { Dialog } from "../Dialog";

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
	return (
		<Dialog
			aria-modal
			labelledBy="how-to-title"
			onClose={onClose}
			className="max-h-full max-w-lg overflow-y-auto"
		>
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
		</Dialog>
	);
}
