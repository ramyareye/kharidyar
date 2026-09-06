import { useEffect, useState } from "react";
import {
	mcpActionReceiptSchema,
	mcpActionReviewSchema,
} from "@kharidyar/contracts";
import { z } from "zod";
import { formatMoney, type MessageKey } from "@kharidyar/i18n";
import { BrandMark, LocaleSwitch } from "./ui";
import { useLocale } from "./locale-context";
import "./ConnectorsPage.css";

const actionTitles: Partial<Record<string, MessageKey>> = {
	archive_workspace: "assistantAction.operation.archive_workspace",
	archive_collection: "assistantAction.operation.archive_collection",
	archive_item: "assistantAction.operation.archive_item",
	remove_concept: "assistantAction.operation.remove_concept",
	archive_candidate: "assistantAction.operation.archive_candidate",
	set_planned_selection: "assistantAction.operation.set_planned_selection",
	record_purchase: "assistantAction.operation.record_purchase",
	change_item_status: "assistantAction.operation.change_item_status",
	remove_comment: "assistantAction.operation.remove_comment",
	discard_import_draft: "assistantAction.operation.discard_import_draft",
	start_research: "assistantAction.operation.start_research",
	moderate_research_result:
		"assistantAction.operation.moderate_research_result",
	delete_concept_image: "assistantAction.operation.delete_concept_image",
	create_invitation: "assistantAction.operation.create_invitation",
	revoke_invitation: "assistantAction.operation.revoke_invitation",
	change_workspace_member: "assistantAction.operation.change_workspace_member",
	remove_workspace_member: "assistantAction.operation.remove_workspace_member",
	change_collection_member:
		"assistantAction.operation.change_collection_member",
	remove_collection_member:
		"assistantAction.operation.remove_collection_member",
};
const fieldLabels: Partial<Record<string, MessageKey>> = {
	purchasedQuantity: "workflow.purchaseQuantity",
	shippingBasis: "commerce.shippingBasis",
	query: "research.query",
	sourceUrl: "commerce.sourceUrl",
	unitPriceMinor: "assistantAction.field.unitPrice",
	shippingMinor: "assistantAction.field.shipping",
	currency: "assistantAction.field.currency",
	note: "assistantAction.field.note",
	role: "assistantAction.field.role",
	invitedEmail: "assistantAction.field.invitedEmail",
	expiresAt: "assistantAction.field.expiresAt",
	restrictToEmail: "assistantAction.field.restrictToEmail",
	plannedPurchaseQuantity: "assistantAction.field.quantity",
};
type Review = z.infer<typeof mcpActionReviewSchema>;
function FieldValue({ value }: { value: unknown }) {
	const { locale, t } = useLocale();
	if (value === null) return <span>—</span>;
	if (Array.isArray(value))
		return value.length ? (
			<ul>
				{value.map((v, i) => (
					<li key={i}>
						<FieldValue value={v} />
					</li>
				))}
			</ul>
		) : (
			<span>—</span>
		);
	if (typeof value === "object") {
		const fields = Object.entries(value);
		const currency = fields.find(([key]) => key === "currency")?.[1];
		const identifiers = fields.filter(
			([key]) => key.endsWith("Id") || key.endsWith("Ids"),
		);
		const display = fields.filter(
			([key]) => !key.endsWith("Id") && !key.endsWith("Ids"),
		);
		return (
			<>
				<dl className="assistant-action-fields">
					{display.map(([key, v]) => {
						const money =
							typeof v === "number" &&
							typeof currency === "string" &&
							/^[A-Z]{3}$/.test(currency) &&
							(key === "minor" || key.endsWith("Minor"));
						const plainLabel = (
							money
								? key.replace(/Minor$/, "").replace(/^minor$/, "amount")
								: key
						)
							.replace(/([A-Z])/g, " $1")
							.replace(/_/g, " ");
						const labelKey = fieldLabels[key];
						const label = labelKey ? t(labelKey) : plainLabel;
						const shippingKey =
							key === "shippingBasis" &&
							["per_line", "per_unit", "unknown"].includes(String(v))
								? (`commerce.shippingBasis.${v}` as MessageKey)
								: null;
						return (
							<div
								key={key}
								data-nested={
									typeof v === "object" && v !== null ? true : undefined
								}
							>
								{key !== "value" && <dt>{label}</dt>}
								<dd>
									{money ? (
										<span dir="auto">{formatMoney(locale, v, currency)}</span>
									) : shippingKey ? (
										t(shippingKey)
									) : (
										<FieldValue value={v} />
									)}
								</dd>
							</div>
						);
					})}
				</dl>
				{identifiers.length > 0 && (
					<details className="assistant-action-identifiers">
						<summary>{t("assistantAction.identifiers")}</summary>
						<dl className="assistant-action-fields">
							{identifiers.map(([key, v]) => (
								<div key={key}>
									<dt>{key.replace(/([A-Z])/g, " $1")}</dt>
									<dd>
										<span dir="auto">
											{Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
										</span>
									</dd>
								</div>
							))}
						</dl>
					</details>
				)}
			</>
		);
	}
	if (typeof value === "boolean")
		return (
			<span>{t(value ? "assistantAction.yes" : "assistantAction.no")}</span>
		);
	return <span dir="auto">{String(value)}</span>;
}
export function AssistantActionPage() {
	const { t } = useLocale();
	const [review, setReview] = useState<Review | null>(null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const id = window.location.pathname.split("/").at(-1) ?? "";
	useEffect(() => {
		const controller = new AbortController();
		fetch(`/api/connectors/actions/${encodeURIComponent(id)}`, {
			cache: "no-store",
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) throw new Error();
				return mcpActionReviewSchema.parse(await response.json());
			})
			.then((data) => {
				if (!controller.signal.aborted) setReview(data);
			})
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true);
			});
		return () => controller.abort();
	}, [id]);
	async function decide(approve: boolean) {
		if (!review || busy) return;
		setBusy(true);
		setFailed(false);
		try {
			const response = await fetch(
				`/api/connectors/actions/${encodeURIComponent(id)}/decision`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ approve }),
				},
			);
			if (!response.ok) throw new Error();
			const receipt = mcpActionReceiptSchema.parse(await response.json());
			setReview({ ...review, receipt, canApprove: false });
		} catch {
			setFailed(true);
			setReview({
				...review,
				canApprove: false,
				receipt: { ...review.receipt, status: "unknown" },
			});
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="studio-shell connector-shell">
			<header className="studio-header">
				<BrandMark compact />
				<LocaleSwitch />
			</header>
			<main className="connectors-page assistant-review-page">
				<a href="/connectors">{t("connectors.title")}</a>
				<h1>{t("assistantAction.title")}</h1>
				<p>{t("assistantAction.intro")}</p>
				{failed && (
					<p role="alert" className="field-error">
						{t("assistantAction.error")}
					</p>
				)}
				{!review && !failed && <p role="status">{t("common.loading")}</p>}
				{review && (
					<section className="connector-card">
						<h2>
							{actionTitles[review.receipt.operation]
								? t(actionTitles[review.receipt.operation]!)
								: review.title}
						</h2>
						<p>
							<strong>{t("assistantAction.target")}: </strong>
							<span dir="auto">{review.target}</span>
						</p>

						{review.arguments && <FieldValue value={review.arguments} />}
						<p role="status">
							{t(`assistantAction.status.${review.receipt.status}`)}
						</p>
						{review.receipt.status === "pending" && (
							<>
								<p>
									{t(
										review.receipt.operation === "record_purchase"
											? "assistantAction.purchaseNote"
											: "assistantAction.reviewNote",
									)}
								</p>
								<div className="connector-actions">
									<button
										className="button button--primary"
										disabled={busy || !review.canApprove}
										onClick={() => void decide(true)}
									>
										{t("assistantAction.approve")}
									</button>
									<button
										className="button button--secondary"
										disabled={busy}
										onClick={() => void decide(false)}
									>
										{t("assistantAction.deny")}
									</button>
								</div>
								{!review.canApprove && (
									<p className="field-error">{t("assistantAction.changed")}</p>
								)}
							</>
						)}
						{review.receipt.status !== "pending" && (
							<p>{t("assistantAction.returnToChat")}</p>
						)}
					</section>
				)}
			</main>
		</div>
	);
}

export function ConnectorRecoveryPage() {
	const { t } = useLocale();
	const missingClient =
		new URLSearchParams(window.location.search).get("code") ===
		"invalid_client";
	return (
		<div className="studio-shell connector-shell">
			<header className="studio-header">
				<BrandMark compact />
				<LocaleSwitch />
			</header>
			<main className="connectors-page">
				<h1>{t("connectors.recoveryTitle")}</h1>
				<section className="connector-card">
					<p>
						{t(
							missingClient
								? "connectors.recoveryClient"
								: "connectors.recoveryGeneric",
						)}
					</p>
					<ol>
						<li>{t("connectors.recoveryStep1")}</li>
						<li>{t("connectors.recoveryStep2")}</li>
						<li>{t("connectors.recoveryStep3")}</li>
					</ol>
					<a className="button button--primary" href="/connectors">
						{t("connectors.title")}
					</a>
				</section>
			</main>
		</div>
	);
}
