import type { ColorContent } from "../../domain/types";
import { ColorPicker } from "./ColorPicker";

interface BackgroundPanelProps {
	content: ColorContent;
	onChange: (content: ColorContent) => void;
}

/** The Hintergrund tab: fills the selected screens behind everything else.
 * Text applied afterwards is layered on top of it (see render/layers.ts). */
export function BackgroundPanel({ content, onChange }: BackgroundPanelProps) {
	return (
		<ColorPicker
			hex={content.hex}
			onChange={(hex) => onChange({ ...content, hex })}
			label="Hintergrund wählen"
		/>
	);
}
