import { AuthProvider } from "./auth/AuthContext";
import { ControlProvider } from "./auth/ControlContext";
import { PasswordGate } from "./auth/PasswordGate";
import { ControlBanner } from "./components/Header/ControlBanner";
import { Header } from "./components/Header/Header";
import { Menu } from "./components/Menu/Menu";
import { Preview } from "./components/Preview/Preview";
import { WallProvider } from "./state/WallProvider";

function App() {
	return (
		<AuthProvider>
			<PasswordGate>
				<ControlProvider>
					<WallProvider>
						<div className="flex h-screen flex-col">
							<Header />
							<ControlBanner />
							<main className="flex flex-1 overflow-hidden">
								<Menu />
								<Preview />
							</main>
						</div>
					</WallProvider>
				</ControlProvider>
			</PasswordGate>
		</AuthProvider>
	);
}

export default App;
