import type { ReactNode } from "react";
import { contrastRatio, MIN_TEXT_CONTRAST } from "../../domain/color";
import {
	DEFAULT_BACKGROUND_HEX,
	defaultContentFor,
	isMovingAnimation,
} from "../../domain/content";
import { referenceScreenId } from "../../domain/mapping";
import { EMPTY_LAYERS } from "../../domain/types";
import type {
	AnimationContent,
	ColorContent,
	Content,
	ContentType,
	ScreenLayers,
	Selection,
	TextContent,
} from "../../domain/types";
import type { WallState } from "../../state/reducer";
import {
	needsUnsavedConfirmation,
	resolveScreenRender,
} from "../../state/selectors";
import { useApplyChanges } from "../../state/useApplyChanges";
import { useWallDispatch, useWallState } from "../../state/WallProvider";
import { AnimationPanel } from "./AnimationPanel";
import { BackgroundPanel } from "./BackgroundPanel";
import { EditActions } from "./EditActions";
import { SelectionStatus } from "./SelectionStatus";
import { TabBar } from "./TabBar";
import { TextPanel } from "./TextPanel";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export function Menu() {
	const { layoutEditMode } = useWallState();

	if (layoutEditMode) {
		return (
			<aside className="flex w-[400px] shrink-0 flex-col gap-5 border-r-[0.5px] border-[#595959] bg-white p-7">
				<h2 className="w-full text-[21px] font-semibold text-[#20201b]">
					Layout bearbeiten
				</h2>
				<p className="text-[13px] text-[#6b6b66]">
					Ziehe die Bildschirme in der Vorschau an ihre gewünschte Position.
					Überlappungen sind nicht möglich.
				</p>
				<UnsavedChangesPrompt />
			</aside>
		);
	}

	return (
		// Only the fields scroll: the actions are a footer outside the scroll
		// area, so a long panel can never push Speichern out of sight.
		<aside className="flex w-[400px] shrink-0 flex-col border-r-[0.5px] border-[#595959] bg-white">
			<ContentEditor />

			<div className="border-t-[0.5px] border-[#e4e4e0] px-7 pb-7 pt-5">
				<EditActions />
			</div>

			<UnsavedChangesPrompt />
		</aside>
	);
}

function ContentEditor() {
	const state = useWallState();
	const { selection, activeTab } = state;
	const dispatch = useWallDispatch();

	const referenceId = selection
		? referenceScreenId(state.specs, selection)
		: null;
	const appliedLayers = referenceId
		? (state.applied[referenceId]?.layers ?? EMPTY_LAYERS)
		: EMPTY_LAYERS;
	const current = currentContentFor(activeTab, state, appliedLayers);

	// What the selection is actually about to show — drafts folded over
	// whatever's already applied (see resolveScreenRender) — so these warnings
	// track the live preview rather than just this tab's own draft.
	const previewLayers = referenceId
		? (resolveScreenRender(state, referenceId)?.layers ?? EMPTY_LAYERS)
		: EMPTY_LAYERS;
	const animationDroppedOnSave = dropsAnimationOnSave(
		state,
		appliedLayers.foreground,
	);
	const textLowContrast = hasLowTextContrast(previewLayers);

	// Switching tabs is free — each tab keeps its own draft — except Text and
	// Animation/Bild share one foreground layer, so editing one silently
	// drops the other (see state/reducer.ts "set-draft-content").
	function handleTabChange(tab: ContentType) {
		dispatch({ type: "set-active-tab", tab });
	}

	function handleContentChange(
		content: TextContent | AnimationContent | ColorContent,
	) {
		dispatch({ type: "set-draft-content", content });
	}

	return (
		<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 pb-5">
			<h2 className="w-full text-[21px] font-semibold text-[#20201b]">
				Screens anpassen
			</h2>
			<SelectionStatus />
			<TabBar active={activeTab} onChange={handleTabChange} />

			{selection ? (
				<>
					{animationDroppedOnSave && (
						<Warning>
							Beim Speichern wird die Animation entfernt — Animationen sind nur
							für große oder nur für kleine Screens möglich.
						</Warning>
					)}
					{textLowContrast && (
						<Warning>
							Textfarbe und Hintergrundfarbe haben zu wenig Kontrast — der Text
							ist schlecht lesbar.
						</Warning>
					)}
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
								screenKind={selection.kind}
							/>
						)}
						{activeTab === "color" && (
							<BackgroundPanel
								content={current as ColorContent}
								onChange={handleContentChange}
							/>
						)}
					</div>
				</>
			) : (
				<NoSelectionHint />
			)}
		</div>
	);
}

