import { http, HttpResponse } from "msw";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../../domain/layout";
import { createMask, encodeMaskBase64 } from "../../domain/mask";
import type { LibraryUpload, UploadedMedia } from "../../domain/types";
import { API_URL } from "../../lib/api";
import type { ApplyRequest, LayoutPositionDto, StateResponse } from "../types";

/**
 * In-memory stand-in for the backend, used by tests and by
 * `VITE_USE_MOCKS=1` in development. It mirrors the real contract closely
 * enough to exercise the app, including slicing static content per screen —
 * see apps/backend/app/compose.py for the real thing.
 */
let layout: LayoutPositionDto[] = DEFAULT_LAYOUT.map((p) => ({ ...p }));
const applied: StateResponse["screens"] = {};
let uploads: LibraryUpload[] = [];

// Must match the origin the app actually calls: a bare "/api" only matches the
// dev server's own origin, so requests to VITE_API_URL passed straight through
// to the real wall even with mocks enabled.
export const API_BASE = `${API_URL}/api`;

function blankMask(widthPx: number, heightPx: number): string {
	return encodeMaskBase64(createMask(widthPx, heightPx));
}

export const handlers = [
	http.get(`${API_BASE}/health`, () =>
		HttpResponse.json({ status: "ok", auth: { enabled: false } }),
	),

	http.post(`${API_BASE}/control`, () =>
		HttpResponse.json({ controller: true }),
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
			layout,
			screens: applied,
			updated_at: new Date().toISOString(),
		}),
	),

	http.get(`${API_BASE}/uploads`, () => HttpResponse.json({ uploads })),

	http.post(`${API_BASE}/uploads`, async ({ request }) => {
		const body = (await request.json()) as UploadedMedia;
		const entry: LibraryUpload = {
			...body,
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
		};
		uploads = [entry, ...uploads];
		return HttpResponse.json(entry);
	}),

	http.delete(`${API_BASE}/uploads/:id`, ({ params }) => {
		uploads = uploads.filter((u) => u.id !== params.id);
		return HttpResponse.json({ id: params.id });
	}),

	http.post(`${API_BASE}/apply`, async ({ request }) => {
		const body = (await request.json()) as ApplyRequest;

		for (const screen of body.screens) {
			if (body.content.format === "gameOfLife") {
				// No bitmap to slice or synthesize — every selected screen
				// just gets the flag verbatim, mirroring
				// apps/backend/app/compose.py's `_is_sliceable`.
				applied[screen.screenId] = {
					window: screen.window,
					content: body.content,
					source: body.source,
				};
				continue;
			}

			// Scrolling content cannot be sliced: every screen pans the same
			// filmstrip, so it keeps the whole strip plus its own offset.
			applied[screen.screenId] = body.content.scroll
				? { window: screen.window, content: body.content, source: body.source }
				: {
						source: body.source,
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

		return HttpResponse.json({ appliedAt: new Date().toISOString() });
	}),
];
