import type { StateResponse } from "../api/types";
import { computeDisplayComposite, validateSelection } from "../domain/mapping";
import { DEFAULT_LAYOUT, PITCH_MM_PER_PX, SCREEN_SPECS, specById } from "../domain/layout";
import type { Content, ContentType, LayoutPosition, ScreenSpec, Selection } from "../domain/types";

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
			/** Server-hydrated: a static bitmap at its own natural size — no
			 * composite dimensions needed, CSS just uses the image's intrinsic
			 * size (see render/ContentLayer.tsx). */
			source: "remote";
			bitmap: string;
			offsetXPx: number;
			offsetYPx: number;
	  };

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
	/** "Layout bearbeiten" — dragging screens around is a distinct mode from
	 * everyday content editing (see CONTEXT.md "Layout"). */
	layoutEditMode: boolean;
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
	layoutEditMode: false,
};

export type WallAction =
	| { type: "toggle-screen"; screenId: string; additive: boolean }
	| { type: "clear-selection" }
	| { type: "set-active-tab"; tab: ContentType }
	| { type: "set-draft-content"; content: Content }
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
	  }
	| { type: "apply-error"; message: string }
	| { type: "hydrated"; specs: ScreenSpec[]; layout: LayoutPosition[]; remote: StateResponse["screens"] }
	| { type: "toggle-layout-edit-mode" }
	| { type: "move-screen"; screenId: string; xMm: number; yMm: number };

export function wallReducer(state: WallState, action: WallAction): WallState {
	switch (action.type) {
		case "clear-selection":
			return { ...state, selection: null, draft: null };

		case "set-active-tab":
			return { ...state, activeTab: action.tab };

		case "set-draft-content":
			return { ...state, draft: action.content };

		case "discard-draft":
			return { ...state, draft: null };

		case "apply-pending":
			return { ...state, applyStatus: "pending", applyError: null };

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
			return { ...state, applied, applyStatus: "idle", applyError: null };
		}

		case "hydrated": {
			const applied: Record<string, AppliedRender> = {};
			for (const [screenId, entry] of Object.entries(action.remote)) {
				applied[screenId] = {
					source: "remote",
					bitmap: entry.content.bitmap,
					offsetXPx: entry.geometry.offsetXPx,
					offsetYPx: entry.geometry.offsetYPx,
				};
			}
			return {
				...state,
				specs: action.specs,
				layout: action.layout,
				applied,
				syncStatus: "ready",
			};
		}

		case "toggle-screen": {
			const { screenId, additive } = action;
			const { kind } = specById(state.specs, screenId);

			// Plain click always selects just this screen, deselecting any
			// others — shift+click is required to build a multi-selection.
			if (!additive) {
				return { ...state, selection: { kind, screenIds: [screenId] }, draft: null };
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
				return { ...state, selection: { kind, screenIds: attempted }, draft: null };
			}

			// Adding this screen to the current selection isn't valid (different
			// kind, or breaks contiguity) — ignore the shift+click rather than
			// silently replacing what the user was deliberately building up.
			return state;
		}

		case "toggle-layout-edit-mode":
			return { ...state, layoutEditMode: !state.layoutEditMode, selection: null, draft: null };

		case "move-screen":
			return {
				...state,
				layout: state.layout.map((p) => (p.screenId === action.screenId ? { ...p, xMm: action.xMm, yMm: action.yMm } : p)),
			};

		default:
			return state;
	}
}
