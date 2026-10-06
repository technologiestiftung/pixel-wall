export function Toolbar() {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-baseline gap-3">
				<span className="whitespace-nowrap text-[20px] font-semibold text-[#20201b]">
					Vorschau
				</span>
				<span className="text-[13px] text-[#8a8a85]">
					Tipp: Mit Shift + Klick mehrere Bildschirme auswählen
				</span>
			</div>
		</div>
	);
}
