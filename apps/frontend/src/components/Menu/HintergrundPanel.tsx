import type { ColorContent } from "../../domain/types";
import { ColorPicker } from "./ColorPicker";

interface HintergrundPanelProps {
	content: ColorContent;
	onChange: (content: ColorContent) => void;
}

/** The Hintergrund tab: fills the selected screens behind everything else.
 * Text applied afterwards is layered on top of it (see render/layers.ts). */
export function HintergrundPanel({ content, onChange }: HintergrundPanelProps) {
	return (
		<ColorPicker
			hex={content.hex}
			onChange={(hex) => onChange({ ...content, hex })}
			label="Hintergrund wählen"
		/>
	);
}
