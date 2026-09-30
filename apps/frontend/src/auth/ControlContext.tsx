import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { claimControl } from "../api/wall";
import { sessionId } from "../lib/session";
import { useAuth } from "./AuthContext";

/** Well inside the backend's 30 s lease (LEDWALL_CONTROL_TTL_S). */
const HEARTBEAT_MS = 10_000;

interface ControlContextValue {
	/** Whether this tab may change the wall. Everyone else can only watch. */
	isController: boolean;
	takeOver: () => Promise<void>;
	takingOver: boolean;
}

// Without a provider (e.g. component tests) the editor behaves as before.
const ControlContext = createContext<ControlContextValue>({
	isController: true,
	takeOver: async () => {},
	takingOver: false,
});

export function ControlProvider({ children }: { children: ReactNode }) {
	const { request } = useAuth();
	const [isController, setIsController] = useState(true);
	const [takingOver, setTakingOver] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function heartbeat() {
			try {
				const { controller } = await claimControl(request, sessionId());
				if (!cancelled) {
					setIsController(controller);
				}
			} catch {
				// An unreachable wall is surfaced by the sync itself; keep the
				// last known answer rather than flicker the warning.
			}
		}

		void heartbeat();
		const interval = setInterval(heartbeat, HEARTBEAT_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [request]);

	const takeOver = useCallback(async () => {
		setTakingOver(true);
		try {
			const { controller } = await claimControl(request, sessionId(), true);
			setIsController(controller);
		} finally {
			setTakingOver(false);
		}
	}, [request]);

	const value = useMemo(
		() => ({ isController, takeOver, takingOver }),
		[isController, takeOver, takingOver],
	);

	return (
		<ControlContext.Provider value={value}>{children}</ControlContext.Provider>
	);
}

export function useControl(): ControlContextValue {
	return useContext(ControlContext);
}
