import type {
	DecisionEventResource,
	ItemPermissions,
	ItemPlanningSnapshot,
	ItemResource,
	ItemStatusChangeInput,
	RollupLine,
} from "@kharidyar/contracts";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatNumber,
	type MessageKey,
} from "@kharidyar/i18n";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
	availableItemStatuses,
	changedItemSnapshotFields,
	isUnusualItemStatusChange,
	type ItemSnapshotField,
} from "./item-workflow-state";
import { useLocale } from "./locale-context";
import { EditorDialog } from "./planning-forms";
import { ProductThumbnail } from "./ProductThumbnail";
import "./ItemWorkflowDialog.css";

const priorityMessage: Record<ItemResource["priority"], MessageKey> = {
	essential: "priority.essential",
	nice_to_have: "priority.nice_to_have",
	soon: "priority.soon",
};

const statusMessage: Record<ItemResource["status"], MessageKey> = {
	comparing: "status.comparing",
	decided: "status.decided",
	idea: "status.idea",
	purchased: "status.purchased",
	researching: "status.researching",
	skipped: "status.skipped",
};

const fieldMessage: Record<ItemSnapshotField, MessageKey> = {
	title: "workflow.field.title",
	description: "workflow.field.description",
	requirements: "workflow.field.requirements",
	priority: "workflow.field.priority",
	status: "workflow.field.status",
	quantityNeeded: "workflow.field.quantity",
	groupLabel: "workflow.field.group",
	budget: "workflow.field.budget",
	deadlineAt: "workflow.field.deadline",
};

// Render sourced links as text/anchors only; notes never become HTML or images.
function LinkedText({ text }: { text: string }) {
	const parts: ReactNode[] = [];
	const links = /\[([^\]\n]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s<>]+)/gu;
	let cursor = 0;
	for (const match of text.matchAll(links)) {
		parts.push(text.slice(cursor, match.index));
		const source = match[2] ?? match[3];
		try {
			const url = new URL(source);
			if (url.protocol !== "https:" || url.username || url.password)
				throw new Error("Unsupported link");
			parts.push(
				<a
					key={match.index}
					href={url.href}
					title={url.href}
					target="_blank"
					rel="noreferrer"
				>
					{match[1] ?? url.hostname.replace(/^www\./u, "")}
				</a>,
			);
		} catch {
			parts.push(match[0]);
		}
		cursor = match.index + match[0].length;
	}
	parts.push(text.slice(cursor));
	return <>{parts}</>;
}

function snapshotValue(
	snapshot: ItemPlanningSnapshot,
	field: ItemSnapshotField,
	locale: "en" | "fa",
	t: (key: MessageKey, values?: Record<string, number | string>) => string,
): ReactNode {
	switch (field) {
		case "description":
		case "requirements":
			return <LinkedText text={snapshot[field] || t("workflow.none")} />;
		case "priority":
			return t(priorityMessage[snapshot.priority]);
		case "status":
			return t(statusMessage[snapshot.status]);
		case "quantityNeeded":
			return formatNumber(locale, snapshot.quantityNeeded);
		case "budget":
			return snapshot.budget
				? formatMoney(locale, snapshot.budget.minor, snapshot.budget.currency)
				: t("workflow.none");
		case "deadlineAt":
			return snapshot.deadlineAt
				? formatDate(locale, snapshot.deadlineAt)
				: t("workflow.none");
		default:
			return snapshot[field] || t("workflow.none");
	}
}

