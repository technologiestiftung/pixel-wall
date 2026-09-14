import { defaultContentFor } from "../../domain/content";
import type { AnimationContent, ColorContent, ContentType, TextContent } from "../../domain/types";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { AnimationPanel } from "./AnimationPanel";
import { FarbePanel } from "./FarbePanel";
import { SaveButton } from "./SaveButton";
import { SelectionStatus } from "./SelectionStatus";
import { TabBar } from "./TabBar";
import { TextPanel } from "./TextPanel";

export function Menu() {
	const { selection, activeTab, draft, layoutEditMode } = useWallState();
	const dispatch = useWallDispatch();

	const current = draft && draft.type === activeTab ? draft : defaultContentFor(activeTab);

	function handleTabChange(tab: ContentType) {
		dispatch({ type: "set-active-tab", tab });
	}

	function handleContentChange(content: TextContent | AnimationContent | ColorContent) {
		dispatch({ type: "set-draft-content", content });
	}

	if (layoutEditMode) {
		return (
			<aside className="flex w-[360px] shrink-0 flex-col gap-5 border-r-[0.5px] border-[#595959] bg-white p-7">
				<h2 className="w-full text-[21px] font-semibold text-[#20201b]">Layout bearbeiten</h2>
				<p className="text-[13px] text-[#6b6b66]">
					Ziehe die Bildschirme in der Vorschau an ihre gewünschte Position. Überlappungen sind nicht möglich.
				</p>
			</aside>
		);
	}

	return (
		<aside className="flex w-[360px] shrink-0 flex-col gap-5 overflow-y-auto border-r-[0.5px] border-[#595959] bg-white p-7">
			<h2 className="w-full text-[21px] font-semibold text-[#20201b]">Inhalte hinzufügen</h2>
			<SelectionStatus />
			<TabBar active={activeTab} onChange={handleTabChange} />

			{selection ? (
				<>
					{activeTab === "text" && (
						<TextPanel content={current as TextContent} onChange={handleContentChange} />
					)}
					{activeTab === "animation" && (
						<AnimationPanel content={current as AnimationContent} onChange={handleContentChange} />
					)}
					{activeTab === "color" && (
						<FarbePanel content={current as ColorContent} onChange={handleContentChange} />
					)}
				</>
			) : (
				<p className="text-[13px] text-[#6b6b66]">Wähle einen oder mehrere Bildschirme in der Vorschau aus.</p>
			)}

			<SaveButton />
		</aside>
	);
}
