import {
	importProposalSchema,
	type CollectionResource,
	type ImportDraftResource,
	type ImportWarningCode,
} from "@kharidyar/contracts";
import {
	formatDateTime,
	formatMoney,
	formatNumber,
	type MessageKey,
} from "@kharidyar/i18n";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useLocale } from "./locale-context";
import { PlanningApiError, type PlanningApi } from "./planning-api";
import { EditorDialog } from "./planning-forms";
import "./ResearchImportDialog.css";

const warningMessages: Record<ImportWarningCode, MessageKey> = {
	future_quantity_requires_choice: "import.warning.futureQuantity",
	inferred_quantity: "import.warning.inferredQuantity",
	inferred_unit_price: "import.warning.inferredUnitPrice",
	non_product_source: "import.warning.nonProductSource",
	partial_row: "import.warning.partialRow",
	qualified_availability: "import.warning.qualifiedAvailability",
	summary_total_incomplete: "import.warning.summaryIncomplete",
	summary_total_mismatch: "import.warning.summaryMismatch",
	unknown_shipping: "import.warning.unknownShipping",
	unmapped_fact: "import.warning.unmappedFact",
	unsupported_currency: "import.warning.unsupportedCurrency",
};

function replaceDraft(
	drafts: ImportDraftResource[],
	draft: ImportDraftResource,
): ImportDraftResource[] {
	return drafts.some(({ id }) => id === draft.id)
		? drafts.map((current) => (current.id === draft.id ? draft : current))
		: [draft, ...drafts];
}

function statusMessage(status: ImportDraftResource["status"]): MessageKey {
	return `import.status.${status}`;
}

