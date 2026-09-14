import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { ApiError, apiFetch, type FetchInit } from "../lib/api";

const STORAGE_KEY = "pixel-wall-password";

type AuthState = "checking" | "locked" | "unlocked";

interface AuthContextValue {
	state: AuthState;
	password: string | null;
	signIn: (password: string) => Promise<void>;
	signOut: () => void;
	request: <T>(path: string, init?: FetchInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredPassword(): string | null {
	try {
		return sessionStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function storePassword(password: string | null): void {
	try {
		if (password === null) {
			sessionStorage.removeItem(STORAGE_KEY);
		} else {
			sessionStorage.setItem(STORAGE_KEY, password);
		}
	} catch {
		// Private browsing or blocked storage: stay signed in for this page only.
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [password, setPassword] = useState<string | null>(null);
	const [state, setState] = useState<AuthState>("checking");

	useEffect(() => {
		let cancelled = false;

		async function probe() {
			// An unauthenticated read succeeds only when the backend runs without
			// a password, in which case there is nothing to sign in to.
			try {
				await apiFetch("/api/state", null);
				if (!cancelled) {
					setPassword(null);
					setState("unlocked");
				}
				return;
			} catch (error) {
				if (!(error instanceof ApiError) || error.status !== 401) {
					if (!cancelled) {
						setState("locked");
					}
					return;
				}
			}

			const stored = readStoredPassword();

			if (stored === null) {
				if (!cancelled) {
					setState("locked");
				}
				return;
			}

			try {
				await apiFetch("/api/state", stored);
				if (!cancelled) {
					setPassword(stored);
					setState("unlocked");
				}
			} catch {
				storePassword(null);
				if (!cancelled) {
					setState("locked");
				}
			}
		}

		void probe();

		return () => {
			cancelled = true;
		};
	}, []);

	const signIn = useCallback(async (candidate: string) => {
		await apiFetch("/api/state", candidate);
		storePassword(candidate);
		setPassword(candidate);
		setState("unlocked");
	}, []);

	const signOut = useCallback(() => {
		storePassword(null);
		setPassword(null);
		setState("locked");
	}, []);

	const request = useCallback(
		async <T,>(path: string, init?: FetchInit): Promise<T> => {
			try {
				return await apiFetch<T>(path, password, init);
			} catch (error) {
				if (error instanceof ApiError && error.status === 401) {
					signOut();
				}
				throw error;
			}
		},
		[password, signOut],
	);

	const value = useMemo(
		() => ({ state, password, signIn, signOut, request }),
		[state, password, signIn, signOut, request],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext);

	if (context === null) {
		throw new Error("useAuth must be used inside an AuthProvider");
	}

	return context;
}
