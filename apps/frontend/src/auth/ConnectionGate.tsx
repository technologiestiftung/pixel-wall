import type { ReactNode } from "react";
import { API_URL } from "../lib/api";
import { useConnection } from "./ConnectionContext";

export function ConnectionGate({ children }: { children: ReactNode }) {
	const { state } = useConnection();

	if (state === "checking") {
		return (
			<main className="min-h-screen grid place-items-center p-6">
				<p role="status">Connecting to the wall…</p>
			</main>
		);
	}

	if (state === "connected") {
		return <>{children}</>;
	}

	return (
		<main className="min-h-screen grid place-items-center p-6">
			<div role="status" className="w-full max-w-sm flex flex-col gap-4">
				<h1 className="text-2xl font-bold">CityLAB Pixel Screens</h1>
				<p className="font-medium">Raspberry Pi nicht verbunden</p>
				<p>
					Die Pixelwand unter {API_URL} ist gerade nicht erreichbar. Mögliche
					Gründe:
				</p>
				<ul className="list-disc pl-5 flex flex-col gap-1">
					<li>Der Raspberry Pi ist ausgeschaltet.</li>
					<li>Dieses Gerät ist in einem anderen WLAN als der Raspberry Pi.</li>
				</ul>
				<p className="text-sm opacity-70">
					Die Verbindung wird automatisch neu geprüft.
				</p>
			</div>
		</main>
	);
}
