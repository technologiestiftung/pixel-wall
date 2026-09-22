import { defaultContentFor } from "../../domain/content";
import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	TextContent,
} from "../../domain/types";
import { effectiveBrightness } from "../../state/selectors";
import { useApplyChanges } from "../../state/useApplyChanges";
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
	const {
		selection,
		activeTab,
		draftText,
		draftAnimation,
		draftColor,
		layoutEditMode,
		pendingIntent,
	} = state;
	const dispatch = useWallDispatch();
	const { handleApply } = useApplyChanges();

	function currentContentFor(tab: ContentType): Content {
		switch (tab) {
			case "text":
				return draftText ?? defaultContentFor("text");
			case "animation":
				return draftAnimation ?? defaultContentFor("animation");
			case "color":
				return draftColor ?? defaultContentFor("color");
			default:
				throw new Error(`Unknown content type: ${tab satisfies never}`);
		}
	}
	const current = currentContentFor(activeTab);

	// Selecting other screens, clearing the selection, and entering layout
	// mode all drop the current draft(s), so the reducer holds them back as a
	// pending intent until the user says what to do with it. Switching tabs is
	// free — each tab keeps its own draft — except Text and Animation/Bild
	// share one foreground layer, so editing one silently drops the other (see
	// state/reducer.ts "set-draft-content").
	function handleTabChange(tab: ContentType) {
		dispatch({ type: "set-active-tab", tab });
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
					Screens anpassen
				</h2>
				<SelectionStatus />
				<TabBar active={activeTab} onChange={handleTabChange} />

				{selection ? (
					<>
						{/* No aria-labelledby here: it would give this wrapper the
						same accessible name as the tab's own form field (e.g.
						"Text"), which makes them indistinguishable to label-based
						lookups. aria-controls on the tab button already links the
						two. */}
						<div role="tabpanel" id={`panel-${activeTab}`} className="contents">
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
						</div>

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
					<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-[13px] text-blue-700">
						Kein Bildschirm ausgewählt. Wähle einen oder mehrere Screens aus
						(Shift-Taste bei der Auswahl gedrückt halten), um neue Inhalte auf
						die Screens zu ziehen.
					</div>
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
				/>
			)}
		</aside>
	);
}
