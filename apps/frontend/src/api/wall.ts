import type { LibraryUpload, UploadedMedia } from "../domain/types";
import type { FetchInit } from "../lib/api";
import type {
	ApplyRequest,
	ApplyResponse,
	HealthResponse,
	LayoutPositionDto,
	LayoutResponse,
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

export async function getUploads(request: Requester): Promise<LibraryUpload[]> {
	const { uploads } = await request<{ uploads: LibraryUpload[] }>(
		"/api/uploads",
	);
	return uploads;
}

export function createUpload(
	request: Requester,
	media: UploadedMedia,
): Promise<LibraryUpload> {
	return request<LibraryUpload>("/api/uploads", {
		method: "POST",
		body: JSON.stringify(media),
	});
}

export function deleteUpload(request: Requester, id: string): Promise<void> {
	return request(`/api/uploads/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}
