import { ChevronDownIcon } from "../../render/TabIcons";

/** Text-styling fields shared by the Text tab and the Wetter tab's
 * temperature. */

interface NumberFieldProps {
	id: string;
	value: number;
	onChange: (value: number) => void;
}

interface PaddingFieldProps extends NumberFieldProps {
	label?: string;
	disabled?: boolean;
}

export function FontSizeField({ id, value, onChange }: NumberFieldProps) {
	return (
		<PxField
			id={id}
			label="Textgröße"
			min={1}
			value={value}
			onChange={onChange}
		/>
	);
}

export function PaddingField({
	id,
	value,
	onChange,
	label = "Abstand zum Rand",
	disabled = false,
}: PaddingFieldProps) {
	return (
		<PxField
			id={id}
			label={label}
			min={0}
			max={8}
			value={value}
			onChange={onChange}
			disabled={disabled}
		/>
	);
}

function PxField({
	id,
	label,
	min,
	max,
	value,
	onChange,
	disabled = false,
}: NumberFieldProps & {
	label: string;
	min: number;
	max?: number;
	disabled?: boolean;
}) {
	return (
		<div className={`flex flex-col gap-2 ${disabled ? "opacity-40" : ""}`}>
			<label className="text-[12px] text-[#767671]" htmlFor={id}>
				{label}
			</label>
			<div className="flex w-[98px] items-center rounded-[7px] border border-[#dededa]">
				<input
					id={id}
					type="number"
					min={min}
					max={max}
					value={value}
					disabled={disabled}
					onChange={(e) => {
						const next = Number(e.target.value);
						onChange(Number.isFinite(next) ? Math.max(min, next) : min);
					}}
					className="w-full min-w-0 flex-1 px-3 py-2.5 text-[14px] text-[#20201b] disabled:cursor-not-allowed disabled:bg-transparent"
				/>
				<span className="shrink-0 border-l border-[#edede9] px-2.5 py-2.5 text-[12.5px] text-[#767671]">
					px
				</span>
			</div>
		</div>
	);
}

interface FontFieldProps {
	id: string;
	fontFamily: string;
	fontWeight: string;
	onChange: (font: { fontFamily: string; fontWeight: string }) => void;
}

export function FontField({
	id,
	fontFamily,
	fontWeight,
	onChange,
}: FontFieldProps) {
	return (
		<div className="flex flex-col gap-2">
			<label className="text-[12px] text-[#767671]" htmlFor={id}>
				Schriftart
			</label>
			<div className="flex w-full gap-2.5">
				<div className="relative flex-1">
					<select
						id={id}
						value={fontFamily}
						onChange={(e) =>
							onChange({ fontFamily: e.target.value, fontWeight })
						}
						className="w-full appearance-none rounded-[7px] border border-[#dededa] px-[11px] py-2.5 text-[13px] text-[#20201b]"
					>
						<option value="Host Grotesk, FrankMoji, ui-monospace, monospace">
							Host Grotesk
						</option>
						<option value="Pixelify Sans, FrankMoji, ui-monospace, monospace">
							Pixelify Sans
						</option>
						<option value="FrankMoji, ui-monospace, monospace">Monospace</option>
					</select>
					<ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[#8a8a85]" />
				</div>
				<div className="relative flex-1">
					<select
						aria-label="Schriftschnitt"
						value={fontWeight}
						onChange={(e) =>
							onChange({ fontFamily, fontWeight: e.target.value })
						}
						className="w-full appearance-none rounded-[7px] border border-[#dededa] px-[11px] py-2.5 text-[13px] text-[#20201b]"
					>
						<option value="400">Regular</option>
						<option value="700">Bold</option>
					</select>
					<ChevronDownIcon className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[#8a8a85]" />
				</div>
			</div>
		</div>
	);
}
