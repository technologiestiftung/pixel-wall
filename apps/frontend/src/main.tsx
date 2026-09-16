import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

function render() {
	const root = document.getElementById("root");

	if (!root) {
		return;
	}

	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

/**
 * The mock backend is opt-in and development-only: run with `VITE_USE_MOCKS=1`
 * to work on the UI without a backend. It used to start unconditionally, which
 * put ~293 KB of mock service worker into the production bundle and meant the
 * app could never reach the real wall.
 */
const USE_MOCKS = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === "1";

async function startMocking() {
	if (!USE_MOCKS) {
		return;
	}
	try {
		const { worker } = await import("./api/mocks/browser");
		await worker.start({ onUnhandledRequest: "bypass" });
	} catch (error) {
		// Service workers are unavailable in some contexts (older browsers,
		// certain embedded/sandboxed views). The app must still render —
		// useWallSync already falls back to local defaults when the network
		// layer is unreachable.
		console.warn(
			"Mock service worker failed to start; falling back to a real network call.",
			error,
		);
	}
}

void startMocking().then(render);
