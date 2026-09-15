import {
	createContext,
	useContext,
	useReducer,
	type Dispatch,
	type ReactNode,
} from "react";
import {
	initialWallState,
	wallReducer,
	type WallAction,
	type WallState,
} from "./reducer";
import { useWallSync } from "./useWallSync";

const WallStateContext = createContext<WallState | null>(null);
const WallDispatchContext = createContext<Dispatch<WallAction> | null>(null);

export function WallProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(wallReducer, initialWallState);
	useWallSync(dispatch);

	return (
		<WallStateContext.Provider value={state}>
			<WallDispatchContext.Provider value={dispatch}>
				{children}
			</WallDispatchContext.Provider>
		</WallStateContext.Provider>
	);
}

export function useWallState(): WallState {
	const context = useContext(WallStateContext);
	if (!context) {
		throw new Error("useWallState must be used within a WallProvider");
	}
	return context;
}

export function useWallDispatch(): Dispatch<WallAction> {
	const context = useContext(WallDispatchContext);
	if (!context) {
		throw new Error("useWallDispatch must be used within a WallProvider");
	}
	return context;
}
