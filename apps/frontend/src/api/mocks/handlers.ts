import { http, HttpResponse } from "msw";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../../domain/layout";
import { createMask, encodeMaskBase64 } from "../../domain/mask";
import type {
	ApplyRequest,
	BrightnessDto,
	LayoutPositionDto,
	StateResponse,
} from "../types";

/**
 * In-memory stand-in for the backend, used by tests and by
 * `VITE_USE_MOCKS=1` in development. It mirrors the real contract closely
 * enough to exercise the app, including slicing static content per screen —
 * see apps/backend/app/compose.py for the real thing.
 */
let layout: LayoutPositionDto[] = DEFAULT_LAYOUT.map((p) => ({ ...p }));
let brightness: BrightnessDto = { small: 60, large: 60 };
const applied: StateResponse["screens"] = {};
/** Screens showing an unsaved preview — the mock only has to remember which,
 * since reverting just means serving `applied` again. */
let previewed = new Set<string>();

export const API_BASE = "/api";

function blankMask(widthPx: number, heightPx: number): string {
	return encodeMaskBase64(createMask(widthPx, heightPx));
}

export const handlers = [
	http.get(`${API_BASE}/health`, () =>
		HttpResponse.json({ status: "ok", auth: { enabled: false } }),
	),

	http.get(`${API_BASE}/screens`, () =>
		HttpResponse.json({ screens: SCREEN_SPECS }),
	),

	http.get(`${API_BASE}/layout`, () =>
		HttpResponse.json({ positions: layout }),
	),

	http.put(`${API_BASE}/layout`, async ({ request }) => {
		const body = (await request.json()) as { positions: LayoutPositionDto[] };
		layout = body.positions;
		return HttpResponse.json({ positions: layout });
	}),

	http.get(`${API_BASE}/state`, () =>
		HttpResponse.json({
			brightness,
			layout,
			screens: applied,
			updated_at: new Date().toISOString(),
		}),
	),

	http.post(`${API_BASE}/apply`, async ({ request }) => {
		const body = (await request.json()) as ApplyRequest;

		for (const screen of body.screens) {
			// Scrolling content cannot be sliced: every screen pans the same
			// filmstrip, so it keeps the whole strip plus its own offset.
			applied[screen.screenId] = body.content.scroll
				? { window: screen.window, content: body.content }
				: {
						window: {
							offsetXPx: 0,
							offsetYPx: 0,
							widthPx: screen.window.widthPx,
							heightPx: screen.window.heightPx,
						},
						content: {
							...body.content,
							widthPx: screen.window.widthPx,
							heightPx: screen.window.heightPx,
							data: blankMask(screen.window.widthPx, screen.window.heightPx),
						},
					};
		}

		if (body.brightness) {
			brightness = body.brightness;
		}

		return HttpResponse.json({ appliedAt: new Date().toISOString() });
	}),

	http.post(`${API_BASE}/preview`, async ({ request }) => {
		const body = (await request.json()) as ApplyRequest;
		for (const screen of body.screens) {
			previewed.add(screen.screenId);
		}
		return HttpResponse.json({
			previewing: true,
			screens: [...previewed].sort(),
		});
	}),

	http.post(`${API_BASE}/preview/revert`, () => {
		previewed = new Set();
		return HttpResponse.json({ previewing: false, screens: [] });
	}),

	http.get(`${API_BASE}/preview`, () =>
		HttpResponse.json({
			previewing: previewed.size > 0,
			screens: [...previewed].sort(),
		}),
	),
];
