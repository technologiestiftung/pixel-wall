import { AuthProvider, useAuth } from "./auth/AuthContext";
import { PasswordGate } from "./auth/PasswordGate";

function WallControls() {
	const { password, signOut } = useAuth();

	return (
		<main className="p-6 flex flex-col gap-4 items-start">
			<h1 className="text-2xl font-bold">Pixel Wall</h1>
			<p>Signed in. Build the wall controls here.</p>
			{password !== null && (
				<button
					type="button"
					onClick={signOut}
					className="border rounded px-3 py-2"
				>
					Sign out
				</button>
			)}
		</main>
	);
}

function App() {
	return (
		<AuthProvider>
			<PasswordGate>
				<WallControls />
			</PasswordGate>
		</AuthProvider>
	);
}

export default App;
