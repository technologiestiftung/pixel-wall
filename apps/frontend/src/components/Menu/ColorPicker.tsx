import { PALETTE } from "../../domain/content";
import { SelectedBadge } from "../../render/SelectedBadge";
import { RgbInputs } from "./RgbInputs";

interface ColorPickerProps {
	hex: string | null;
	onChange: (hex: string | null) => void;
	/** Names what is being coloured — the whole screen on the Hintergrund
	 * tab, the glyphs on the Text tab. */
	label: string;
	/** Offers an "ohne" swatch that selects no colour at all — an unlit
	 * screen on the Hintergrund tab. Text glyphs always have a colour. */
	allowNone?: boolean;
}

/** The preset swatches plus per-channel entry, shared by the Hintergrund and Text
 * tabs so a colour is chosen the same way wherever it appears. A hex outside
 * the fixed palette (typed into the RGB fields) simply leaves no swatch
 * selected. */
export function ColorPicker({
	hex,
	onChange,
	label,
	allowNone = false,
}: ColorPickerProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<span className="w-full text-[12px] text-[#767671]">{label}</span>
			<div className="flex w-full gap-2">
				{allowNone && (
					<button
						type="button"
						onClick={() => onChange(null)}
						aria-pressed={hex === null}
						aria-label="ohne"
						className="flex flex-1 flex-col items-center gap-2"
					>
						<span
							className={`relative block size-[50px] rounded-[12px] bg-[repeating-conic-gradient(#e4e4e0_0_25%,#ffffff_0_50%)] bg-[length:14px_14px] ${hex === null ? "border-2 border-[#20201b]" : "border border-[#e4e4e0]"}`}
						>
							{hex === null && (
								<SelectedBadge className="absolute -right-2 -top-2.5 h-[18px] w-[18px]" />
							)}
						</span>
						<span
							className={`text-[10.5px] ${hex === null ? "text-[#20201b]" : "text-[#767671]"}`}
						>
							ohne
						</span>
					</button>
				)}
				{PALETTE.map((preset) => {
					const selected = hex === preset;
					return (
						<button
							key={preset}
							type="button"
							onClick={() => onChange(preset)}
							aria-pressed={selected}
							aria-label={preset}
							className="flex flex-1 flex-col items-center gap-2"
						>
							<span
								className={`relative block size-[50px] rounded-[12px] ${selected ? "border-2 border-[#20201b]" : ""}`}
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

			<RgbInputs hex={hex ?? "#000000"} onChange={onChange} />
		</div>
	);
}
