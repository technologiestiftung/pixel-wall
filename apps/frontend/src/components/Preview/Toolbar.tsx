import { useWallDispatch, useWallState } from "../../state/WallProvider";

export function Toolbar() {
	const { layoutEditMode } = useWallState();
	const dispatch = useWallDispatch();

	return (
		<div className="flex items-center justify-between">
			<span className="whitespace-nowrap text-[20px] font-semibold text-[#20201b]">
				Vorschau
			</span>
			<button
				type="button"
				onClick={() =>
					dispatch({
						type: "request-intent",
						intent: { kind: "toggle-layout-edit-mode" },
					})
				}
				aria-pressed={layoutEditMode}
				className={`whitespace-nowrap rounded-[8px] border px-[14px] py-2 text-[13px] font-medium ${
					layoutEditMode
						? "border-[#20201b] bg-[#20201b] text-white"
						: "border-[#e4e4e0] bg-white text-[#4b4b47]"
				}`}
			>
				{layoutEditMode ? "Layout fertig" : "Layout bearbeiten"}
			</button>
		</div>
	);
}
