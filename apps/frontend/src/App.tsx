import { ConnectionGate } from "./auth/ConnectionGate";
import { ConnectionProvider } from "./auth/ConnectionContext";
import { ControlProvider } from "./auth/ControlContext";
import { ControlBanner } from "./components/Header/ControlBanner";
import { Header } from "./components/Header/Header";
import { Menu } from "./components/Menu/Menu";
import { Preview } from "./components/Preview/Preview";
import { WallProvider } from "./state/WallProvider";

function App() {
	return (
		<ConnectionProvider>
			<ConnectionGate>
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
			</ConnectionGate>
		</ConnectionProvider>
	);
}

export default App;
