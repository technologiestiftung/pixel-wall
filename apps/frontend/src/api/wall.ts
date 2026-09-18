import type { FetchInit } from "../lib/api";
import type {
	ApplyRequest,
	ApplyResponse,
	BrightnessDto,
	HealthResponse,
	LayoutPositionDto,
	LayoutResponse,
	PreviewResponse,
	ScreensResponse,
	StateResponse,
} from "./types";

/**
 * Every call goes through the caller's authenticated requester rather than a
 * bare `fetch`, so content requests carry the same Basic auth header and 401
 * handling as the sign-in probe — they used to be two unrelated layers, and a
 * 401 on an apply surfaced as a generic failure.
 */
export type Requester = <T>(path: string, init?: FetchInit) => Promise<T>;

export function getHealth(request: Requester): Promise<HealthResponse> {
	return request<HealthResponse>("/api/health");
}

export function getScreens(request: Requester): Promise<ScreensResponse> {
	return request<ScreensResponse>("/api/screens");
}

export function getLayout(request: Requester): Promise<LayoutResponse> {
	return request<LayoutResponse>("/api/layout");
}

export function putLayout(
	request: Requester,
	positions: LayoutPositionDto[],
): Promise<LayoutResponse> {
	return request<LayoutResponse>("/api/layout", {
		method: "PUT",
		body: JSON.stringify({ positions }),
	});
}

export function getState(request: Requester): Promise<StateResponse> {
	return request<StateResponse>("/api/state");
}

export function applyChanges(
	request: Requester,
	body: ApplyRequest,
): Promise<ApplyResponse> {
	return request<ApplyResponse>("/api/apply", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

/**
 * Same payload as `applyChanges`, but the wall's saved state is left alone:
 * the panels show it until `revertPreview` (or another apply) replaces it.
 */
export function previewChanges(
	request: Requester,
	body: ApplyRequest,
): Promise<PreviewResponse> {
	return request<PreviewResponse>("/api/preview", {
		method: "POST",
		body: JSON.stringify(body),
	});
}

/** Puts the saved content back on every screen a preview touched. A no-op
 * server-side when nothing is being previewed, so callers need not track it. */
export function revertPreview(request: Requester): Promise<PreviewResponse> {
	return request<PreviewResponse>("/api/preview/revert", { method: "POST" });
}

export function putBrightness(
	request: Requester,
	brightness: BrightnessDto,
): Promise<BrightnessDto> {
	return request<BrightnessDto>("/api/brightness", {
		method: "PUT",
		body: JSON.stringify(brightness),
	});
}