export function ResearchImportDialog({
	api,
	collection,
	onApplied,
	onClose,
}: {
	api: PlanningApi;
	collection: CollectionResource;
	onApplied: () => void;
	onClose: () => void;
}) {
	const { locale, t } = useLocale();
	const [drafts, setDrafts] = useState<ImportDraftResource[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [format, setFormat] = useState<"json" | "markdown">("markdown");
	const [rawInput, setRawInput] = useState("");
	const [proposalText, setProposalText] = useState("");
	const selected = drafts.find(({ id }) => id === selectedId) ?? null;

	useEffect(() => {
		let current = true;
		setLoading(true);
		void api
			.listImportDrafts(collection.id)
			.then((result) => {
				if (!current) return;
				setDrafts(result);
				setSelectedId(result[0]?.id ?? null);
			})
			.catch(() => {
				if (current) setError(t("status.genericMutationError"));
			})
			.finally(() => {
				if (current) setLoading(false);
			});
		return () => {
			current = false;
		};
	}, [api, collection.id, t]);

	useEffect(() => {
		setProposalText(selected ? JSON.stringify(selected.proposal, null, 2) : "");
	}, [selected]);

	const groups = useMemo(() => {
		if (!selected) return [];
		const grouped = new Map<string, typeof selected.proposal.lines>();
		for (const line of selected.proposal.lines) {
			const key = line.groupLabel ?? "";
			grouped.set(key, [...(grouped.get(key) ?? []), line]);
		}
		return [...grouped.entries()];
	}, [selected]);

	function explainError(value: unknown): string {
		if (value instanceof PlanningApiError) {
			if (value.code === "FORBIDDEN") return t("status.permissionDenied");
			if (value.code === "BAD_REQUEST") return value.message;
		}
		return t("status.genericMutationError");
	}

	async function run(
		operation: () => Promise<ImportDraftResource>,
		success: MessageKey,
	): Promise<ImportDraftResource | null> {
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const draft = await operation();
			setDrafts((current) => replaceDraft(current, draft));
			setSelectedId(draft.id);
			setNotice(t(success));
			return draft;
		} catch (value) {
			setError(explainError(value));
			return null;
		} finally {
			setBusy(false);
		}
	}

	async function createDraft(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!rawInput.trim()) return;
		const draft = await run(
			() => api.createImportDraft(collection.id, { format, rawInput }),
			"import.created",
		);
		if (draft) setRawInput("");
	}

	async function saveCorrection() {
		if (!selected) return;
		let decoded: unknown;
		try {
			decoded = JSON.parse(proposalText);
		} catch {
			setError(t("import.invalidJson"));
			return;
		}
		const proposal = importProposalSchema.safeParse(decoded);
		if (!proposal.success) {
			setError(
				t("import.invalidProposal", {
					issue: proposal.error.issues[0]?.message ?? "",
				}),
			);
			return;
		}
		await run(
			() => api.correctImportDraft(collection.id, selected.id, proposal.data),
			"import.corrected",
		);
	}

	async function confirmCurrentQuantities() {
		if (!selected) return;
		const proposal = {
			...selected.proposal,
			lines: selected.proposal.lines.map((line) =>
				line.futureQuantity
					? {
							...line,
							item: { ...line.item, quantityOrigin: "reviewed" as const },
							candidate: {
								...line.candidate,
								quantityOrigin: "reviewed" as const,
							},
						}
					: line,
			),
		};
		await run(
			() => api.correctImportDraft(collection.id, selected.id, proposal),
			"import.quantitiesConfirmed",
		);
	}

	async function applyDraft() {
		if (!selected) return;
		const draft = await run(
			() => api.applyImportDraft(collection.id, selected.id),
			"import.applied",
		);
		if (draft?.status === "applied") onApplied();
	}

	async function discardDraft() {
		if (!selected || !window.confirm(t("import.discardConfirm"))) return;
		await run(
			() => api.discardImportDraft(collection.id, selected.id),
			"import.discarded",
		);
	}

	const blockingWarnings =
		selected?.warnings.filter(({ severity }) => severity === "error") ?? [];
	const hasFutureChoice = selected?.warnings.some(
		({ code, severity }) =>
			code === "future_quantity_requires_choice" && severity === "error",
	);

	return (
		<EditorDialog
			busy={busy}
			description={t("import.description")}
			onClose={onClose}
			size="wide"
			title={t("import.title")}
		>
			<div className="import-workbench">
				<aside className="import-intake">
					<form onSubmit={createDraft}>
						<p className="eyebrow">{t("import.newEyebrow")}</p>
						<label className="field">
							<span className="field__label">{t("import.format")}</span>
							<select
								value={format}
								onChange={(event) =>
									setFormat(event.target.value as "json" | "markdown")
								}
							>
								<option value="markdown">{t("import.formatMarkdown")}</option>
								<option value="json">{t("import.formatJson")}</option>
							</select>
						</label>
						<label className="field">
							<span className="field__label">{t("import.paste")}</span>
							<textarea
								className="import-intake__textarea"
								maxLength={100_000}
								onChange={(event) => setRawInput(event.target.value)}
								placeholder={t("import.pastePlaceholder")}
								value={rawInput}
							/>
						</label>
						<button
							type="submit"
							className="button button--primary"
							disabled={busy || !rawInput.trim()}
						>
							{t("import.preview")}
							<span aria-hidden="true">↗</span>
						</button>
					</form>

					<div className="import-history">
						<p className="eyebrow">{t("import.history")}</p>
						{loading ? (
							<p>{t("common.loading")}</p>
						) : drafts.length === 0 ? (
							<p>{t("import.noDrafts")}</p>
						) : (
							<ol>
								{drafts.map((draft, index) => (
									<li key={draft.id}>
										<button
											type="button"
											className={
												draft.id === selectedId
													? "import-history__button import-history__button--active"
													: "import-history__button"
											}
											onClick={() => setSelectedId(draft.id)}
										>
											<span>{String(index + 1).padStart(2, "0")}</span>
											<strong>{t(statusMessage(draft.status))}</strong>
											<small>{formatDateTime(locale, draft.createdAt)}</small>
										</button>
									</li>
								))}
							</ol>
						)}
					</div>
				</aside>

				<section className="import-proof" aria-live="polite">
					{error ? (
						<p className="form-error" role="alert">
							{error}
						</p>
					) : null}
					{notice ? (
						<p className="form-notice" role="status">
							{notice}
						</p>
					) : null}
					{!selected ? (
						<div className="import-proof__empty">
							<span aria-hidden="true">⌁</span>
							<h3>{t("import.emptyTitle")}</h3>
							<p>{t("import.emptyBody")}</p>
						</div>
					) : (
						<>
							<header className="import-proof__header">
								<div>
									<p className="eyebrow">{t("import.proofEyebrow")}</p>
									<h3>{t("import.proofTitle")}</h3>
								</div>
								<span
									className={`import-status import-status--${selected.status}`}
								>
									{t(statusMessage(selected.status))}
								</span>
							</header>

							<div className="import-proof__metrics">
								<span>
									{t("import.lineCount", {
										count: formatNumber(locale, selected.proposal.lines.length),
									})}
								</span>
								<span>
									{t("import.warningCount", {
										count: formatNumber(locale, selected.warnings.length),
									})}
								</span>
								<span>
									{t("import.schemaVersion", {
										version: selected.proposal.schemaVersion,
									})}
								</span>
							</div>

							{selected.warnings.length > 0 ? (
								<section className="import-warnings">
									<h4>{t("import.warnings")}</h4>
									<ul>
										{selected.warnings.map((warning, index) => (
											<li
												className={`import-warning import-warning--${warning.severity}`}
												key={`${warning.code}-${warning.lineKey ?? "draft"}-${index}`}
											>
												<span aria-hidden="true">
													{warning.severity === "error"
														? "!"
														: warning.severity === "warning"
															? "△"
															: "·"}
												</span>
												<p>
													<strong>{t(warningMessages[warning.code])}</strong>
													{warning.detail ? (
														<small dir="auto">{warning.detail}</small>
													) : null}
												</p>
											</li>
										))}
									</ul>
								</section>
							) : null}

							{hasFutureChoice && selected.permissions.canEdit ? (
								<button
									type="button"
									className="button button--secondary"
									disabled={busy}
									onClick={() => void confirmCurrentQuantities()}
								>
									{t("import.confirmCurrentQuantities")}
								</button>
							) : null}

							<div className="import-groups">
								{groups.map(([group, lines], groupIndex) => (
									<section key={group || "ungrouped"}>
										<header>
											<span>{String(groupIndex + 1).padStart(2, "0")}</span>
											<h4 dir="auto">{group || t("item.noGroup")}</h4>
										</header>
										<div>
											{lines.map((line) => (
												<article className="import-line" key={line.key}>
													<div className="import-line__title">
														<span>{line.key}</span>
														<h5 dir="auto">{line.item.title}</h5>
													</div>
													<dl>
														<div>
															<dt>{t("import.itemQuantity")}</dt>
															<dd>
																{formatNumber(locale, line.item.quantityNeeded)}{" "}
																<small>
																	{t(
																		`import.origin.${line.item.quantityOrigin}`,
																	)}
																</small>
															</dd>
														</div>
														<div>
															<dt>{t("import.plannedQuantity")}</dt>
															<dd>
																{formatNumber(
																	locale,
																	line.candidate.plannedPurchaseQuantity,
																)}{" "}
																<small>
																	{t(
																		`import.origin.${line.candidate.quantityOrigin}`,
																	)}
																</small>
															</dd>
														</div>
														<div>
															<dt>{t("import.price")}</dt>
															<dd>
																{line.offer?.facts.unitPriceMinor !== null &&
																line.offer?.facts.unitPriceMinor !==
																	undefined &&
																line.offer.facts.currency
																	? `${line.offer.facts.priceKind === "starting_at" ? t("import.startingAt") + " " : ""}${formatMoney(locale, line.offer.facts.unitPriceMinor, line.offer.facts.currency)}`
																	: t("import.unknown")}
															</dd>
														</div>
														<div>
															<dt>{t("import.merchant")}</dt>
															<dd dir="auto">
																{line.offer?.merchant.name ??
																	t("import.notOffer")}
															</dd>
														</div>
													</dl>
													{line.candidate.notes ? (
														<p dir="auto">{line.candidate.notes}</p>
													) : null}
													{line.futureQuantity ? (
														<p className="import-line__future" dir="auto">
															{t("import.futureQuantity", {
																quantity: formatNumber(
																	locale,
																	line.futureQuantity.quantity,
																),
															})}{" "}
															· {line.futureQuantity.note}
														</p>
													) : null}
													{line.source ? (
														<a
															href={line.source.url}
															target="_blank"
															rel="noopener noreferrer"
															referrerPolicy="no-referrer"
														>
															{t(`import.source.${line.source.kind}`)} ↗
														</a>
													) : null}
												</article>
											))}
										</div>
									</section>
								))}
							</div>

							{selected.reconciliations.length > 0 ? (
								<section className="import-reconciliation">
									<h4>{t("import.reconciliation")}</h4>
									{selected.reconciliations.map((entry) => (
										<div key={entry.summaryKey}>
											<span>{entry.summaryKey}</span>
											<strong>
												{t(`import.reconciliation.${entry.status}`)}
											</strong>
											<small>
												{formatMoney(
													locale,
													entry.supplied.minor,
													entry.supplied.currency,
												)}{" "}
												/{" "}
												{formatMoney(
													locale,
													entry.computedMinor,
													entry.supplied.currency,
												)}
											</small>
										</div>
									))}
								</section>
							) : null}

							{selected.rawInput ? (
								<details className="import-source-raw">
									<summary>{t("import.rawSource")}</summary>
									<pre dir="auto">{selected.rawInput}</pre>
								</details>
							) : null}

							{selected.status === "draft" && selected.permissions.canEdit ? (
								<details className="import-correction">
									<summary>{t("import.editProposal")}</summary>
									<p>{t("import.editProposalHint")}</p>
									<textarea
										value={proposalText}
										onChange={(event) => setProposalText(event.target.value)}
										spellCheck={false}
									/>
									<button
										type="button"
										className="button button--secondary"
										disabled={busy}
										onClick={() => void saveCorrection()}
									>
										{t("import.saveCorrection")}
									</button>
								</details>
							) : null}

							{selected.status === "applied" ? (
								<p className="import-application-summary">
									{t("import.applicationCount", {
										count: formatNumber(locale, selected.application.length),
									})}
								</p>
							) : null}

							<footer className="import-actions">
								<button
									type="button"
									className="button button--quiet"
									disabled={busy}
									onClick={onClose}
								>
									{t("common.close")}
								</button>
								{selected.status === "draft" && selected.permissions.canEdit ? (
									<button
										type="button"
										className="button button--quiet text-action--danger"
										disabled={busy}
										onClick={() => void discardDraft()}
									>
										{t("import.discard")}
									</button>
								) : null}
								{selected.status === "draft" &&
								selected.permissions.canApply ? (
									<button
										type="button"
										className="button button--primary"
										disabled={
											busy ||
											blockingWarnings.length > 0 ||
											selected.proposal.lines.length === 0
										}
										onClick={() => void applyDraft()}
									>
										{t("import.apply")}
										<span aria-hidden="true">↗</span>
									</button>
								) : null}
							</footer>
						</>
					)}
				</section>
			</div>
		</EditorDialog>
	);
}
