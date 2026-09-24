import type { BrightnessDto, StateResponse } from "../api/types";
import { computeDisplayComposite, validateSelection } from "../domain/mapping";
import {
	DEFAULT_LAYOUT,
	PITCH_MM_PER_PX,
	SCREEN_SPECS,
	specById,
} from "../domain/layout";
import type {
	AnimationContent,
	Content,
	ColorContent,
	ContentType,
	LayoutPosition,
	ScreenKind,
	ScreenLayers,
	ScreenSpec,
	Selection,
	TextContent,
} from "../domain/types";
import { EMPTY_LAYERS } from "../domain/types";
import { compositeWidthOf, wireToDataUrl } from "../render/wire";
import { draftHasChanges } from "./selectors";

/**
 * What one screen is showing. `layers` is the editable truth — a background
 * colour and at most one foreground — and the geometry places this screen's
 * window into the foreground's composite.
 *
 * `bitmap` is the fallback for a screen hydrated without layers: a state file
 * written before layers existed knows only the flattened frame, so the tile
 * shows that picture and the next edit starts from a blank background.
 */
export interface AppliedRender {
	layers: ScreenLayers;
	compositeWidthPx: number;
	compositeHeightPx: number;
	offsetXPx: number;
	offsetYPx: number;
	bitmap: string | null;
}

/**
 * Something the user asked for that would throw away the current draft(s) —
 * every one of these clears them (see `applyIntent`). They are routed
 * through `request-intent` rather than dispatched directly so the
 * confirmation is in one place instead of at each button. Switching content
 * tabs is *not* one of these — see `WallState.draftText`/`draftAnimation`/
 * `draftColor` and CONTEXT.md "Unsaved changes".
 */
export type NavigationIntent =
	| { kind: "toggle-screen"; screenId: string; additive: boolean }
	| { kind: "clear-selection" }
	| { kind: "toggle-layout-edit-mode" };

export interface WallState {
	specs: ScreenSpec[];
	layout: LayoutPosition[];
	selection: Selection | null;
	activeTab: ContentType;
	/**
	 * In-progress, not-yet-applied edits for the current selection — see
	 * CONTEXT.md "Content". Text and Animation/Bild both write the same
	 * foreground layer, so at most one of `draftText`/`draftAnimation` is ever
	 * set — `set-draft-content` clears the other one. `draftColor` (the
	 * background layer) is independent of both.
	 */
	draftText: TextContent | null;
	draftAnimation: AnimationContent | null;
	draftColor: ColorContent | null;
	applied: Record<string, AppliedRender>;
	syncStatus: "loading" | "ready";
	applyStatus: "idle" | "pending" | "error";
	applyError: string | null;
	/** Per hardware kind, not per screen — the panel drivers expose brightness
	 * as a whole-canvas property. `draftBrightness` is the unsaved edit. */
	brightness: BrightnessDto;
	draftBrightness: BrightnessDto | null;
	/** "Layout bearbeiten" — dragging screens around is a distinct mode from
	 * everyday content editing (see CONTEXT.md "Layout"). */
	layoutEditMode: boolean;
	/** An intent held back pending confirmation, because carrying it out would
	 * discard unsaved changes. Null whenever no dialog is open. */
	pendingIntent: NavigationIntent | null;
}

export const initialWallState: WallState = {
	specs: SCREEN_SPECS,
	layout: DEFAULT_LAYOUT,
	selection: null,
	activeTab: "text",
	draftText: null,
	draftAnimation: null,
	draftColor: null,
	applied: {},
	syncStatus: "loading",
	applyStatus: "idle",
	applyError: null,
	brightness: { small: 60, large: 60 },
	draftBrightness: null,
	layoutEditMode: false,
	pendingIntent: null,
};

export type WallAction =
	| { type: "request-intent"; intent: NavigationIntent }
	| { type: "resolve-intent"; commit: boolean }
	| { type: "set-active-tab"; tab: ContentType }
	| { type: "set-draft-content"; content: Content }
	| { type: "set-draft-brightness"; kind: ScreenKind; value: number }
	| { type: "discard-draft" }
	| { type: "apply-pending" }
	| {
			type: "apply-success";
			// Captured at request-build time, not re-read from current state —
			// the selection (or the layout, in a future drag-to-rearrange
			// world) may have changed while the request was in flight.
			selection: Selection;
			layers: ScreenLayers;
			specs: ScreenSpec[];
			layout: LayoutPosition[];
			brightness: BrightnessDto;
	  }
	| { type: "brightness-applied"; brightness: BrightnessDto }
	| { type: "apply-error"; message: string }
	| {
			type: "hydrated";
			specs: ScreenSpec[];
			layout: LayoutPosition[];
			remote: StateResponse["screens"];
			brightness: BrightnessDto;
	  }
	| { type: "move-screen"; screenId: string; xMm: number; yMm: number };

