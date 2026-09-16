import { useState } from "react";
import { defaultContentFor } from "../../domain/content";
import type {
	AnimationContent,
	ColorContent,
	ContentType,
	TextContent,
} from "../../domain/types";
import { draftHasChanges, effectiveBrightness } from "../../state/selectors";
import { useApplyChanges } from "../../state/useApplyChanges";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { AnimationPanel } from "./AnimationPanel";
import { BrightnessSlider } from "./BrightnessSlider";
import { FarbePanel } from "./FarbePanel";
import { SaveButton } from "./SaveButton";
import { SelectionStatus } from "./SelectionStatus";
import { TabBar } from "./TabBar";
import { TextPanel } from "./TextPanel";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export function Menu() {
	const state = useWallState();
	const { selection, activeTab, draft, layoutEditMode } = state;
	const dispatch = useWallDispatch();
	const { handleApply } = useApplyChanges();
	const [pendingTab, setPendingTab] = useState<ContentType | null>(null);

	const current =
		draft && draft.type === activeTab ? draft : defaultContentFor(activeTab);

	// The draft is a single value shared across tabs (see domain/apply.ts):
	// editing another tab's fields overwrites whatever was drafted for the
	// current one. So switching away while the current tab has an unsaved
	// draft needs confirmation, or the change is silently lost.
	const currentTabHasUnsavedDraft =
		draft !== null && draft.type === activeTab && draftHasChanges(state);

	function handleTabChange(tab: ContentType) {
		if (tab === activeTab) {
			return;
		}
		if (currentTabHasUnsavedDraft) {
			setPendingTab(tab);
			return;
		}
		dispatch({ type: "set-active-tab", tab });
	}

	function handleCancelTabChange() {
		setPendingTab(null);
	}

	function handleDiscardAndSwitchTab() {
		if (pendingTab === null) {
			return;
		}
		dispatch({ type: "discard-draft" });
		dispatch({ type: "set-active-tab", tab: pendingTab });
		setPendingTab(null);
	}

	async function handleSaveAndSwitchTab() {
		if (pendingTab === null) {
			return;
		}
		const saved = await handleApply();
		if (saved) {
			dispatch({ type: "set-active-tab", tab: pendingTab });
			setPendingTab(null);
		}
	}

	function handleContentChange(
		content: TextContent | AnimationContent | ColorContent,
	) {
		dispatch({ type: "set-draft-content", content });
	}

	if (layoutEditMode) {
		return (
			<aside className="flex w-[360px] shrink-0 flex-col gap-5 border-r-[0.5px] border-[#595959] bg-white p-7">
				<h2 className="w-full text-[21px] font-semibold text-[#20201b]">
					Layout bearbeiten
				</h2>
				<p className="text-[13px] text-[#6b6b66]">
					Ziehe die Bildschirme in der Vorschau an ihre gewünschte Position.
					Überlappungen sind nicht möglich.
				</p>
			</aside>
		);
	}

	return (
		<aside className="flex w-[360px] shrink-0 flex-col gap-5 overflow-y-auto border-r-[0.5px] border-[#595959] bg-white p-7">
			<h2 className="w-full text-[21px] font-semibold text-[#20201b]">
				Inhalte hinzufügen
			</h2>
			<SelectionStatus />
			<TabBar active={activeTab} onChange={handleTabChange} />

			{selection ? (
				<>
					{activeTab === "text" && (
						<TextPanel
							content={current as TextContent}
							onChange={handleContentChange}
						/>
					)}
					{activeTab === "animation" && (
						<AnimationPanel
							content={current as AnimationContent}
							onChange={handleContentChange}
						/>
					)}
					{activeTab === "color" && (
						<FarbePanel
							content={current as ColorContent}
							onChange={handleContentChange}
						/>
					)}

					<hr className="border-[#e4e4e0]" />

					<BrightnessSlider
						kind={selection.kind}
						value={effectiveBrightness(state)[selection.kind]}
						onChange={(value) =>
							dispatch({
								type: "set-draft-brightness",
								kind: selection.kind,
								value,
							})
						}
					/>
				</>
			) : (
				<p className="text-[13px] text-[#6b6b66]">
					Wähle einen oder mehrere Bildschirme in der Vorschau aus.
				</p>
			)}

			<SaveButton />

			{pendingTab !== null && (
				<UnsavedChangesDialog
					onSave={handleSaveAndSwitchTab}
					onDiscard={handleDiscardAndSwitchTab}
					onCancel={handleCancelTabChange}
				/>
			)}
		</aside>
	);
}
