/** Below the argument-count limit `String.fromCharCode.apply` hits on large
 * frame strips. */
const CHUNK_BYTES = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_BYTES));
	}
	return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
