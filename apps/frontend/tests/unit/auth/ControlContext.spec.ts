// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Requester } from "../../../src/api/wall";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const request = (async () => undefined) as unknown as Requester;

vi.mock("../../../src/api/wall", () => ({ claimControl: vi.fn() }));
vi.mock("../../../src/auth/AuthContext", () => ({
	useAuth: () => ({ request }),
}));

const { claimControl } = await import("../../../src/api/wall");
const { ControlProvider, useControl } = await import(
	"../../../src/auth/ControlContext"
);

let latest: ReturnType<typeof useControl> | null = null;

function Probe() {
	latest = useControl();
	return null;
}

describe("ControlProvider", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.useRealTimers();
		vi.mocked(claimControl).mockReset();
		latest = null;
	});

	async function mount() {
		await act(async () => {
			root.render(createElement(ControlProvider, null, createElement(Probe)));
		});
	}

	test("becomes a watcher when another session holds control", async () => {
		vi.mocked(claimControl).mockResolvedValue({ controller: false });
		await mount();
		expect(latest?.isController).toBe(false);
	});

	test("heartbeat notices when control was taken away", async () => {
		vi.mocked(claimControl).mockResolvedValue({ controller: true });
		await mount();
		expect(latest?.isController).toBe(true);

		vi.mocked(claimControl).mockResolvedValue({ controller: false });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(latest?.isController).toBe(false);
	});

	test("take over claims control with the takeover flag", async () => {
		vi.mocked(claimControl).mockResolvedValue({ controller: false });
		await mount();

		vi.mocked(claimControl).mockResolvedValue({ controller: true });
		await act(async () => {
			await latest?.takeOver();
		});
		expect(claimControl).toHaveBeenLastCalledWith(
			request,
			expect.any(String),
			true,
		);
		expect(latest?.isController).toBe(true);
	});
});