function DecisionEventCard({ event }: { event: DecisionEventResource }) {
	const { locale, t } = useLocale();
	const actorInitial = event.actor.name.trim().charAt(0).toUpperCase() || "?";
	const title =
		event.kind === "item_status_changed"
			? t("workflow.statusChanged")
			: event.kind === "item_details_updated"
				? t("workflow.detailsUpdated")
				: event.kind === "planned_candidate_changed"
					? t("workflow.planChanged")
					: t("workflow.purchaseRecorded");

	return (
		<details className="decision-event">
			<summary className="decision-event__header">
				<span className="decision-event__actor" aria-hidden="true">
					{actorInitial}
				</span>
				<span className="decision-event__meta">
					<strong>{title}</strong>
					<span>
						{t("workflow.byline", {
							date: formatDateTime(locale, event.createdAt),
							name: event.actor.name,
						})}
					</span>
				</span>
				{event.kind === "item_status_changed" && event.unusual ? (
					<span className="decision-event__warning">
						{t("workflow.reversalLabel")}
					</span>
				) : null}
			</summary>

			<div className="decision-event__body">
				{event.kind === "item_status_changed" ? (
					<div className="decision-event__status" dir="ltr">
						<span dir="auto">{t(statusMessage[event.fromStatus])}</span>
						<span aria-hidden="true">→</span>
						<strong dir="auto">{t(statusMessage[event.toStatus])}</strong>
					</div>
				) : event.kind === "item_details_updated" ? (
					<ul className="decision-event__changes">
						{changedItemSnapshotFields(event.before, event.after).map(
							(field) => (
								<li key={field}>
									<span>{t(fieldMessage[field])}</span>
									<div>
										<del dir="auto">
											{snapshotValue(event.before, field, locale, t)}
										</del>
										<span aria-hidden="true">→</span>
										<strong dir="auto">
											{snapshotValue(event.after, field, locale, t)}
										</strong>
									</div>
								</li>
							),
						)}
					</ul>
				) : event.kind === "planned_candidate_changed" ? (
					<div className="decision-event__status" dir="auto">
						<span>{event.before?.productTitle ?? t("workflow.none")}</span>
						<span aria-hidden="true">→</span>
						<strong>{event.after?.productTitle ?? t("workflow.none")}</strong>
					</div>
				) : (
					<dl className="decision-event__purchase">
						<div>
							<dt>{t("workflow.purchaseProduct")}</dt>
							<dd dir="auto">{event.purchase.productTitle}</dd>
						</div>
						<div>
							<dt>{t("workflow.purchaseMerchant")}</dt>
							<dd dir="auto">{event.purchase.merchantName}</dd>
						</div>
						<div>
							<dt>{t("workflow.purchaseQuantity")}</dt>
							<dd>{formatNumber(locale, event.purchase.purchasedQuantity)}</dd>
						</div>
						<div>
							<dt>{t("workflow.purchaseTotal")}</dt>
							<dd>
								{event.purchase.totalMinor === null
									? t("workflow.none")
									: formatMoney(
											locale,
											event.purchase.totalMinor,
											event.purchase.currency,
										)}
							</dd>
						</div>
					</dl>
				)}

				{event.kind === "item_status_changed" && event.note ? (
					<p className="decision-event__note" dir="auto">
						{event.note}
					</p>
				) : null}
				{event.kind === "purchase_recorded" && event.purchase.note ? (
					<p className="decision-event__note" dir="auto">
						{event.purchase.note}
					</p>
				) : null}
			</div>
		</details>
	);
}

