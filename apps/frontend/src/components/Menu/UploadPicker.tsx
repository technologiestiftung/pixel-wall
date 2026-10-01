import { useRef, useState, type DragEvent } from "react";
import type {
	AnimationContent,
	LibraryUpload,
	UploadedMedia,
} from "../../domain/types";
import { ApiError } from "../../lib/api";
import { SelectedBadge } from "../../render/SelectedBadge";
import {
	ACCEPTED_UPLOAD_TYPES,
	decodeUpload,
} from "../../render/uploadedMedia";
import { useUploadLibrary } from "../../state/useUploadLibrary";
import { PlacementControls } from "./PlacementControls";

interface UploadPickerProps {
	content: AnimationContent;
	onChange: (content: AnimationContent) => void;
	/** Only still images can be picked — see AnimationPanel. */
	stillOnly: boolean;
}

/**
 * The Hochladen source: a shared library of the user's own images and
 * animations. A file is decoded in the browser (see render/uploadedMedia.ts),
 * then saved to the library so any screen can use it later. Whatever a screen
 * is showing is copied into its own content, so deleting an entry here never
 * changes the wall.
 */
export function UploadPicker({
	content,
	onChange,
	stillOnly,
}: UploadPickerProps) {
	const { uploads, loadError, add, remove } = useUploadLibrary();
	const inputRef = useRef<HTMLInputElement>(null);
	const [decoding, setDecoding] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);

	function select(media: UploadedMedia) {
		onChange({ ...content, mode: "upload", upload: media });
	}

	async function handleFile(file: File | undefined) {
		if (!file) {
			return;
		}
		setDecoding(true);
		setError(null);
		let media: UploadedMedia;
		try {
			media = await decodeUpload(file);
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Die Datei konnte nicht gelesen werden.",
			);
			setDecoding(false);
			return;
		}
		if (stillOnly && media.frameCount > 1) {
			setError(
				"Animationen sind nur für große oder nur für kleine Screens möglich. Die Datei wurde in der Bibliothek gespeichert.",
			);
			try {
				await add(media);
			} catch {
				setError(
					"Animationen sind nur für große oder nur für kleine Screens möglich.",
				);
			} finally {
				setDecoding(false);
			}
			return;
		}
		try {
			select(withoutCreatedAt(await add(media)));
		} catch (e) {
			// Still usable on this selection, it just isn't kept for later.
			select(media);
			setError(
				e instanceof ApiError && e.status === 409
					? "Die Bibliothek ist voll — lösche zuerst einen Upload. Die Datei wird trotzdem hier verwendet."
					: "Die Datei konnte nicht in der Bibliothek gespeichert werden, wird aber hier verwendet.",
			);
		} finally {
			setDecoding(false);
		}
	}

	async function handleDelete(upload: LibraryUpload) {
		if (
			!window.confirm(
				`„${upload.name}" aus der Bibliothek löschen? Screens, die es gerade zeigen, behalten es.`,
			)
		) {
			return;
		}
		setDeletingId(upload.id);
		setError(null);
		try {
			await remove(upload.id);
		} catch {
			setError(`„${upload.name}" konnte nicht gelöscht werden.`);
		} finally {
			setDeletingId(null);
		}
	}

	function handleDrop(event: DragEvent<HTMLButtonElement>) {
		event.preventDefault();
		setDragging(false);
		void handleFile(event.dataTransfer.files[0]);
	}

	const selectedId = content.upload?.id;

	return (
		<>
			<div className="flex flex-col gap-2.5">
				<span className="w-full text-[12px] text-[#767671]">
					Deine Uploads (PNG, JPG, GIF, WebP, SVG)
				</span>
				<input
					ref={inputRef}
					type="file"
					accept={ACCEPTED_UPLOAD_TYPES}
					className="hidden"
					onChange={(e) => {
						void handleFile(e.target.files?.[0]);
						e.target.value = "";
					}}
				/>
				<div className="flex flex-wrap items-start gap-x-3 gap-y-3.5">
					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={handleDrop}
						disabled={decoding}
						aria-label="Neue Datei hochladen"
						title="Datei auswählen oder hierher ziehen"
						className={`flex h-[58px] w-[70px] items-center justify-center rounded-[10px] border border-dashed ${
							dragging
								? "border-[#20201b] bg-[#f4f4f2]"
								: "border-[#b5b5b0] hover:bg-[#faf9f7]"
						}`}
					>
						{decoding ? (
							<span className="text-[11px] text-[#767671]">Lädt…</span>
						) : (
							<svg
								className="h-[24px] w-[24px]"
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M12 5v14M5 12h14"
									stroke="#4b4b47"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
							</svg>
						)}
					</button>

					{content.upload && !content.upload.id && (
						<UploadTile media={content.upload} selected onSelect={() => {}} />
					)}

					{uploads
						?.filter((upload) => !stillOnly || upload.frameCount <= 1)
						.map((upload) => (
							<UploadTile
								key={upload.id}
								media={upload}
								selected={upload.id === selectedId}
								deleting={upload.id === deletingId}
								onSelect={() => select(withoutCreatedAt(upload))}
								onDelete={() => void handleDelete(upload)}
							/>
						))}
				</div>

				{uploads === null && (
					<p className="text-[12px] text-[#767671]">Bibliothek wird geladen…</p>
				)}
				{uploads?.length === 0 && !loadError && !content.upload && (
					<p className="text-[12px] text-[#767671]">
						Noch keine Uploads. Hochgeladene Dateien stehen danach für alle
						Screens bereit.
					</p>
				)}
				{(error ?? loadError) && (
					<p role="alert" className="text-[12px] text-red-700">
						{error ?? loadError}
					</p>
				)}
				{content.upload && (
					<p className="truncate text-[12px] text-[#4b4b47]">
						{content.upload.name} ·{" "}
						{content.upload.frameCount > 1
							? `Animation, ${content.upload.frameCount} Frames`
							: "Bild"}
					</p>
				)}
				<p className="text-[12px] text-[#767671]">
					Die Screens zeigen maximal 16 Farben. Animationen werden auf 8
					Sekunden gekürzt.
				</p>
			</div>

			{content.upload && (
				<PlacementControls content={content} onChange={onChange} />
			)}
		</>
	);
}

