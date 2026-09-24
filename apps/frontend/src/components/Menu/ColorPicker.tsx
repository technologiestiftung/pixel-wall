import { useId } from "react";
import { PALETTE } from "../../domain/content";
import { SelectedBadge } from "../../render/SelectedBadge";

interface ColorPickerProps {
	/** `null` only ever comes from a screen hydrated before "ohne" was removed
	 * as a selectable option (see CONTEXT.md "Hintergrund") — the picker no
	 * longer offers a way to choose it, but still displays it gracefully. */
	hex: string | null;
	onChange: (hex: string) => void;
	/** Names what is being coloured — the whole screen on the Hintergrund
	 * tab, the glyphs on the Text tab. */
	label: string;
}

/** The preset swatches plus a free colour picker, shared by the Hintergrund and
 * Text tabs so a colour is chosen the same way wherever it appears. A hex
 * outside the fixed palette (chosen via the colour picker) simply leaves no
 * swatch selected. */
export function ColorPicker({ hex, onChange, label }: ColorPickerProps) {
	const customId = useId();

	return (
		<div className="flex w-full flex-col gap-3">
			<span className="w-full text-[12px] text-[#767671]">{label}</span>
			<div className="flex w-full flex-wrap gap-3">
				{PALETTE.map((preset) => {
					const selected = hex === preset.hex;
					return (
						<button
							key={preset.hex}
							type="button"
							onClick={() => onChange(preset.hex)}
							aria-pressed={selected}
							aria-label={preset.name}
							title={preset.name}
							className="flex w-[39px] flex-col items-center gap-2"
						>
							<span
								className={`relative block size-[34px] rounded-lg ${selected ? "border-2 border-[#20201b]" : "border border-[#e5e4df]"}`}
								style={{ backgroundColor: preset.hex }}
							>
								{selected && (
									<SelectedBadge className="absolute -right-2 -top-2.5 h-[18px] w-[18px]" />
								)}
							</span>
						</button>
					);
				})}
			</div>

			<div className="flex w-full flex-col gap-2">
				<label className="text-[12px] text-[#767671]" htmlFor={customId}>
					Eigene Farbe
				</label>
				<div className="flex w-full items-center gap-2.5 rounded-[7px] border border-[#dededa] px-2.5 py-[7px]">
					<input
						id={customId}
						type="color"
						value={hex ?? "#000000"}
						onChange={(e) => onChange(e.target.value.toUpperCase())}
						className="size-7 shrink-0 cursor-pointer rounded-[6px] border border-[#e5e4df] bg-transparent p-0"
					/>
					<span className="truncate font-mono text-[13px] uppercase text-[#20201b]">
						{hex ?? "#000000"}
					</span>
				</div>
			</div>
		</div>
	);
}
