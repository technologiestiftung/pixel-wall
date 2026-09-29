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

	let response: Response;

	try {
		response = await fetch(`${API_URL}${path}`, { ...init, headers });
	} catch {
		throw new ApiError(0, `Cannot reach the wall at ${API_URL}`);
	}

	if (!response.ok) {
		throw new ApiError(
			response.status,
			response.status === 401
				? "Wrong password"
				: `Request failed with status ${response.status}`,
		);
	}

	return (await response.json()) as T;
}

export { API_URL };
