import { defaultContentFor } from "../../domain/content";
import type {
	AnimationContent,
	ColorContent,
	ContentType,
	TextContent,
} from "../../domain/types";
import { effectiveBrightness } from "../../state/selectors";
import { useApplyChanges } from "../../state/useApplyChanges";
import { usePreviewGuard } from "../../state/usePreviewGuard";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { AnimationPanel } from "./AnimationPanel";
import { BrightnessSlider } from "./BrightnessSlider";
import { EditActions } from "./EditActions";
import { HintergrundPanel } from "./HintergrundPanel";
import { SelectionStatus } from "./SelectionStatus";
import { TabBar } from "./TabBar";
import { TextPanel } from "./TextPanel";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export function Menu() {
	const state = useWallState();
	const { selection, activeTab, draft, layoutEditMode, pendingIntent } = state;
	const dispatch = useWallDispatch();
	const { handleApply, isPreviewing } = useApplyChanges();
	usePreviewGuard();

	const current =
		draft && draft.type === activeTab ? draft : defaultContentFor(activeTab);

	// Anything that would drop the draft — switching tabs, selecting other
	// screens, clearing the selection, entering layout mode — is held back by
	// the reducer as a pending intent until the user says what to do with it.
	// The tab case is the sharpest: the draft is a single value shared across
	// tabs (see domain/apply.ts), so editing another tab's fields overwrites
	// whatever was drafted for the current one.
	function handleTabChange(tab: ContentType) {
		if (tab === activeTab) {
			return;
		}
		dispatch({
			type: "request-intent",
			intent: { kind: "set-active-tab", tab },
		});
	}

	function handleCancelIntent() {
		dispatch({ type: "resolve-intent", commit: false });
	}

	function handleDiscardAndContinue() {
		dispatch({ type: "resolve-intent", commit: true });
	}

	async function handleSaveAndContinue() {
		const saved = await handleApply();
		if (saved) {
			dispatch({ type: "resolve-intent", commit: true });
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
				{pendingIntent !== null && (
					<UnsavedChangesDialog
						onSave={handleSaveAndContinue}
						onDiscard={handleDiscardAndContinue}
						onCancel={handleCancelIntent}
						previewActive={isPreviewing}
					/>
				)}
			</aside>
		);
	}

	return (
		// Only the fields scroll: the actions are a footer outside the scroll
		// area, so a long panel can never push Speichern out of sight.
		<aside className="flex w-[360px] shrink-0 flex-col border-r-[0.5px] border-[#595959] bg-white">
			<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 pb-5">
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
							<HintergrundPanel
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
			</div>

			<div className="border-t-[0.5px] border-[#e4e4e0] px-7 pb-7 pt-5">
				<EditActions />
			</div>

			{pendingIntent !== null && (
				<UnsavedChangesDialog
					onSave={handleSaveAndContinue}
					onDiscard={handleDiscardAndContinue}
					onCancel={handleCancelIntent}
					previewActive={isPreviewing}
				/>
			)}
		</aside>
	);
}
