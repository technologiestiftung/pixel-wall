import type { ScreenKind } from "../../domain/types";

const LABELS: Record<ScreenKind, string> = {
	small: "Helligkeit — alle kleinen Bildschirme",
	large: "Helligkeit — alle großen Bildschirme",
};

export const BRIGHTNESS_MIN = 5;
export const BRIGHTNESS_MAX = 100;

/**
 * Brightness is a property of a whole panel chain (`matrix.brightness` on the
 * Pi, `setBrightness8` on the ESP32), so it can only be set per hardware kind,
 * never per screen. The label says so explicitly: adjusting this while two
 * large screens are selected still changes all four.
 */
export function BrightnessSlider({
	kind,
	value,
	onChange,
}: {
	kind: ScreenKind;
	value: number;
	onChange: (next: number) => void;
}) {
	const id = `brightness-${kind}`;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between">
				<label htmlFor={id} className="text-[13px] font-medium text-[#20201b]">
					{LABELS[kind]}
				</label>
				<span className="text-[13px] tabular-nums text-[#6b6b66]">
					{value}%
				</span>
			</div>
			<input
				id={id}
				type="range"
				min={BRIGHTNESS_MIN}
				max={BRIGHTNESS_MAX}
				value={value}
				onChange={(event) => onChange(Number(event.currentTarget.value))}
				className="w-full accent-[#006fff]"
			/>
		</div>
	);
}
