import type { AnimationContent } from "../../domain/types";
import { AlignmentPicker } from "./AlignmentPicker";

interface PlacementControlsProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
}

export function PlacementControls({
	content,
	onChange,
}: PlacementControlsProps) {
	return (
		<>
			<div className="flex flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor="scale">
					Skalierung
				</label>
				<div className="flex items-center gap-3">
					<input
						id="scale"
						type="range"
						min={25}
						max={400}
						value={content.scalePercent}
						onChange={(e) =>
							onChange({ ...content, scalePercent: Number(e.target.value) })
						}
						className="flex-1"
					/>
					<span className="w-12 shrink-0 text-right text-[13px] text-[#6b6b66]">
						{content.scalePercent}%
					</span>
				</div>
			</div>

			<AlignmentPicker
				hAlign={content.hAlign}
				vAlign={content.vAlign}
				onChangeHAlign={(hAlign) => onChange({ ...content, hAlign })}
				onChangeVAlign={(vAlign) => onChange({ ...content, vAlign })}
			/>
		</>
	);
}
