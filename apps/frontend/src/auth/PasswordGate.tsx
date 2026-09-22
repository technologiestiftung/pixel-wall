import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, API_URL } from "../lib/api";
import { useAuth } from "./AuthContext";

export function PasswordGate({ children }: { children: ReactNode }) {
	const { state, signIn } = useAuth();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (state === "checking") {
		return (
			<main className="min-h-screen grid place-items-center p-6">
				<p role="status">Connecting to the wall…</p>
			</main>
		);
	}

	if (state === "unlocked") {
		return <>{children}</>;
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(null);

		try {
			await signIn(password);
			setPassword("");
		} catch (caught) {
			setError(
				caught instanceof ApiError ? caught.message : "Something went wrong",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="min-h-screen grid place-items-center p-6">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-sm flex flex-col gap-4"
			>
				<h1 className="text-2xl font-bold">CityLAB Pixel Screens</h1>

				<div className="flex flex-col gap-1">
					<label htmlFor="password" className="font-medium">
						Password
					</label>
					<input
						id="password"
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						autoFocus
						autoComplete="current-password"
						required
						aria-describedby={error === null ? undefined : "password-error"}
						aria-invalid={error === null ? undefined : true}
						className="border rounded px-3 py-2"
					/>
				</div>

				<button
					type="submit"
					disabled={submitting || password === ""}
					className="border rounded px-3 py-2 font-medium disabled:opacity-50"
				>
					{submitting ? "Checking…" : "Unlock"}
				</button>

				{error !== null && (
					<p id="password-error" role="alert" className="text-red-700">
						{error}
					</p>
				)}

				<p className="text-sm opacity-70">Controlling the wall at {API_URL}</p>
			</form>
		</main>
	);
}
