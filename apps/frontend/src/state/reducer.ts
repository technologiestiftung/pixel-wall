import type { BrightnessDto, StateResponse } from "../api/types";
import { computeDisplayComposite, validateSelection } from "../domain/mapping";
import {
	DEFAULT_LAYOUT,
	PITCH_MM_PER_PX,
	SCREEN_SPECS,
	specById,
} from "../domain/layout";
import type {
	Content,
	ContentType,
	LayoutPosition,
	ScreenKind,
	ScreenSpec,
	Selection,
} from "../domain/types";
import { wireToDataUrl } from "../render/wire";
import { draftHasChanges } from "./selectors";

export type AppliedRender =
	| {
			source: "local";
			content: Content;
			compositeWidthPx: number;
			compositeHeightPx: number;
			offsetXPx: number;
			offsetYPx: number;
	  }
	| {
			/** Server-hydrated: a wire payload decoded to a data URL at its own
			 * natural size — no composite dimensions needed, CSS just uses the
			 * image's intrinsic size (see render/ContentLayer.tsx). */
			source: "remote";
			bitmap: string;
			offsetXPx: number;
			offsetYPx: number;
	  };

/**
 * Something the user asked for that would throw away the current draft —
 * every one of these clears it (see `applyIntent`). They are routed through
 * `request-intent` rather than dispatched directly so the confirmation is in
 * one place instead of at each button.
 */
export type NavigationIntent =
	| { kind: "set-active-tab"; tab: ContentType }
	| { kind: "toggle-screen"; screenId: string; additive: boolean }
	| { kind: "clear-selection" }
	| { kind: "toggle-layout-edit-mode" };

export interface WallState {
	specs: ScreenSpec[];
	layout: LayoutPosition[];
	selection: Selection | null;
	activeTab: ContentType;
	/** In-progress, not-yet-applied edit for the current selection — see CONTEXT.md "Content". */
	draft: Content | null;
	applied: Record<string, AppliedRender>;
	syncStatus: "loading" | "ready";
	applyStatus: "idle" | "pending" | "error";
	applyError: string | null;
	/** "Vorschau": the draft has been pushed to the real panels without being
	 * saved. Until it is reverted (or superseded by a save) the wall is showing
	 * something the state file does not contain. */
	previewStatus: "idle" | "pending" | "active" | "error";
	previewError: string | null;
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
	draft: null,
	applied: {},
	syncStatus: "loading",
	applyStatus: "idle",
	applyError: null,
	previewStatus: "idle",
	previewError: null,
	brightness: { small: 60, large: 60 },
	draftBrightness: null,
	layoutEditMode: false,
	pendingIntent: null,
};

export type WallAction =
	| { type: "request-intent"; intent: NavigationIntent }
	| { type: "resolve-intent"; commit: boolean }
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
			content: Content;
			specs: ScreenSpec[];
			layout: LayoutPosition[];
			brightness: BrightnessDto;
	  }
	| { type: "brightness-applied"; brightness: BrightnessDto }
	| { type: "apply-error"; message: string }
	| {
			type: "set-preview";
			status: WallState["previewStatus"];
			message?: string;
	  }
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
			// Nothing to lose means no dialog: selecting screens and flipping
			// between tabs has to stay a free action while the panel is
			// untouched, or every click would cost a confirmation.
			return draftHasChanges(state)
				? { ...state, pendingIntent: action.intent }
				: applyIntent(state, action.intent);

		case "resolve-intent": {
			const intent = state.pendingIntent;
			if (intent === null) {
				return state;
			}
			const cleared = { ...state, pendingIntent: null };
			// "Verwerfen": the draft is what the user chose to give up, so it
			// goes along with the brightness edit that shares the same button.
			return action.commit
				? applyIntent(
						{ ...cleared, draft: null, draftBrightness: null },
						intent,
					)
				: cleared;
		}

		case "set-preview":
			return {
				...state,
				previewStatus: action.status,
				previewError: action.message ?? null,
			};

		case "set-draft-content":
			return { ...state, draft: action.content };

		case "set-draft-brightness":
			return {
				...state,
				draftBrightness: {
					...(state.draftBrightness ?? state.brightness),
					[action.kind]: action.value,
				},
			};

		case "discard-draft":
			return { ...state, draft: null, draftBrightness: null };

		case "apply-pending":
			return { ...state, applyStatus: "pending", applyError: null };

		case "brightness-applied":
			return {
				...state,
				brightness: action.brightness,
				draftBrightness: null,
				applyStatus: "idle",
				applyError: null,
				previewStatus: "idle",
				previewError: null,
			};

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
					source: "local",
					content: action.content,
					compositeWidthPx: composite.widthPx,
					compositeHeightPx: composite.heightPx,
					offsetXPx: slot.offsetXPx,
					offsetYPx: slot.offsetYPx,
				};
			}
			return {
				...state,
				applied,
				brightness: action.brightness,
				draftBrightness: null,
				applyStatus: "idle",
				applyError: null,
				previewStatus: "idle",
				previewError: null,
			};
		}

		case "hydrated": {
			const applied: Record<string, AppliedRender> = {};
			for (const [screenId, entry] of Object.entries(action.remote)) {
				applied[screenId] = {
					source: "remote",
					bitmap: wireToDataUrl(entry.content),
					offsetXPx: entry.window.offsetXPx,
					offsetYPx: entry.window.offsetYPx,
				};
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

/** Carries out an intent once it is allowed to discard the draft. */
function applyIntent(state: WallState, intent: NavigationIntent): WallState {
	switch (intent.kind) {
		case "set-active-tab":
			return { ...state, activeTab: intent.tab };

		case "toggle-screen":
			return toggleScreen(state, intent.screenId, intent.additive);

		case "clear-selection":
			return { ...state, selection: null, draft: null, draftBrightness: null };

		case "toggle-layout-edit-mode":
			return {
				...state,
				layoutEditMode: !state.layoutEditMode,
				selection: null,
				draft: null,
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
			draft: null,
		};
	}

	const current = state.selection?.screenIds ?? [];

	// Shift+clicking an already-selected screen removes it.
	if (current.includes(screenId)) {
		const remaining = current.filter((id) => id !== screenId);
		return {
			...state,
			selection: remaining.length > 0 ? { kind, screenIds: remaining } : null,
			draft: null,
		};
	}

	const attempted = [...current, screenId];
	const validation = validateSelection(state.specs, state.layout, attempted);
	if (validation.valid) {
		return {
			...state,
			selection: { kind, screenIds: attempted },
			draft: null,
		};
	}

	// Adding this screen to the current selection isn't valid (different
	// kind, or breaks contiguity) — ignore the shift+click rather than
	// silently replacing what the user was deliberately building up.
	return state;
}
