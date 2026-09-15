import type {
	ApplyRequest,
	ApplyResponse,
	LayoutPositionDto,
	LayoutResponse,
	ScreensResponse,
	StateResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(
	path: string,
	init?: Parameters<typeof fetch>[1],
): Promise<T> {
	const response = await fetch(`${API_BASE}${path}`, {
		headers: { "Content-Type": "application/json" },
		...init,
	});
	if (!response.ok) {
		throw new Error(
			`${init?.method ?? "GET"} ${path} failed: ${response.status}`,
		);
	}
	return response.json() as Promise<T>;
}

export function getScreens(): Promise<ScreensResponse> {
	return request<ScreensResponse>("/api/screens");
}

export function getLayout(): Promise<LayoutResponse> {
	return request<LayoutResponse>("/api/layout");
}

export function putLayout(
	positions: LayoutPositionDto[],
): Promise<LayoutResponse> {
	return request<LayoutResponse>("/api/layout", {
		method: "PUT",
		body: JSON.stringify({ positions }),
	});
}

export function getState(): Promise<StateResponse> {
	return request<StateResponse>("/api/state");
}

export function applyChanges(body: ApplyRequest): Promise<ApplyResponse> {
	return request<ApplyResponse>("/api/apply", {
		method: "POST",
		body: JSON.stringify(body),
	});
}
