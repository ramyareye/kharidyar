import type {
	ConceptImageResource,
	ConceptImageUpdateInput,
	ConceptMediaResponse,
} from "@kharidyar/contracts";
import { formatNumber } from "@kharidyar/i18n";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { useLocale } from "./locale-context";
import type { ConceptImageUploadValue } from "./planning-api";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function ImageCard({
	busy,
	canManage,
	image,
	onDelete,
	onMove,
	onUpdate,
	referenceCount,
	referenceIndex,
}: {
	busy: boolean;
	canManage: boolean;
	image: ConceptImageResource;
	onDelete: (image: ConceptImageResource) => void;
	onMove: (imageId: string, offset: -1 | 1) => void;
	onUpdate: (
		imageId: string,
		value: ConceptImageUpdateInput,
	) => Promise<boolean>;
	referenceCount: number;
	referenceIndex: number | null;
}) {
	const { locale, t } = useLocale();
	const [broken, setBroken] = useState(false);
	const [caption, setCaption] = useState(image.caption ?? "");

	const roleLabel =
		image.role === "base"
			? t("media.roleBase")
			: image.role === "reference"
				? t("media.roleReference")
				: t("media.roleEdited");
	const alt = image.caption || t("media.imageAlt", { role: roleLabel });
	const captionChanged = caption.trim() !== (image.caption ?? "");

	return (
		<article className="concept-image-card">
			<div className="concept-image-card__visual">
				{broken ? (
					<div
						className="concept-image-card__broken"
						role="img"
						aria-label={alt}
					>
						<span aria-hidden="true">×</span>
						{t("media.broken")}
					</div>
				) : (
					<img
						alt={alt}
						loading="lazy"
						onError={() => setBroken(true)}
						referrerPolicy="no-referrer"
						src={image.contentUrl}
					/>
				)}
				<div className="concept-image-card__badges">
					<span>{roleLabel}</span>
					{image.isCover ? <span>{t("media.cover")}</span> : null}
					{image.subjectKind ? (
						<span>
							{image.subjectKind === "person"
								? t("media.subjectPerson")
								: t("media.subjectSpace")}
						</span>
					) : null}
				</div>
			</div>
			<div className="concept-image-card__body">
				{canManage ? (
					<label className="field field--compact">
						<span className="field__label">{t("media.caption")}</span>
						<input
							disabled={busy}
							maxLength={500}
							onChange={(event) => setCaption(event.target.value)}
							placeholder={t("media.captionPlaceholder")}
							value={caption}
						/>
					</label>
				) : image.caption ? (
					<p className="concept-image-card__caption" dir="auto">
						{image.caption}
					</p>
				) : null}
				<p className="concept-image-card__meta" dir="auto">
					{formatNumber(locale, image.width)} ×{" "}
					{formatNumber(locale, image.height)} ·{" "}
					{t("media.uploadedBy", { name: image.uploader.name })}
				</p>
				{canManage ? (
					<div className="concept-image-card__actions">
						{captionChanged ? (
							<button
								type="button"
								disabled={busy}
								onClick={() =>
									void onUpdate(image.id, { caption: caption.trim() || null })
								}
							>
								{t("common.save")}
							</button>
						) : null}
						{!image.isCover ? (
							<button
								type="button"
								disabled={busy}
								onClick={() => void onUpdate(image.id, { isCover: true })}
							>
								{t("media.makeCover")}
							</button>
						) : null}
						{image.role === "reference" ? (
							<>
								<button
									type="button"
									disabled={busy || referenceIndex === 0}
									onClick={() => onMove(image.id, -1)}
									aria-label={t("media.moveEarlier", { image: alt })}
								>
									↑
								</button>
								<button
									type="button"
									disabled={
										busy ||
										referenceIndex === null ||
										referenceIndex === referenceCount - 1
									}
									onClick={() => onMove(image.id, 1)}
									aria-label={t("media.moveLater", { image: alt })}
								>
									↓
								</button>
							</>
						) : null}
						<button
							type="button"
							className="concept-image-card__delete"
							disabled={busy}
							onClick={() => onDelete(image)}
						>
							{t("media.delete")}
						</button>
					</div>
				) : null}
			</div>
		</article>
	);
}

