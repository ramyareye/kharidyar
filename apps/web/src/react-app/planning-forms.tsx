import type {
	CollectionCreateInput,
	CollectionResource,
	ItemCreateInput,
	ItemResource,
	WorkspaceCreateInput,
	WorkspaceSummary,
} from "@kharidyar/contracts";
import {
	useEffect,
	useId,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";

import { useLocale } from "./locale-context";
import {
	euroInputFromMinor,
	parseEuroAmount,
} from "./collection-direction-state";
import {
	deadlineInputValue,
	deadlineIsoValue,
} from "./item-workflow-state";

export function EditorDialog({
	busy,
	children,
	description,
	onClose,
  size = "default",
	title,
}: {
	busy: boolean;
	children: ReactNode;
	description: string;
	onClose: () => void;
  size?: "default" | "wide";
	title: string;
}) {
	const titleId = useId();
	const descriptionId = useId();
	const { t } = useLocale();

	useEffect(() => {
		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === "Escape" && !busy) {
				onClose();
			}
		}

		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [busy, onClose]);

	return (
		<div className="dialog-layer">
			<button
				type="button"
				className="dialog-layer__dismiss"
				onClick={onClose}
				disabled={busy}
				aria-label={t("common.close")}
			/>
			<section
        className={
          size === "wide"
            ? "editor-dialog editor-dialog--wide"
            : "editor-dialog"
        }
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
			>
				<div className="editor-dialog__index" aria-hidden="true">
					<span>FORM</span>
					<span>— 01</span>
				</div>
				<div className="editor-dialog__heading">
					<h2 id={titleId}>{title}</h2>
					<p id={descriptionId}>{description}</p>
				</div>
				{children}
			</section>
		</div>
	);
}

export function FormActions({
	busy,
	onCancel,
	submitLabel,
}: {
	busy: boolean;
	onCancel: () => void;
	submitLabel: string;
}) {
	const { t } = useLocale();

	return (
		<div className="form-actions">
			<button
				type="button"
				className="button button--quiet"
				onClick={onCancel}
				disabled={busy}
			>
				{t("common.cancel")}
			</button>
			<button type="submit" className="button button--primary" disabled={busy}>
				{busy ? t("common.saving") : submitLabel}
				<span aria-hidden="true">↗</span>
			</button>
		</div>
	);
}

export function WorkspaceForm({
	busy,
	initial,
	onClose,
	onSubmit,
}: {
	busy: boolean;
	initial?: WorkspaceSummary;
	onClose: () => void;
	onSubmit: (value: WorkspaceCreateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [name, setName] = useState(initial?.name ?? "");
	const [validationError, setValidationError] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!name.trim()) {
			setValidationError(t("form.nameRequired"));
			return;
		}
		setValidationError(null);
		await onSubmit({ name });
	}

	return (
		<EditorDialog
			busy={busy}
			onClose={onClose}
			title={initial ? t("workspace.editTitle") : t("workspace.createTitle")}
			description={t("workspace.createDescription")}
		>
			<form className="editor-form" onSubmit={submit} noValidate>
				<label className="field">
					<span className="field__label">
						{t("workspace.name")}
						<small>{t("form.required")}</small>
					</span>
					<input
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("workspace.namePlaceholder")}
						maxLength={120}
						aria-invalid={Boolean(validationError)}
					/>
				</label>
				{validationError ? (
					<p className="field-error" role="alert">
						{validationError}
					</p>
				) : null}
				<FormActions
					busy={busy}
					onCancel={onClose}
					submitLabel={initial ? t("common.save") : t("common.create")}
				/>
			</form>
		</EditorDialog>
	);
}

export function CollectionForm({
	busy,
	initial,
	onClose,
	onSubmit,
}: {
	busy: boolean;
	initial?: CollectionResource;
	onClose: () => void;
	onSubmit: (value: CollectionCreateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [validationError, setValidationError] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!name.trim()) {
			setValidationError(t("form.nameRequired"));
			return;
		}
		setValidationError(null);
		await onSubmit({
			description: description.trim() || null,
			name,
		});
	}

	return (
		<EditorDialog
			busy={busy}
			onClose={onClose}
			title={initial ? t("collection.editTitle") : t("collection.createTitle")}
			description={t("collection.createDescription")}
		>
			<form className="editor-form" onSubmit={submit} noValidate>
				<label className="field">
					<span className="field__label">
						{t("collection.name")}
						<small>{t("form.required")}</small>
					</span>
					<input
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("collection.namePlaceholder")}
						maxLength={120}
						aria-invalid={Boolean(validationError)}
					/>
				</label>
				<label className="field">
					<span className="field__label">
						{t("collection.description")}
						<small>{t("common.optional")}</small>
					</span>
					<textarea
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder={t("collection.descriptionPlaceholder")}
						maxLength={2_000}
						rows={4}
					/>
				</label>
				{validationError ? (
					<p className="field-error" role="alert">
						{validationError}
					</p>
				) : null}
				<FormActions
					busy={busy}
					onCancel={onClose}
					submitLabel={initial ? t("common.save") : t("common.create")}
				/>
			</form>
		</EditorDialog>
	);
}

