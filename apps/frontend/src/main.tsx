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

// There is no real backend yet (see CONTEXT.md "Rendering split" / the
// Phase 3 plan) — a mock service worker stands in for it everywhere,
// not just in dev, so the app is always exercised against a real network
// round-trip rather than only when a backend happens to be running.
async function startMocking() {
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

startMocking().then(render);