export function ConceptMedia({
	busy,
	media,
	onDelete,
	onReorder,
	onUpdate,
	onUpload,
}: {
	busy: boolean;
	media: ConceptMediaResponse;
	onDelete: (image: ConceptImageResource) => Promise<void>;
	onReorder: (imageIds: string[]) => Promise<boolean>;
	onUpdate: (
		imageId: string,
		value: ConceptImageUpdateInput,
	) => Promise<boolean>;
	onUpload: (value: ConceptImageUploadValue) => Promise<boolean>;
}) {
	const { locale, t } = useLocale();
	const fileInput = useRef<HTMLInputElement>(null);
	const [role, setRole] = useState<"base" | "reference">("base");
	const [subjectKind, setSubjectKind] = useState<"person" | "space">("space");
	const [file, setFile] = useState<File | null>(null);
	const [caption, setCaption] = useState("");
	const [containsPerson, setContainsPerson] = useState(false);
	const [rightsConfirmed, setRightsConfirmed] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);
	const references = useMemo(
		() => media.images.filter((image) => image.role === "reference"),
		[media.images],
	);
	const hasBase = media.images.some((image) => image.role === "base");
	const maxFileMiB = Math.round(media.limits.maxFileBytes / 1024 / 1024);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (file === null) {
			setValidationError(t("media.fileRequired"));
			return;
		}
		if (!acceptedImageTypes.has(file.type)) {
			setValidationError(t("media.typeInvalid"));
			return;
		}
		if (file.size > media.limits.maxFileBytes) {
			setValidationError(
				t("media.fileTooLarge", { size: formatNumber(locale, maxFileMiB) }),
			);
			return;
		}
		const effectiveContainsPerson =
			(role === "base" && subjectKind === "person") || containsPerson;
		if (effectiveContainsPerson && !rightsConfirmed) {
			setValidationError(t("media.rightsRequired"));
			return;
		}
		setValidationError(null);
		const saved = await onUpload({
			caption: caption.trim() || null,
			containsPerson: effectiveContainsPerson,
			file,
			personRightsConfirmed: effectiveContainsPerson && rightsConfirmed,
			role,
			subjectKind: role === "base" ? subjectKind : null,
		});
		if (saved) {
			setFile(null);
			setCaption("");
			setContainsPerson(false);
			setRightsConfirmed(false);
			if (fileInput.current) fileInput.current.value = "";
		}
	}

	function moveReference(imageId: string, offset: -1 | 1) {
		const currentIndex = references.findIndex(({ id }) => id === imageId);
		const nextIndex = currentIndex + offset;
		if (currentIndex < 0 || nextIndex < 0 || nextIndex >= references.length)
			return;
		const next = references.map(({ id }) => id);
		[next[currentIndex], next[nextIndex]] = [
			next[nextIndex],
			next[currentIndex],
		];
		void onReorder(next);
	}

	function confirmDelete(image: ConceptImageResource) {
		if (!window.confirm(t("media.deleteConfirm"))) return;
		void onDelete(image);
	}

	return (
		<section className="concept-media" aria-labelledby="concept-media-heading">
			<header className="concept-media__header">
				<div>
					<p className="eyebrow">{t("media.eyebrow")}</p>
					<h5 id="concept-media-heading">{t("media.title")}</h5>
					<p>{t("media.privacy")}</p>
				</div>
				<span>
					{formatNumber(locale, media.usage.conceptImageCount)} /{" "}
					{formatNumber(locale, media.limits.maxImageCount)}
				</span>
			</header>

			{media.images.length === 0 ? (
				<p className="concept-media__empty">{t("media.empty")}</p>
			) : (
				<div className="concept-media__grid">
					{media.images.map((image) => {
						const referenceIndex =
							image.role === "reference"
								? references.findIndex(({ id }) => id === image.id)
								: null;
						return (
							<ImageCard
								busy={busy}
								canManage={media.permissions.canManage}
								image={image}
								key={`${image.id}:${image.contentUrl}:${image.caption ?? ""}`}
								onDelete={confirmDelete}
								onMove={moveReference}
								onUpdate={onUpdate}
								referenceCount={references.length}
								referenceIndex={referenceIndex}
							/>
						);
					})}
				</div>
			)}

			{media.permissions.canManage ? (
				<details className="concept-media-upload">
					<summary>{t("media.add")}</summary>
					<form onSubmit={submit} noValidate>
						<div className="concept-media-upload__grid">
							<label className="field">
								<span className="field__label">
									{t("media.role")}
									<small>{t("form.required")}</small>
								</span>
								<select
									disabled={busy}
									onChange={(event) =>
										setRole(event.target.value as "base" | "reference")
									}
									value={role}
								>
									<option value="base">{t("media.roleBase")}</option>
									<option value="reference">{t("media.roleReference")}</option>
								</select>
							</label>
							{role === "base" ? (
								<label className="field">
									<span className="field__label">{t("media.subject")}</span>
									<select
										disabled={busy}
										onChange={(event) =>
											setSubjectKind(event.target.value as "person" | "space")
										}
										value={subjectKind}
									>
										<option value="space">{t("media.subjectSpace")}</option>
										<option value="person">{t("media.subjectPerson")}</option>
									</select>
								</label>
							) : null}
							<label className="field concept-media-upload__file">
								<span className="field__label">
									{t("media.file")}
									<small>{t("form.required")}</small>
								</span>
								<input
									accept="image/jpeg,image/png,image/webp"
									disabled={busy}
									onChange={(event) => setFile(event.target.files?.[0] ?? null)}
									ref={fileInput}
									type="file"
								/>
								<small className="field-hint">
									{t("media.fileHint", {
										size: formatNumber(locale, maxFileMiB),
									})}
								</small>
							</label>
							<label className="field concept-media-upload__caption">
								<span className="field__label">{t("media.caption")}</span>
								<input
									disabled={busy}
									maxLength={500}
									onChange={(event) => setCaption(event.target.value)}
									placeholder={t("media.captionPlaceholder")}
									value={caption}
								/>
							</label>
						</div>
						{role === "base" && hasBase ? (
							<p className="concept-media-upload__warning">
								{t("media.replaceWarning")}
							</p>
						) : null}
						<label className="check-field">
							<input
								checked={
									containsPerson ||
									(role === "base" && subjectKind === "person")
								}
								disabled={busy || (role === "base" && subjectKind === "person")}
								onChange={(event) => {
									setContainsPerson(event.target.checked);
									if (!event.target.checked) setRightsConfirmed(false);
								}}
								type="checkbox"
							/>
							<span>{t("media.containsPerson")}</span>
						</label>
						{containsPerson || (role === "base" && subjectKind === "person") ? (
							<label className="check-field check-field--consent">
								<input
									checked={rightsConfirmed}
									disabled={busy}
									onChange={(event) => setRightsConfirmed(event.target.checked)}
									type="checkbox"
								/>
								<span>{t("media.rightsConfirmation")}</span>
							</label>
						) : null}
						{validationError ? (
							<p className="field-error" role="alert">
								{validationError}
							</p>
						) : null}
						<button
							className="button button--primary"
							disabled={busy}
							type="submit"
						>
							{busy ? t("media.uploading") : t("media.upload")}
						</button>
					</form>
				</details>
			) : null}
		</section>
	);
}
