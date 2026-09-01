import type {
	DecisionEventResource,
	ItemPermissions,
	ItemPlanningSnapshot,
	ItemResource,
	ItemStatusChangeInput,
} from "@kharidyar/contracts";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatNumber,
	type MessageKey,
} from "@kharidyar/i18n";
import {
	useMemo,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";

import {
	availableItemStatuses,
	changedItemSnapshotFields,
	isUnusualItemStatusChange,
	type ItemSnapshotField,
} from "./item-workflow-state";
import { useLocale } from "./locale-context";
import { EditorDialog } from "./planning-forms";

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

function snapshotValue(
	snapshot: ItemPlanningSnapshot,
	field: ItemSnapshotField,
	locale: "en" | "fa",
	t: (key: MessageKey, values?: Record<string, number | string>) => string,
): ReactNode {
	switch (field) {
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

function DecisionEventCard({
	event,
}: {
	event: DecisionEventResource;
}) {
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
		<article className="decision-event">
			<header className="decision-event__header">
				<span className="decision-event__actor" aria-hidden="true">
					{actorInitial}
				</span>
				<div>
					<strong>{title}</strong>
					<span>
						{t("workflow.byline", {
							date: formatDateTime(locale, event.createdAt),
							name: event.actor.name,
						})}
					</span>
				</div>
				{event.kind === "item_status_changed" && event.unusual ? (
					<span className="decision-event__warning">
						{t("workflow.reversalLabel")}
					</span>
				) : null}
			</header>

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
		</article>
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
	onEdit,
	permissions,
}: {
	busy: boolean;
	error: string | null;
	events: DecisionEventResource[];
	item: ItemResource;
	loading: boolean;
	onChangeStatus: (value: ItemStatusChangeInput) => Promise<boolean>;
	onClose: () => void;
	onEdit: () => void;
	permissions: ItemPermissions;
}) {
	const { locale, t } = useLocale();
	const [nextStatus, setNextStatus] = useState<"" | ItemResource["status"]>(
		"",
	);
	const [note, setNote] = useState("");
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
			description={t("workflow.description")}
			onClose={onClose}
			size="wide"
			title={item.title}
		>
			<div className="item-workflow">
				<section className="item-workflow__overview">
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

					{item.description ? (
						<p className="item-workflow__description" dir="auto">
							{item.description}
						</p>
					) : null}

					<dl className="item-workflow__facts">
						<div>
							<dt>{t("item.quantity")}</dt>
							<dd>{formatNumber(locale, item.quantityNeeded)}</dd>
						</div>
						<div>
							<dt>{t("item.group")}</dt>
							<dd dir="auto">{item.groupLabel ?? t("item.noGroup")}</dd>
						</div>
						<div>
							<dt>{t("item.budgetInput")}</dt>
							<dd>
								{item.budget
									? formatMoney(
											locale,
											item.budget.minor,
											item.budget.currency,
										)
									: t("workflow.none")}
							</dd>
						</div>
						<div>
							<dt>{t("item.deadlineInput")}</dt>
							<dd>
								{item.deadlineAt
									? formatDate(locale, item.deadlineAt)
									: t("workflow.none")}
							</dd>
						</div>
					</dl>

					<div className="item-workflow__requirements">
						<span>{t("item.requirements")}</span>
						<p dir="auto">
							{item.requirements ?? t("workflow.noRequirements")}
						</p>
					</div>
				</section>

				<aside className="item-workflow__decision">
					<span className="eyebrow">{t("workflow.decisionEyebrow")}</span>
					<h3>{t("workflow.decisionTitle")}</h3>
					<p>{t("workflow.decisionBody")}</p>
					{item.archivedAt ? (
						<p className="workflow-readonly">{t("workflow.archivedReadonly")}</p>
					) : statuses.length === 0 ? (
						<p className="workflow-readonly">{t("workflow.statusReadonly")}</p>
					) : (
						<form className="workflow-status-form" onSubmit={submitStatus}>
							<label className="field field--dark">
								<span className="field__label">
									{t("workflow.nextStatus")}
								</span>
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
							<label className="field field--dark">
								<span className="field__label">
									{t("workflow.decisionNote")}
									<small>{t("common.optional")}</small>
								</span>
								<textarea
									value={note}
									onChange={(event) => setNote(event.target.value)}
									placeholder={t("workflow.decisionNotePlaceholder")}
									maxLength={1_000}
									rows={3}
									disabled={busy}
								/>
							</label>
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
							<button
								type="submit"
								className="button button--light"
								disabled={busy || nextStatus === ""}
							>
								{busy ? t("common.saving") : t("workflow.confirmStatus")}
							</button>
						</form>
					)}
				</aside>

				<section className="item-workflow__history">
					<header>
						<div>
							<span className="eyebrow">{t("workflow.historyEyebrow")}</span>
							<h3>{t("workflow.historyTitle")}</h3>
						</div>
						<span>{formatNumber(locale, events.length)}</span>
					</header>
					{error ? (
						<p className="field-error" role="alert">
							{error}
						</p>
					) : loading ? (
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
				</section>
			</div>
		</EditorDialog>
	);
}
