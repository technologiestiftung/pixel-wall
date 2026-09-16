/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
	readonly VITE_API_URL?: string;
	readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
