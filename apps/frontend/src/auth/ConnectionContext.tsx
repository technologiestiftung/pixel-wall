import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { apiFetch, type FetchInit } from "../lib/api";

const RETRY_MS = 5_000;

export type ConnectionState = "checking" | "connected" | "disconnected";

interface ConnectionContextValue {
	state: ConnectionState;
	request: <T>(path: string, init?: FetchInit) => Promise<T>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<ConnectionState>("checking");

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		// There is no login step anymore — the backend runs unauthenticated.
		// /api/health only tells us whether the Pi can be reached at all, so a
		// failure here (off, or on a different network) keeps retrying rather
		// than asking for credentials that do nothing.
		async function probe() {
			try {
				await apiFetch("/api/health");
				if (!cancelled) {
					setState("connected");
				}
			} catch {
				if (!cancelled) {
					setState("disconnected");
					timer = setTimeout(probe, RETRY_MS);
				}
			}
		}

		void probe();

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, []);

	const request = useCallback(
		<T,>(path: string, init?: FetchInit): Promise<T> => apiFetch<T>(path, init),
		[],
	);

	const value = useMemo(() => ({ state, request }), [state, request]);

	return (
		<ConnectionContext.Provider value={value}>
			{children}
		</ConnectionContext.Provider>
	);
}

export function useConnection(): ConnectionContextValue {
	const context = useContext(ConnectionContext);

	if (context === null) {
		throw new Error("useConnection must be used inside a ConnectionProvider");
	}

	return context;
}
