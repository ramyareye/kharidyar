import type {
	CollectionResource,
	ContextSnapshotResource,
} from "@kharidyar/contracts";
import { formatDateTime, formatNumber } from "@kharidyar/i18n";
import { useState } from "react";

import { useLocale } from "./locale-context";
import { EditorDialog } from "./planning-forms";
import { PlanningApiError, type PlanningApi } from "./planning-api";
import "./ContextExportDialog.css";

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof PlanningApiError ? error.message : fallback;
}

export function ContextExportDialog({
	api,
	collection,
	onClose,
}: {
	api: PlanningApi;
	collection: CollectionResource;
	onClose: () => void;
}) {
	const { locale, t } = useLocale();
	const [snapshot, setSnapshot] = useState<ContextSnapshotResource | null>(null);
	const [markdown, setMarkdown] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function buildSnapshot() {
		setBusy(true);
		setCopied(false);
		setError(null);
		try {
			const created = await api.createContextSnapshot(collection.id);
			setSnapshot(created);
			setMarkdown(await api.exportContextSnapshotMarkdown(created.id));
		} catch (caught) {
			setError(errorMessage(caught, t("context.error")));
		} finally {
			setBusy(false);
		}
	}

	async function copyMarkdown() {
		if (markdown === null) return;
		setError(null);
		try {
			await navigator.clipboard.writeText(markdown);
			setCopied(true);
		} catch {
			setError(t("context.copyError"));
		}
	}

	function downloadMarkdown() {
		if (markdown === null || snapshot === null) return;
		const url = URL.createObjectURL(
			new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `kharidyar-context-${snapshot.id}.md`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	return (
		<EditorDialog
			busy={busy}
			description={t("context.description")}
			onClose={onClose}
			size="wide"
			title={t("context.title")}
		>
			<div className="context-export">
				<section className="context-export__notice">
					<p className="eyebrow">{t("context.eyebrow")}</p>
					<h3>{t("context.privateTitle")}</h3>
					<p>{t("context.privateBody")}</p>
				</section>

				{snapshot === null || markdown === null ? (
					<section className="context-export__empty">
						<div aria-hidden="true">{`{ }`}</div>
						<h3>{t("context.emptyTitle")}</h3>
						<p>{t("context.emptyBody", { name: collection.name })}</p>
						<button
							className="button button--primary"
							disabled={busy}
							onClick={() => void buildSnapshot()}
							type="button"
						>
							{busy ? t("context.building") : t("context.build")}
							<span aria-hidden="true">↗</span>
						</button>
					</section>
				) : (
					<>
						<section className="context-export__register" aria-live="polite">
							<div>
								<span>{t("context.schema")}</span>
								<strong>{snapshot.schemaVersion}</strong>
							</div>
							<div>
								<span>{t("context.size")}</span>
								<strong>{formatNumber(locale, snapshot.contentBytes)} B</strong>
							</div>
							<div>
								<span>{t("context.created")}</span>
								<strong>{formatDateTime(locale, snapshot.createdAt)}</strong>
							</div>
						</section>

						<section className="context-export__preview">
							<header>
								<div>
									<p className="eyebrow">{t("context.ready")}</p>
									<h3>{t("context.preview")}</h3>
								</div>
								<div className="context-export__actions">
									<button
										className="button button--quiet"
										onClick={() => void copyMarkdown()}
										type="button"
									>
										{copied ? t("context.copied") : t("context.copy")}
									</button>
									<button
										className="button button--secondary"
										onClick={downloadMarkdown}
										type="button"
									>
										{t("context.download")}
									</button>
								</div>
							</header>
							<pre dir="auto" tabIndex={0}>
								{markdown}
							</pre>
						</section>

						<div className="context-export__footer">
							<button
								className="text-action"
								disabled={busy}
								onClick={() => void buildSnapshot()}
								type="button"
							>
								{t("context.rebuild")}
							</button>
							<button
								className="button button--quiet"
								onClick={onClose}
								type="button"
							>
								{t("common.close")}
							</button>
						</div>
					</>
				)}

				{error ? (
					<p className="field-error" role="alert">
						{error}
					</p>
				) : null}
			</div>
		</EditorDialog>
	);
}
