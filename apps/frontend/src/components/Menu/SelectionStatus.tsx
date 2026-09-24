import { displayScreenId } from "../../domain/layout";
import { useWallDispatch, useWallState } from "../../state/WallProvider";

/** "A und B" / "A, B und C" — German conjunction list, not just a comma join. */
function formatGermanList(items: string[]): string {
	if (items.length <= 1) {
		return items.join("");
	}
	return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

/** Renders nothing when no screen is selected — that state now has its own
 * fuller explanation just below (see Menu.tsx's info box), so this compact
 * line would otherwise just repeat "Kein Bildschirm ausgewählt" a second
 * time on screen. */
export function SelectionStatus() {
	const { selection } = useWallState();
	const dispatch = useWallDispatch();
	const screenIds = selection?.screenIds ?? [];
	const count = screenIds.length;

	if (count === 0) {
		return null;
	}

	const numbers = [...screenIds]
		.sort((a, b) => Number(a) - Number(b))
		.map(displayScreenId);

	return (
		<div className="flex w-full items-center justify-between whitespace-nowrap">
			<p className="text-xs text-[#6b6b66]">
				{`Bildschirm${count === 1 ? "" : "e"} ${formatGermanList(numbers)} ausgewählt`}
			</p>
			<button
				type="button"
				onClick={() =>
					dispatch({
						type: "request-intent",
						intent: { kind: "clear-selection" },
					})
				}
				className="text-xs text-[#767671] underline decoration-solid [text-underline-position:from-font]"
			>
				Auswahl aufheben
			</button>
		</div>
	);
}
