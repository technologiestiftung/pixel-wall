import { Header } from "./components/Header/Header";
import { Menu } from "./components/Menu/Menu";
import { Preview } from "./components/Preview/Preview";
import { WallProvider } from "./state/WallProvider";

function App() {
	return (
		<WallProvider>
			<div className="flex h-screen flex-col">
				<Header />
				<main className="flex flex-1 overflow-hidden">
					<Menu />
					<Preview />
				</main>
			</div>
		</WallProvider>
	);
}

export default App;
