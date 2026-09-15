import { http, HttpResponse } from "msw";
import { DEFAULT_LAYOUT, SCREEN_SPECS } from "../../domain/layout";
import type { ApplyRequest, LayoutPositionDto, StateResponse } from "../types";

/**
 * In-memory stand-in for the real backend, which doesn't exist yet (see
 * CONTEXT.md and the Phase 3 plan) — this is the "mock layer" that lets
 * the frontend be built and tested against the proposed contract without
 * waiting on backend implementation.
 */
let layout: LayoutPositionDto[] = DEFAULT_LAYOUT.map((p) => ({ ...p }));
const applied: StateResponse["screens"] = {};

export const API_BASE = "/api";

export const handlers = [
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

	http.get(`${API_BASE}/state`, () => HttpResponse.json({ screens: applied })),

	http.post(`${API_BASE}/apply`, async ({ request }) => {
		const body = (await request.json()) as ApplyRequest;
		for (const screen of body.screens) {
			applied[screen.screenId] = {
				geometry: screen.geometry,
				content: body.content,
			};
		}
		return HttpResponse.json({ appliedAt: new Date().toISOString() });
	}),
];