export function wallReducer(state: WallState, action: WallAction): WallState {
	switch (action.type) {
		case "request-intent":
			// Nothing to lose means no dialog: selecting screens has to stay a
			// free action while the panel is untouched, or every click would
			// cost a confirmation.
			return draftHasChanges(state)
				? { ...state, pendingIntent: action.intent }
				: applyIntent(state, action.intent);

		case "resolve-intent":
			return resolveIntent(state, action.commit);

		case "set-active-tab":
			// Free, unlike the NavigationIntents above: each tab keeps its own
			// draft (see WallState.draftText/draftAnimation/draftColor), so
			// nothing is at risk of being silently lost by switching.
			return { ...state, activeTab: action.tab };

		case "set-draft-content":
			return setDraftContent(state, action.content);

		case "set-draft-brightness":
			return {
				...state,
				draftBrightness: {
					...(state.draftBrightness ?? state.brightness),
					[action.kind]: action.value,
				},
			};

		case "discard-draft":
			return {
				...state,
				draftText: null,
				draftAnimation: null,
				draftColor: null,
				draftBrightness: null,
			};

		case "apply-pending":
			return { ...state, applyStatus: "pending", applyError: null };

		case "brightness-applied":
			return { ...settled(state), brightness: action.brightness };

		case "apply-error":
			return { ...state, applyStatus: "error", applyError: action.message };

		case "apply-success": {
			const devicePxPerMm = 1 / PITCH_MM_PER_PX[action.selection.kind];
			const composite = computeDisplayComposite(
				{ specs: action.specs, positions: action.layout },
				action.selection,
				devicePxPerMm,
			);
			const applied = { ...state.applied };
			for (const slot of composite.slots) {
				applied[slot.screenId] = {
					layers: action.layers,
					compositeWidthPx: composite.widthPx,
					compositeHeightPx: composite.heightPx,
					offsetXPx: slot.offsetXPx,
					offsetYPx: slot.offsetYPx,
					bitmap: null,
				};
			}
			return { ...settled(state), applied, brightness: action.brightness };
		}

		case "hydrated": {
			const applied: Record<string, AppliedRender> = {};
			for (const [screenId, entry] of Object.entries(action.remote)) {
				applied[screenId] = hydrateScreen(entry);
			}
			return {
				...state,
				specs: action.specs,
				layout: action.layout,
				applied,
				brightness: action.brightness,
				syncStatus: "ready",
			};
		}

		case "move-screen":
			return {
				...state,
				layout: state.layout.map((p) =>
					p.screenId === action.screenId
						? { ...p, xMm: action.xMm, yMm: action.yMm }
						: p,
				),
			};

		default:
			return state;
	}
}

/** One screen as the server has it. With layers we can rebuild the picture —
 * and animate it, which a flat frame could never do; without them (a state
 * file written before layers) the flattened frame is all there is. */
function hydrateScreen(entry: StateResponse["screens"][string]): AppliedRender {
	return {
		layers: entry.source ?? EMPTY_LAYERS,
		compositeWidthPx: compositeWidthOf(entry.content),
		compositeHeightPx: entry.content.heightPx,
		offsetXPx: entry.window.offsetXPx,
		offsetYPx: entry.window.offsetYPx,
		bitmap: entry.source ? null : wireToDataUrl(entry.content),
	};
}

/** The state every successful save lands in: nothing left unsaved, because
 * the wall now holds what the draft held. */
function settled(state: WallState): WallState {
	return {
		...state,
		draftBrightness: null,
		applyStatus: "idle",
		applyError: null,
	};
}

/** Carries out (or cancels) whatever was held back by "request-intent". */
function resolveIntent(state: WallState, commit: boolean): WallState {
	const intent = state.pendingIntent;
	if (intent === null) {
		return state;
	}
	const cleared = { ...state, pendingIntent: null };
	if (!commit) {
		return cleared;
	}
	// "Verwerfen": the draft(s) are what the user chose to give up, so they go
	// along with the brightness edit that shares the same button.
	return applyIntent(
		{
			...cleared,
			draftText: null,
			draftAnimation: null,
			draftColor: null,
			draftBrightness: null,
		},
		intent,
	);
}

/** Text and Animation/Bild are the same foreground layer, so drafting one has
 * to give up whatever was drafted for the other — there is no way to
 * reconcile them into a single foreground. */
function setDraftContent(state: WallState, content: Content): WallState {
	if (content.type === "text") {
		return { ...state, draftText: content, draftAnimation: null };
	}
	if (content.type === "animation") {
		return { ...state, draftAnimation: content, draftText: null };
	}
	return { ...state, draftColor: content };
}

/** Carries out an intent once it is allowed to discard the draft(s). */
function applyIntent(state: WallState, intent: NavigationIntent): WallState {
	switch (intent.kind) {
		case "toggle-screen":
			return toggleScreen(state, intent.screenId, intent.additive);

		case "clear-selection":
			return {
				...state,
				selection: null,
				draftText: null,
				draftAnimation: null,
				draftColor: null,
				draftBrightness: null,
			};

		case "toggle-layout-edit-mode":
			return {
				...state,
				layoutEditMode: !state.layoutEditMode,
				selection: null,
				draftText: null,
				draftAnimation: null,
				draftColor: null,
			};

		default:
			return state;
	}
}

/** Plain click always selects just this screen; shift+click builds a
 * multi-selection, and shift+clicking a selected screen removes it. */
function toggleScreen(
	state: WallState,
	screenId: string,
	additive: boolean,
): WallState {
	const { kind } = specById(state.specs, screenId);

	// Plain click always selects just this screen, deselecting any others —
	// shift+click is required to build a multi-selection.
	if (!additive) {
		return {
			...state,
			selection: { kind, screenIds: [screenId] },
			draftText: null,
			draftAnimation: null,
			draftColor: null,
		};
	}

	const current = state.selection?.screenIds ?? [];

	// Shift+clicking an already-selected screen removes it.
	if (current.includes(screenId)) {
		const remaining = current.filter((id) => id !== screenId);
		return {
			...state,
			selection: remaining.length > 0 ? { kind, screenIds: remaining } : null,
			draftText: null,
			draftAnimation: null,
			draftColor: null,
		};
	}

	const attempted = [...current, screenId];
	const validation = validateSelection(state.specs, state.layout, attempted);
	if (validation.valid) {
		return {
			...state,
			selection: { kind, screenIds: attempted },
			draftText: null,
			draftAnimation: null,
			draftColor: null,
		};
	}

	// Adding this screen to the current selection isn't valid (different
	// kind, or breaks contiguity) — ignore the shift+click rather than
	// silently replacing what the user was deliberately building up.
	return state;
}
