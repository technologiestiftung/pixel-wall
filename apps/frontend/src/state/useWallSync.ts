import { useEffect, useRef, type Dispatch } from "react";
import { getLayout, getScreens, getState, type Requester } from "../api/wall";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../domain/layout";
import type { Generation, WallAction } from "./reducer";

const POLL_INTERVAL_MS = 20_000;

/**
 * Hydrates wall state from the backend on mount, then keeps it in sync via
 * lightweight polling (on window focus, and on a fixed interval) rather
 * than a live push channel — see CONTEXT.md "Client sync". Falls back to
 * the local defaults if the backend is unreachable, so the app still
 * renders something sensible offline.
 */
export function useWallSync(
	dispatch: Dispatch<WallAction>,
	request: Requester,
	generation: Generation,
) {
	// Kept out of the effect's dependencies on purpose: reading the latest
	// generation through a ref lets `sync` see it fresh at call time without
	// tearing down and restarting the poll interval on every local save.
	const generationRef = useRef(generation);
	generationRef.current = generation;

	useEffect(() => {
		let cancelled = false;

		async function sync() {
			// Snapshot before the request goes out, not after it resolves — a
			// local write that lands while this request is in flight must be
			// able to out-rank the (by then stale) response, not the other way
			// around.
			const sinceGeneration = generationRef.current;
			try {
				const [screens, layout, state] = await Promise.all([
					getScreens(request),
					getLayout(request),
					getState(request),
				]);
				if (cancelled) {
					return;
				}
				dispatch({
					type: "hydrated",
					specs: screens.screens,
					layout: layout.positions,
					remote: state.screens,
					brightness: state.brightness,
					sinceGeneration,
				});
			} catch {
				if (!cancelled) {
					dispatch({
						type: "hydrated",
						specs: SCREEN_SPECS,
						layout: DEFAULT_LAYOUT,
						remote: {},
						brightness: { small: 60, large: 60 },
						sinceGeneration,
					});
				}
			}
		}

		void sync();
		const interval = setInterval(sync, POLL_INTERVAL_MS);
		window.addEventListener("focus", sync);

		return () => {
			cancelled = true;
			clearInterval(interval);
			window.removeEventListener("focus", sync);
		};
	}, [dispatch, request]);
}
