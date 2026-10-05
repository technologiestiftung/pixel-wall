import { useEffect, useState } from "react";
import { getWeather } from "../api/wall";
import type { WeatherDto } from "../api/types";
import { useAuth } from "../auth/AuthContext";

/** The backend fetches Bright Sky every 10 minutes; polling more often than
 * that would only ever see the same reading. */
const REFRESH_MS = 5 * 60_000;
/** A just-started backend has no reading until its first Bright Sky fetch
 * succeeds; check back sooner than REFRESH_MS rather than show none for minutes. */
const RETRY_MS = 30_000;

let shared: { at: number; reading: Promise<WeatherDto | null> } | null = null;

function isComplete(reading: WeatherDto | null): boolean {
	return reading !== null && reading.variant !== null;
}

/**
 * The backend's current weather reading, shared between every screen tile
 * and the edit panel so a wall full of weather screens asks once rather than
 * once per tile. null while loading, or when the backend can't be reached.
 */
export function useCurrentWeather(): WeatherDto | null {
	const { request } = useAuth();
	const [reading, setReading] = useState<WeatherDto | null>(null);

	useEffect(() => {
		let cancelled = false;
		let retry: ReturnType<typeof setTimeout> | undefined;
		const load = () => {
			if (shared === null || performance.now() - shared.at > REFRESH_MS) {
				shared = {
					at: performance.now(),
					reading: getWeather(request).catch(() => null),
				};
			}
			const entry = shared;
			entry.reading.then((next) => {
				if (cancelled) {
					return;
				}
				setReading(next);
				if (!isComplete(next)) {
					if (shared === entry) {
						shared = null;
					}
					clearTimeout(retry);
					retry = setTimeout(load, RETRY_MS);
				}
			});
		};
		load();
		const interval = setInterval(load, REFRESH_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
			clearTimeout(retry);
		};
	}, [request]);

	return reading;
}
