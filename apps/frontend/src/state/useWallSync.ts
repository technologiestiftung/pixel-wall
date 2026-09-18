import { useEffect, type Dispatch } from "react";
import {
	getLayout,
	getScreens,
	getState,
	revertPreview,
	type Requester,
} from "../api/wall";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../domain/layout";
import type { WallAction } from "./reducer";

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
) {
	useEffect(() => {
		let cancelled = false;

		async function sync() {
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
				});
			} catch {
				if (!cancelled) {
					dispatch({
						type: "hydrated",
						specs: SCREEN_SPECS,
						layout: DEFAULT_LAYOUT,
						remote: {},
						brightness: { small: 60, large: 60 },
					});
				}
			}
		}

		// A preview left behind by a previous session (reload, crashed tab) is
		// still on the panels, and nothing else will ever revert it: this
		// session has no record of it, so the wall would keep showing unsaved
		// content indefinitely.
		void revertPreview(request).catch(() => undefined);

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