function withoutCreatedAt({
	createdAt: _createdAt,
	...media
}: LibraryUpload): UploadedMedia {
	return media;
}

interface UploadTileProps {
	media: UploadedMedia;
	selected: boolean;
	deleting?: boolean;
	onSelect: () => void;
	onDelete?: () => void;
}

function UploadTile({
	media,
	selected,
	deleting = false,
	onSelect,
	onDelete,
}: UploadTileProps) {
	return (
		<div className={`relative ${deleting ? "opacity-40" : ""}`}>
			<button
				type="button"
				onClick={onSelect}
				aria-label={media.name}
				aria-pressed={selected}
				title={media.name}
				className={`flex h-[58px] w-[70px] items-center justify-center rounded-[10px] border bg-[#2a2a27] ${
					selected ? "border-[1.6px] border-[#171717]" : "border-[#dededa]"
				}`}
			>
				<UploadThumbnail media={media} />
			</button>
			{selected && (
				<SelectedBadge className="pointer-events-none absolute -right-2 -top-2.5 h-4 w-4" />
			)}
			{onDelete && (
				<button
					type="button"
					onClick={onDelete}
					disabled={deleting}
					aria-label={`${media.name} löschen`}
					title="Löschen"
					className="absolute -left-2 -top-2.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#dededa] bg-white text-[#4b4b47] hover:border-red-300 hover:bg-red-50 hover:text-red-700"
				>
					<svg viewBox="0 0 10 10" className="h-2 w-2" aria-hidden="true">
						<path
							d="M2 2l6 6M8 2l-6 6"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			)}
		</div>
	);
}

/** First frame of the sprite sheet, cropped with CSS rather than a canvas. */
function UploadThumbnail({ media }: { media: UploadedMedia }) {
	const rows = Math.ceil(media.frameCount / media.columns);
	const aspect = media.frameWidthPx / media.frameHeightPx;
	return (
		<div
			aria-hidden="true"
			style={{
				width: aspect >= 1 ? 40 : 40 * aspect,
				height: aspect >= 1 ? 40 / aspect : 40,
				backgroundImage: `url(${media.sheetDataUrl})`,
				backgroundSize: `${media.columns * 100}% ${rows * 100}%`,
				backgroundPosition: "0 0",
				imageRendering: "pixelated",
			}}
		/>
	);
}
