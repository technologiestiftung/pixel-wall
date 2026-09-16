import {
	CHANNEL_MAX,
	CHANNEL_MIN,
	clampChannel,
	hexToRgb,
	rgbToHex,
	type Rgb,
} from "../../domain/color";

const CHANNELS: { index: 0 | 1 | 2; label: string; id: string }[] = [
	{ index: 0, label: "R", id: "rgb-r" },
	{ index: 1, label: "G", id: "rgb-g" },
	{ index: 2, label: "B", id: "rgb-b" },
];

/**
 * Per-channel colour entry, alongside the preset palette rather than
 * replacing it. Being able to drive one channel at a time is what makes a
 * miswired colour line obvious on the wall (see HARDWARE.md — a missing G2
 * renders white as magenta).
 */
export function RgbInputs({
	hex,
	onChange,
}: {
	hex: string;
	onChange: (nextHex: string) => void;
}) {
	const rgb = hexToRgb(hex);

	function setChannel(index: 0 | 1 | 2, raw: string) {
		// An empty field reads as 0 rather than NaN, so clearing it to retype
		// leaves a usable colour instead of breaking the preview.
		const next: Rgb = [...rgb];
		next[index] = clampChannel(raw === "" ? 0 : Number(raw));
		onChange(rgbToHex(next));
	}

	return (
		<div className="flex w-full flex-col gap-2">
			<span className="w-full text-[12px] text-[#767671]">
				Eigene Farbe (RGB)
			</span>
			<div className="flex w-full items-end gap-2">
				{CHANNELS.map(({ index, label, id }) => (
					<div key={id} className="flex flex-1 flex-col gap-1">
						<label
							htmlFor={id}
							className="text-[11px] font-medium text-[#6b6b66]"
						>
							{label}
						</label>
						<input
							id={id}
							type="number"
							inputMode="numeric"
							min={CHANNEL_MIN}
							max={CHANNEL_MAX}
							value={rgb[index]}
							onChange={(event) => setChannel(index, event.currentTarget.value)}
							className="w-full rounded-[8px] border border-[#e4e4e0] px-2 py-1.5 text-[13px] tabular-nums text-[#20201b]"
						/>
					</div>
				))}
				<span
					aria-hidden="true"
					className="size-[34px] shrink-0 rounded-[8px] border border-[#e4e4e0]"
					style={{ backgroundColor: hex }}
				/>
			</div>
			<span className="font-mono text-[10.5px] text-[#767671]">{hex}</span>
		</div>
	);
}
