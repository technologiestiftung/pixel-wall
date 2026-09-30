import { useCallback, useEffect, useState } from "react";
import { createUpload, deleteUpload, getUploads } from "../api/wall";
import { useAuth } from "../auth/AuthContext";
import type { LibraryUpload, UploadedMedia } from "../domain/types";

/**
 * The shared upload library (see apps/backend/app/uploads.py). Loaded when
 * the Hochladen picker mounts rather than with the wall's own polling: it is
 * only needed while that picker is open, and its sprite sheets are much
 * heavier than the rest of the state.
 */
export function useUploadLibrary() {
	const { request } = useAuth();
	const [uploads, setUploads] = useState<LibraryUpload[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getUploads(request)
			.then((list) => {
				if (!cancelled) {
					setUploads(list);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setUploads([]);
					setLoadError("Die Bibliothek konnte nicht geladen werden.");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [request]);

	const add = useCallback(
		async (media: UploadedMedia) => {
			const entry = await createUpload(request, media);
			setUploads((current) => [entry, ...(current ?? [])]);
			return entry;
		},
		[request],
	);

	const remove = useCallback(
		async (id: string) => {
			await deleteUpload(request, id);
			setUploads((current) => (current ?? []).filter((u) => u.id !== id));
		},
		[request],
	);

	return { uploads, loadError, add, remove };
}
