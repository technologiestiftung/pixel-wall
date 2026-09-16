import { PALETTE } from "../../domain/content";
import type { ColorContent } from "../../domain/types";
import { SelectedBadge } from "../../render/SelectedBadge";

interface FarbePanelProps {
	content: ColorContent;
	onChange: (content: ColorContent) => void;
}

export function FarbePanel({ content, onChange }: FarbePanelProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<span className="w-full text-[12px] text-[#767671]">Farbe wählen</span>
			<div className="flex w-full flex-wrap gap-3">
				{PALETTE.map((hex) => {
					const selected = content.hex === hex;
					return (
						<button
							key={hex}
							type="button"
							onClick={() => onChange({ ...content, hex })}
							aria-pressed={selected}
							aria-label={hex}
							className="flex w-[58px] flex-col items-center gap-2"
						>
							<span
								className={`relative block size-[58px] rounded-[12px] ${selected ? "border-2 border-[#20201b]" : "border border-[#e5e4df]"}`}
								style={{ backgroundColor: hex }}
							>
								{selected && (
									<SelectedBadge className="absolute -right-2 -top-2.5 h-[18px] w-[18px]" />
								)}
							</span>
							<span
								className={`font-mono text-[10.5px] ${selected ? "text-[#20201b]" : "text-[#767671]"}`}
							>
								{hex}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
