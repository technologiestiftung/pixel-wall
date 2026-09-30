import { sessionId } from "./session";

const API_URL = (
	import.meta.env.VITE_API_URL ?? "http://localhost:5000"
).replace(/\/$/, "");

/** `RequestInit` is a type-only DOM global, which the shared eslint config
 * does not know about; derive it from `fetch` instead. */
export type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/** The API has no username, so the Basic credentials are ":<password>". */
export function authHeader(password: string): string {
	return `Basic ${btoa(`:${password}`)}`;
}

function errorMessage(status: number): string {
	if (status === 401) {
		return "Wrong password";
	}
	if (status === 423) {
		return "Die Wand wird gerade von einem anderen Gerät gesteuert.";
	}
	return `Request failed with status ${status}`;
}

export async function apiFetch<T>(
	path: string,
	password: string | null,
	init: FetchInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");

	if (init.body !== undefined) {
		headers.set("Content-Type", "application/json");
	}

	if (password !== null) {
		headers.set("Authorization", authHeader(password));
	}

	// Only writes are checked against the control lease, and a custom header
	// on every GET would cost each poll a CORS preflight.
	if (init.method !== undefined && init.method !== "GET") {
		headers.set("X-Wall-Session", sessionId());
	}

	let response: Response;

	try {
		response = await fetch(`${API_URL}${path}`, { ...init, headers });
	} catch {
		throw new ApiError(0, `Cannot reach the wall at ${API_URL}`);
	}

	if (!response.ok) {
		throw new ApiError(response.status, errorMessage(response.status));
	}

	return (await response.json()) as T;
}

export { API_URL };
