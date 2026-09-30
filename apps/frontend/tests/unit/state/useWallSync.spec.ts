// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Generation, WallAction } from "../../../src/state/reducer";
import type { Requester } from "../../../src/api/wall";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../src/api/wall", () => ({
	getScreens: vi.fn(),
	getLayout: vi.fn(),
	getState: vi.fn(),
}));

const { getScreens, getLayout, getState } = await import(
	"../../../src/api/wall"
);
const { useWallSync } = await import("../../../src/state/useWallSync");

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// A stable reference, reused across renders — like the real `request` from
// `useAuth()`, which is memoized. An inline arrow function here would give
// the sync effect a new dependency on every render and restart the poll,
// masking the exact race this test exists to catch.
const request = (async () => undefined) as unknown as Requester;

function Harness({
	dispatch,
	generation,
}: {
	dispatch: (action: WallAction) => void;
	generation: Generation;
}) {
	useWallSync(dispatch, request, generation);
	return null;
}

describe("useWallSync", () => {
	let container: HTMLDivElement | null = null;
	let root: Root | null = null;

	afterEach(() => {
		act(() => {
			root?.unmount();
		});
		container?.remove();
		container = null;
		root = null;
		vi.clearAllMocks();
	});

	test("snapshots generation before the request goes out, not when it resolves", async () => {
		const screens = deferred<{ screens: unknown[] }>();
		const layout = deferred<{ positions: unknown[] }>();
		const state = deferred<{
			screens: Record<string, unknown>;
		}>();

		vi.mocked(getScreens).mockReturnValue(screens.promise as never);
		vi.mocked(getLayout).mockReturnValue(layout.promise as never);
		vi.mocked(getState).mockReturnValue(state.promise as never);

		const dispatch = vi.fn();
		const beforeSave: Generation = {
			screens: { "06": 1 },
			layout: {},
		};

		await act(async () => {
			container = document.createElement("div");
			root = createRoot(container);
			// Mounting fires the initial poll — its requests are left pending
			// above, simulating one already in flight when the save below lands.
			root.render(createElement(Harness, { dispatch, generation: beforeSave }));
		});

		const afterSave: Generation = {
			screens: { "06": 2 },
			layout: {},
		};
		await act(async () => {
			// The save completes and the component re-renders with the newer
			// generation — but the poll above was already under way.
			root!.render(createElement(Harness, { dispatch, generation: afterSave }));
		});

		await act(async () => {
			// Only now does the slow, pre-save poll resolve.
			screens.resolve({ screens: [] });
			layout.resolve({ positions: [] });
			state.resolve({ screens: {} });
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "hydrated",
				sinceGeneration: beforeSave,
			}),
		);
		expect(dispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({ sinceGeneration: afterSave }),
		);
	});
});
