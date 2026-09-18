import type { ColorContent } from "../../domain/types";
import { ColorPicker } from "./ColorPicker";

interface FarbePanelProps {
	content: ColorContent;
	onChange: (content: ColorContent) => void;
}

export function FarbePanel({ content, onChange }: FarbePanelProps) {
	return (
		<ColorPicker
			hex={content.hex}
			onChange={(hex) => onChange({ ...content, hex })}
			label="Farbe wählen"
		/>
	);
}
