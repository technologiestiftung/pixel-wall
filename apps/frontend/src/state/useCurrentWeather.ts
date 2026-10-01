import { useEffect, useState } from "react";
import { getWeather } from "../api/wall";
import type { WeatherDto } from "../api/types";
import { useAuth } from "../auth/AuthContext";

/** The backend fetches Bright Sky every 10 minutes; polling more often than
 * that would only ever see the same reading. */
const REFRESH_MS = 5 * 60_000;

let shared: { at: number; reading: Promise<WeatherDto | null> } | null = null;

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
		const load = () => {
			if (shared === null || performance.now() - shared.at > REFRESH_MS) {
				shared = {
					at: performance.now(),
					reading: getWeather(request).catch(() => null),
				};
			}
			shared.reading.then((next) => {
				if (!cancelled) {
					setReading(next);
				}
			});
		};
		load();
		const interval = setInterval(load, REFRESH_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [request]);

	return reading;
}
