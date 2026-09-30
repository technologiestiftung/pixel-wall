import type { StateResponse } from "../api/types";
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

/**
 * How many local writes have landed for each piece of state that the
 * background poller (`useWallSync`) also overwrites wholesale. A poll started
 * before a local write can resolve after it; tagging the poll with the
 * generation it started at lets `hydrated` tell that response is stale for
 * whatever it would otherwise clobber, instead of blindly reverting a save
 * that already landed — see CONTEXT.md "Client sync".
 */
export interface Generation {
	screens: Record<string, number>;
	layout: Record<string, number>;
}

const EMPTY_GENERATION: Generation = { screens: {}, layout: {} };

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
	/** "Layout bearbeiten" — dragging screens around is a distinct mode from
	 * everyday content editing (see CONTEXT.md "Layout"). */
	layoutEditMode: boolean;
	/** An intent held back pending confirmation, because carrying it out would
	 * discard unsaved changes. Null whenever no dialog is open. */
	pendingIntent: NavigationIntent | null;
	/** See `Generation`. */
	generation: Generation;
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
	layoutEditMode: false,
	pendingIntent: null,
	generation: EMPTY_GENERATION,
};

export type WallAction =
	| { type: "request-intent"; intent: NavigationIntent }
	| { type: "resolve-intent"; commit: boolean }
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
			layers: ScreenLayers;
			specs: ScreenSpec[];
			layout: LayoutPosition[];
	  }
	| { type: "apply-error"; message: string }
	| {
			type: "hydrated";
			specs: ScreenSpec[];
			layout: LayoutPosition[];
			remote: StateResponse["screens"];
			/** The `Generation` snapshot taken when this poll started, so a
			 * response that resolves after a newer local write can be told apart
			 * from a current one. Omitted (rather than defaulted at the call
			 * site) so callers that don't care about the race — tests included —
			 * can leave it out and get the old blind-overwrite behaviour. */
			sinceGeneration?: Generation;
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

		case "discard-draft":
			return {
				...state,
				draftText: null,
				draftAnimation: null,
				draftColor: null,
			};

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
			const screenGeneration = { ...state.generation.screens };
			for (const slot of composite.slots) {
				applied[slot.screenId] = {
					layers: action.layers,
					compositeWidthPx: composite.widthPx,
					compositeHeightPx: composite.heightPx,
					offsetXPx: slot.offsetXPx,
					offsetYPx: slot.offsetYPx,
					bitmap: null,
				};
				screenGeneration[slot.screenId] =
					(screenGeneration[slot.screenId] ?? 0) + 1;
			}
			return {
				...settled(state),
				applied,
				generation: {
					...state.generation,
					screens: screenGeneration,
				},
			};
		}

		case "hydrated":
			return hydrate(state, action);

		case "move-screen":
			return {
				...state,
				layout: state.layout.map((p) =>
					p.screenId === action.screenId
						? { ...p, xMm: action.xMm, yMm: action.yMm }
						: p,
				),
				generation: {
					...state.generation,
					layout: {
						...state.generation.layout,
						[action.screenId]:
							(state.generation.layout[action.screenId] ?? 0) + 1,
					},
				},
			};

		default:
			return state;
	}
}

/**
 * Folds a poll response into state, screen-by-screen (and likewise for
 * layout): anything the poll's `sinceGeneration` snapshot shows as unchanged
 * since it started is safe to overwrite with the response, but anything with
 * a newer generation had a local write land while the poll was in flight, so
 * the (by now stale) response is dropped for just that piece — see
 * `Generation`.
 */
function hydrate(
	state: WallState,
	action: Extract<WallAction, { type: "hydrated" }>,
): WallState {
	// Old call sites (and tests) that don't care about the race can omit this
	// and get the pre-guard, always-overwrite behaviour.
	const since = action.sinceGeneration ?? EMPTY_GENERATION;

	const applied: Record<string, AppliedRender> = {};
	for (const [screenId, entry] of Object.entries(action.remote)) {
		const stale =
			(state.generation.screens[screenId] ?? 0) !==
			(since.screens[screenId] ?? 0);
		applied[screenId] = stale
			? (state.applied[screenId] ?? hydrateScreen(entry))
			: hydrateScreen(entry);
	}

	const layout = action.layout.map((remote) => {
		const stale =
			(state.generation.layout[remote.screenId] ?? 0) !==
			(since.layout[remote.screenId] ?? 0);
		if (!stale) {
			return remote;
		}
		return state.layout.find((p) => p.screenId === remote.screenId) ?? remote;
	});

	return {
		...state,
		specs: action.specs,
		layout,
		applied,
		syncStatus: "ready",
	};
}

/** One screen as the server has it. With layers we can rebuild the picture —
 * and animate it, which a flat frame could never do; without them (a state
 * file written before layers) the flattened frame is all there is. */
function hydrateScreen(entry: StateResponse["screens"][string]): AppliedRender {
	// gameOfLife has no real height to report — like compositeWidthOf, this
	// is never actually consulted for it (ContentLayer.tsx renders its own
	// placeholder before sizing off this).
	const compositeHeightPx =
		entry.content.format === "gameOfLife" ? 32 : entry.content.heightPx;
	return {
		layers: entry.source ?? EMPTY_LAYERS,
		compositeWidthPx: compositeWidthOf(entry.content),
		compositeHeightPx,
		offsetXPx: entry.window.offsetXPx,
		offsetYPx: entry.window.offsetYPx,
		bitmap: entry.source ? null : wireToDataUrl(entry.content),
	};
}

/** The state every successful save lands in: nothing left unsaved, because
 * the wall now holds what the draft held. Clearing the drafts here (rather
 * than leaving them and relying on them folding back to a no-op diff against
 * the newly-applied layers) is what keeps `draftHasChanges` correctly `false`
 * even if `applied` is later touched by something else, like a stale poll
 * response for an unrelated screen. */
function settled(state: WallState): WallState {
	return {
		...state,
		draftText: null,
		draftAnimation: null,
		draftColor: null,
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
	// "Verwerfen": the draft(s) are what the user chose to give up.
	return applyIntent(
		{
			...cleared,
			draftText: null,
			draftAnimation: null,
			draftColor: null,
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
