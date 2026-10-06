import { useEffect, useRef, type Dispatch } from "react";
import {
	getScreens,
	getState,
	waitForChange,
	type Requester,
} from "../api/wall";
import { SCREEN_SPECS } from "../domain/layout";
import type { Generation, WallAction } from "./reducer";

const POLL_INTERVAL_MS = 20_000;
/** Pause before re-opening the live-sync long poll after it failed (backend
 * down, network gone), so an unreachable wall isn't hammered. */
const LIVE_RETRY_MS = 5_000;

/**
 * Hydrates wall state from the backend on mount, then keeps it in sync live:
 * a long poll on `/api/changes` re-syncs as soon as anyone changes the wall
 * (see CONTEXT.md "Client sync" and
 * docs/adr/0005-live-sync-via-long-polling.md). Window focus and a slow
 * interval still re-sync too, as a fallback for when the long poll is down.
 * Falls back to the local defaults if the backend is unreachable, so the app
 * still renders something sensible offline.
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
				const [screens, state] = await Promise.all([
					getScreens(request),
					getState(request),
				]);
				if (cancelled) {
					return;
				}
				dispatch({
					type: "hydrated",
					specs: screens.screens,
					remote: state.screens,
					sinceGeneration,
				});
			} catch {
				if (!cancelled) {
					dispatch({
						type: "hydrated",
						specs: SCREEN_SPECS,
						remote: {},
						sinceGeneration,
					});
				}
			}
		}

		const liveAbort = new AbortController();

		async function watchLive() {
			let since: number | null = null;
			while (!cancelled) {
				try {
					const { revision } = await waitForChange(
						request,
						since,
						liveAbort.signal,
					);
					if (cancelled) {
						return;
					}
					if (since !== null && revision !== since) {
						void sync();
					}
					since = revision;
				} catch {
					if (cancelled) {
						return;
					}
					await new Promise((resolve) => setTimeout(resolve, LIVE_RETRY_MS));
				}
			}
		}

		void sync();
		void watchLive();
		const interval = setInterval(sync, POLL_INTERVAL_MS);
		window.addEventListener("focus", sync);

		return () => {
			cancelled = true;
			liveAbort.abort();
			clearInterval(interval);
			window.removeEventListener("focus", sync);
		};
	}, [dispatch, request]);
}
