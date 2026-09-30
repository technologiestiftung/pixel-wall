const STORAGE_KEY = "pixel-wall-session";

let cached: string | null = null;

/** `crypto.randomUUID` needs a secure context, which the editor on a plain
 * http:// LAN address is not; `getRandomValues` works everywhere. */
function randomId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifies this tab to the backend's control lease (see
 * apps/backend/app/control.py). Kept in sessionStorage so a reload keeps
 * control instead of being locked out by its own previous lease. */
export function sessionId(): string {
	if (cached !== null) {
		return cached;
	}
	try {
		cached = sessionStorage.getItem(STORAGE_KEY);
	} catch {
		cached = null;
	}
	if (cached === null) {
		cached = randomId();
		try {
			sessionStorage.setItem(STORAGE_KEY, cached);
		} catch {
			// Blocked storage: the id still lasts for this page.
		}
	}
	return cached;
}