export function ItemForm({
	busy,
	initial,
	onClose,
	onSubmit,
}: {
	busy: boolean;
	initial?: ItemResource;
	onClose: () => void;
	onSubmit: (value: ItemCreateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [title, setTitle] = useState(initial?.title ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [requirements, setRequirements] = useState(initial?.requirements ?? "");
	const [priority, setPriority] = useState<ItemResource["priority"]>(
		initial?.priority ?? "nice_to_have",
	);
	const [quantity, setQuantity] = useState(
		String(initial?.quantityNeeded ?? 1),
	);
	const [groupLabel, setGroupLabel] = useState(initial?.groupLabel ?? "");
	const [budget, setBudget] = useState(
		euroInputFromMinor(initial?.budget?.minor),
	);
	const [deadline, setDeadline] = useState(
		deadlineInputValue(initial?.deadlineAt ?? null),
	);
	const [validationError, setValidationError] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!title.trim()) {
			setValidationError(t("form.titleRequired"));
			return;
		}

		const parsedQuantity = Number(quantity);
		if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
			setValidationError(t("form.quantityInvalid"));
			return;
		}
		const parsedBudget = parseEuroAmount(budget);
		if (!parsedBudget.valid) {
			setValidationError(t("form.budgetInvalid"));
			return;
		}

		setValidationError(null);
		await onSubmit({
			budget:
				parsedBudget.minor === null
					? null
					: { minor: parsedBudget.minor, currency: "EUR" },
			deadlineAt: deadlineIsoValue(deadline),
			description: description.trim() || null,
			groupLabel: groupLabel.trim() || null,
			priority,
			quantityNeeded: parsedQuantity,
			requirements: requirements.trim() || null,
			title,
		});
	}

	return (
		<EditorDialog
			busy={busy}
			onClose={onClose}
			title={initial ? t("item.editTitle") : t("item.createTitle")}
			description={t("item.createDescription")}
		>
			<form className="editor-form" onSubmit={submit} noValidate>
				<label className="field">
					<span className="field__label">
						{t("item.title")}
						<small>{t("form.required")}</small>
					</span>
					<input
						autoFocus
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder={t("item.titlePlaceholder")}
						maxLength={200}
						aria-invalid={Boolean(validationError)}
					/>
				</label>
				<label className="field">
					<span className="field__label">
						{t("item.description")}
						<small>{t("common.optional")}</small>
					</span>
					<textarea
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder={t("item.descriptionPlaceholder")}
						maxLength={4_000}
						rows={3}
					/>
				</label>
				<label className="field">
					<span className="field__label">
						{t("item.requirements")}
						<small>{t("common.optional")}</small>
					</span>
					<textarea
						value={requirements}
						onChange={(event) => setRequirements(event.target.value)}
						placeholder={t("item.requirementsPlaceholder")}
						maxLength={4_000}
						rows={4}
					/>
				</label>
				<div className="field-row">
					<label className="field">
						<span className="field__label">{t("item.priority")}</span>
						<select
							value={priority}
							onChange={(event) =>
								setPriority(event.target.value as ItemResource["priority"])
							}
						>
							<option value="essential">{t("priority.essential")}</option>
							<option value="soon">{t("priority.soon")}</option>
							<option value="nice_to_have">
								{t("priority.nice_to_have")}
							</option>
						</select>
					</label>
					<label className="field">
						<span className="field__label">
							{t("item.quantity")}
							<small>{t("form.required")}</small>
						</span>
						<input
							type="number"
							inputMode="numeric"
							min={1}
							step={1}
							value={quantity}
							onChange={(event) => setQuantity(event.target.value)}
						/>
					</label>
				</div>
				<div className="field-row">
					<label className="field">
						<span className="field__label">
							{t("item.group")}
							<small>{t("common.optional")}</small>
						</span>
						<input
							value={groupLabel}
							onChange={(event) => setGroupLabel(event.target.value)}
							placeholder={t("item.groupPlaceholder")}
							maxLength={80}
						/>
					</label>
					<label className="field">
						<span className="field__label">
							{t("item.budgetInput")}
							<small>{t("common.optional")}</small>
						</span>
						<div className="money-input">
							<input
								value={budget}
								onChange={(event) => setBudget(event.target.value)}
								placeholder="529.00"
								inputMode="decimal"
								dir="ltr"
							/>
							<span>EUR</span>
						</div>
					</label>
				</div>
				<label className="field">
					<span className="field__label">
						{t("item.deadlineInput")}
						<small>{t("common.optional")}</small>
					</span>
					<input
						type="date"
						value={deadline}
						onChange={(event) => setDeadline(event.target.value)}
					/>
				</label>
				{validationError ? (
					<p className="field-error" role="alert">
						{validationError}
					</p>
				) : null}
				<FormActions
					busy={busy}
					onCancel={onClose}
					submitLabel={initial ? t("common.save") : t("common.create")}
				/>
			</form>
		</EditorDialog>
	);
}