export function ItemWorkflowDialog({
	busy,
	error,
	events,
	item,
	loading,
	onChangeStatus,
	onClose,
	onCompare,
	onEdit,
	permissions,
	plan,
}: {
	busy: boolean;
	error: string | null;
	events: DecisionEventResource[];
	item: ItemResource;
	loading: boolean;
	onChangeStatus: (value: ItemStatusChangeInput) => Promise<boolean>;
	onClose: () => void;
	onCompare: () => void;
	plan?: RollupLine;
	onEdit: () => void;
	permissions: ItemPermissions;
}) {
	const { locale, t } = useLocale();
	const [nextStatus, setNextStatus] = useState<"" | ItemResource["status"]>("");
	const [note, setNote] = useState("");
	const photo = plan?.candidateId
		? plan.productImageUrl
		: plan?.previewProduct?.imageUrl;
	const productTitle =
		plan?.productTitle ?? plan?.previewProduct?.title ?? item.title;
	const statuses = useMemo(
		() => availableItemStatuses(item.status, permissions),
		[item.status, permissions],
	);

	const unusual =
		nextStatus !== "" && isUnusualItemStatusChange(item.status, nextStatus);

	async function submitStatus(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!nextStatus) return;
		const saved = await onChangeStatus({
			status: nextStatus,
			note: note.trim() || null,
		});
		if (saved) {
			setNextStatus("");
			setNote("");
		}
	}

	return (
		<EditorDialog
			busy={busy}
			className="editor-dialog--item-detail"
			onClose={onClose}
			size="wide"
			title={item.title}
		>
			<div className="item-workflow">
				{error ? (
					<p className="field-error" role="alert">
						{error}
					</p>
				) : null}
				<section className="item-workflow__overview">
					<div className="item-workflow__product">
						<div className="item-workflow__photo">
							<ProductThumbnail src={photo} title={productTitle} />
							{!photo ? <span>{t("commerce.noImage")}</span> : null}
						</div>
						<div className="item-workflow__summary">
							<div className="item-workflow__heading">
								<div>
									<span className={`status-tag status-tag--${item.status}`}>
										{t(statusMessage[item.status])}
									</span>
									<span>{t(priorityMessage[item.priority])}</span>
								</div>
								{permissions.canEdit && !item.archivedAt ? (
									<button
										type="button"
										className="text-action"
										onClick={onEdit}
										disabled={busy}
									>
										{t("common.edit")}
									</button>
								) : null}
							</div>
							{productTitle !== item.title ? (
								<p className="item-workflow__product-title" dir="auto">
									{productTitle}
								</p>
							) : null}
							<dl className="item-workflow__facts">
								<div>
									<dt>{t("item.quantity")}</dt>
									<dd>{formatNumber(locale, item.quantityNeeded)}</dd>
								</div>
								{item.groupLabel ? (
									<div>
										<dt>{t("item.group")}</dt>
										<dd dir="auto">{item.groupLabel}</dd>
									</div>
								) : null}
								{item.budget ? (
									<div>
										<dt>{t("item.budgetInput")}</dt>
										<dd>
											{formatMoney(
												locale,
												item.budget.minor,
												item.budget.currency,
											)}
										</dd>
									</div>
								) : null}
								{item.deadlineAt ? (
									<div>
										<dt>{t("item.deadlineInput")}</dt>
										<dd>{formatDate(locale, item.deadlineAt)}</dd>
									</div>
								) : null}
							</dl>
							<button
								type="button"
								className="text-action item-workflow__compare"
								onClick={onCompare}
								disabled={busy}
							>
								{t("commerce.open")}
							</button>
						</div>
					</div>
					{item.description ? (
						<p className="item-workflow__description" dir="auto">
							<LinkedText text={item.description} />
						</p>
					) : null}
					{item.requirements ? (
						<div className="item-workflow__requirements">
							<span>{t("item.requirements")}</span>
							<p dir="auto">
								<LinkedText text={item.requirements} />
							</p>
						</div>
					) : null}
				</section>

				<aside className="item-workflow__decision">
					{item.archivedAt ? (
						<p className="workflow-readonly">
							{t("workflow.archivedReadonly")}
						</p>
					) : statuses.length === 0 ? (
						<p className="workflow-readonly">{t("workflow.statusReadonly")}</p>
					) : (
						<form className="workflow-status-form" onSubmit={submitStatus}>
							<label className="field">
								<span className="field__label">{t("workflow.nextStatus")}</span>
								<select
									value={nextStatus}
									onChange={(event) =>
										setNextStatus(
											event.target.value as "" | ItemResource["status"],
										)
									}
									disabled={busy}
								>
									<option value="">{t("workflow.chooseStatus")}</option>
									{statuses.map((status) => (
										<option key={status} value={status}>
											{t(statusMessage[status])}
										</option>
									))}
								</select>
							</label>
							<button
								type="submit"
								className="button button--primary"
								disabled={busy || nextStatus === ""}
							>
								{busy ? t("common.saving") : t("workflow.confirmStatus")}
							</button>
							{nextStatus ? (
								<label className="field workflow-status-form__note">
									<span className="field__label">
										{t("workflow.decisionNote")}
										<small>{t("common.optional")}</small>
									</span>
									<textarea
										value={note}
										onChange={(event) => setNote(event.target.value)}
										placeholder={t("workflow.decisionNotePlaceholder")}
										maxLength={1_000}
										rows={2}
										disabled={busy}
									/>
								</label>
							) : null}
							{unusual ? (
								<p className="workflow-warning" role="status">
									{t("workflow.reversalWarning")}
								</p>
							) : null}
							{nextStatus === "purchased" ? (
								<p className="workflow-purchase-note">
									{t("workflow.purchaseNote")}
								</p>
							) : null}
						</form>
					)}
				</aside>

				<details className="item-workflow__history">
					<summary>
						<span>{t("workflow.historyTitle")}</span>
						<span className="item-workflow__history-count">
							{loading ? "…" : formatNumber(locale, events.length)}
						</span>
					</summary>
					{loading ? (
						<p className="workflow-history-empty">{t("workflow.loading")}</p>
					) : events.length === 0 ? (
						<p className="workflow-history-empty">
							{t("workflow.historyEmpty")}
						</p>
					) : (
						<div className="decision-history">
							{events.map((event) => (
								<DecisionEventCard event={event} key={event.id} />
							))}
						</div>
					)}
				</details>
			</div>
		</EditorDialog>
	);
}
