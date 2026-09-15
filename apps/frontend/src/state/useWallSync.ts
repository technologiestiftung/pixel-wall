import { useEffect, type Dispatch } from "react";
import { getLayout, getScreens, getState } from "../api/client";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../domain/layout";
import type { WallAction } from "./reducer";

const POLL_INTERVAL_MS = 20_000;

/**
 * Hydrates wall state from the backend on mount, then keeps it in sync via
 * lightweight polling (on window focus, and on a fixed interval) rather
 * than a live push channel — see CONTEXT.md "Client sync". Falls back to
 * the local defaults if the backend/mock is unreachable, so the app still
 * renders something sensible offline.
 */
export function useWallSync(dispatch: Dispatch<WallAction>) {
	useEffect(() => {
		let cancelled = false;

		async function sync() {
			try {
				const [screens, layout, state] = await Promise.all([
					getScreens(),
					getLayout(),
					getState(),
				]);
				if (cancelled) {
					return;
				}
				dispatch({
					type: "hydrated",
					specs: screens.screens,
					layout: layout.positions,
					remote: state.screens,
				});
			} catch {
				if (!cancelled) {
					dispatch({
						type: "hydrated",
						specs: SCREEN_SPECS,
						layout: DEFAULT_LAYOUT,
						remote: {},
					});
				}
			}
		}

		sync();
		const interval = setInterval(sync, POLL_INTERVAL_MS);
		window.addEventListener("focus", sync);

		return () => {
			cancelled = true;
			clearInterval(interval);
			window.removeEventListener("focus", sync);
		};
	}, [dispatch]);
}
