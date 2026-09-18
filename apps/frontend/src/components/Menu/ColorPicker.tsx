import { PALETTE } from "../../domain/content";
import { SelectedBadge } from "../../render/SelectedBadge";
import { RgbInputs } from "./RgbInputs";

interface ColorPickerProps {
	hex: string;
	onChange: (hex: string) => void;
	/** Names what is being coloured — the whole screen on the Farbe tab, the
	 * glyphs on the Text tab. */
	label: string;
}

/** The preset swatches plus per-channel entry, shared by the Farbe and Text
 * tabs so a colour is chosen the same way wherever it appears. A hex outside
 * the fixed palette (typed into the RGB fields) simply leaves no swatch
 * selected. */
export function ColorPicker({ hex, onChange, label }: ColorPickerProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<span className="w-full text-[12px] text-[#767671]">{label}</span>
			<div className="flex w-full flex-wrap gap-3">
				{PALETTE.map((preset) => {
					const selected = hex === preset;
					return (
						<button
							key={preset}
							type="button"
							onClick={() => onChange(preset)}
							aria-pressed={selected}
							aria-label={preset}
							className="flex w-[58px] flex-col items-center gap-2"
						>
							<span
								className={`relative block size-[58px] rounded-[12px] ${selected ? "border-2 border-[#20201b]" : "border border-[#e5e4df]"}`}
								style={{ backgroundColor: preset }}
							>
								{selected && (
									<SelectedBadge className="absolute -right-2 -top-2.5 h-[18px] w-[18px]" />
								)}
							</span>
							<span
								className={`font-mono text-[10.5px] ${selected ? "text-[#20201b]" : "text-[#767671]"}`}
							>
								{preset}
							</span>
						</button>
					);
				})}
			</div>

			<RgbInputs hex={hex} onChange={onChange} />
		</div>
	);
}