function Warning({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
			{children}
		</div>
	);
}

function NoSelectionHint() {
	return (
		<div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-blue-700 flex flex-col gap-1">
			<h3 className="font-semibold text-sm">Kein Bildschirm ausgewählt</h3>
			<p className="text-xs">
				Wähle einen oder mehrere Screens aus (⇧ Shift-Taste bei Auswahl gedrückt
				halten), um neue Inhalte auf die Screens zu ziehen.
			</p>
		</div>
	);
}

/** Selecting other screens, clearing the selection, and entering or leaving
 * layout mode all drop the current draft(s), so the reducer holds them back
 * as a pending intent until the user says what to do with it here. */
function UnsavedChangesPrompt() {
	const state = useWallState();
	const dispatch = useWallDispatch();
	const { handleApply } = useApplyChanges();

	if (!needsUnsavedConfirmation(state)) {
		return null;
	}

	async function handleSaveAndContinue() {
		const saved = await handleApply();
		if (saved) {
			dispatch({ type: "resolve-intent", commit: true });
		}
	}

	return (
		<UnsavedChangesDialog
			error={state.applyError}
			onSave={handleSaveAndContinue}
			onDiscard={() => dispatch({ type: "resolve-intent", commit: true })}
			onCancel={() => dispatch({ type: "resolve-intent", commit: false })}
		/>
	);
}

/** The draft for this tab, else what the selection already shows, else the
 * tab's default. */
function currentContentFor(
	tab: ContentType,
	state: WallState,
	appliedLayers: ScreenLayers,
): Content {
	const appliedForeground = appliedLayers.foreground;
	switch (tab) {
		case "text":
			return (
				state.draftText ??
				(appliedForeground?.type === "text"
					? appliedForeground
					: defaultContentFor("text"))
			);
		case "animation":
			return (
				state.draftAnimation ??
				(appliedForeground?.type === "animation" &&
				offeredFor(appliedForeground, state.selection)
					? appliedForeground
					: defaultContentFor("animation"))
			);
		case "color":
			return (
				state.draftColor ??
				(appliedLayers.background !== null
					? { type: "color", hex: appliedLayers.background }
					: defaultContentFor("color"))
			);
		default:
			throw new Error(`Unknown content type: ${tab satisfies never}`);
	}
}

/** The colour of whatever text the foreground draws: the text itself, or a
 * weather animation's temperature. */
function textColorOf(
	foreground: ScreenLayers["foreground"],
): string | undefined {
	if (foreground?.type === "text") {
		return foreground.color;
	}
	if (foreground?.type === "animation" && foreground.mode === "weather") {
		return foreground.temperature?.color;
	}
	return undefined;
}

function hasLowTextContrast(layers: ScreenLayers): boolean {
	const textColor = textColorOf(layers.foreground);
	return (
		textColor !== undefined &&
		contrastRatio(textColor, layers.background ?? DEFAULT_BACKGROUND_HEX) <
			MIN_TEXT_CONTRAST
	);
}

/** Whether the Animation/Bild tab can show this content for the selection:
 * Game of Life only on small screens, and nothing moving across a mixed
 * selection (see domain/mapping.ts layersForGroup). */
function offeredFor(
	content: AnimationContent,
	selection: Selection | null,
): boolean {
	if (content.mode === "gameOfLife") {
		return selection?.kind === "small";
	}
	return selection?.kind !== "mixed" || !isMovingAnimation(content);
}

/** Saving a Hintergrund change across a mixed selection drops the moving
 * animation the selection currently shows, since it can't span both kinds. */
function dropsAnimationOnSave(
	state: WallState,
	appliedForeground: ScreenLayers["foreground"],
): boolean {
	return (
		state.selection?.kind === "mixed" &&
		state.draftColor !== null &&
		state.draftText === null &&
		appliedForeground?.type === "animation" &&
		isMovingAnimation(appliedForeground)
	);
}
