import { useWallDispatch, useWallState } from "../../state/WallProvider";

export function SelectionStatus() {
	const { selection } = useWallState();
	const dispatch = useWallDispatch();
	const count = selection?.screenIds.length ?? 0;

	return (
		<div className="flex w-full items-center justify-between whitespace-nowrap">
			<p className="text-[13.5px] text-[#6b6b66]">
				{count === 0
					? "Kein Bildschirm ausgewählt"
					: `${count} Bildschirm${count === 1 ? "" : "e"} ausgewählt`}
			</p>
			{count > 0 && (
				<button
					type="button"
					onClick={() => dispatch({ type: "clear-selection" })}
					className="text-[12.5px] text-[#767671] underline decoration-solid [text-underline-position:from-font]"
				>
					Auswahl aufheben
				</button>
			)}
		</div>
	);
}
