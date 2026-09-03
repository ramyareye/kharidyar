import type {
  CollectionResource,
  ItemResource,
  ResearchDeskResponse,
  ResearchResultPromotionInput,
  ResearchResultResource,
  ResearchRunResource,
} from "@kharidyar/contracts";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  type MessageKey,
} from "@kharidyar/i18n";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { parseEuroAmount } from "./collection-direction-state";
import { useLocale } from "./locale-context";
import { PlanningApiError, type PlanningApi } from "./planning-api";
import { EditorDialog } from "./planning-forms";
import "./ProviderResearchDialog.css";

const activeStatuses = new Set<ResearchRunResource["status"]>([
  "queued",
  "running",
  "partial",
]);

const runStatusKey: Record<ResearchRunResource["status"], MessageKey> = {
  queued: "research.status.queued",
  running: "research.status.running",
  partial: "research.status.partial",
  completed: "research.status.completed",
  failed: "research.status.failed",
  cancelled: "research.status.cancelled",
};

const extractionStatusKey: Record<
  ResearchResultResource["source"]["extractionStatus"],
  MessageKey
> = {
  not_requested: "research.extraction.notRequested",
  not_allowed: "research.extraction.notAllowed",
  completed: "research.extraction.completed",
  failed: "research.extraction.failed",
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof PlanningApiError) return error.message;
  return fallback;
}

function separatedValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function PromotionForm({
  busy,
  defaultItemId,
  items,
  onSubmit,
  result,
}: {
  busy: boolean;
  defaultItemId: string | null;
  items: ItemResource[];
  onSubmit: (value: ResearchResultPromotionInput) => Promise<void>;
  result: ResearchResultResource;
}) {
  const { t } = useLocale();
  const suggestion = result.suggestion;
  const [itemId, setItemId] = useState(defaultItemId ?? items[0]?.id ?? "");
  const [title, setTitle] = useState(suggestion?.product.title ?? result.title);
  const [merchantName, setMerchantName] = useState(
    suggestion?.merchant.name ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [confirmed, setConfirmed] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  if (suggestion === null) {
    return <p className="research-note">{t("research.promotion.expired")}</p>;
  }
  const promotionSuggestion = suggestion;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (
      !itemId ||
      !title.trim() ||
      !merchantName.trim() ||
      !Number.isSafeInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      !confirmed
    ) {
      setValidation(t("research.promotion.validation"));
      return;
    }
    setValidation(null);
    await onSubmit({
      candidateNotes: result.summary,
      confirmedDirectProductUrl: true,
      itemId,
      merchant: { ...promotionSuggestion.merchant, name: merchantName },
      offer: promotionSuggestion.offer,
      plannedPurchaseQuantity: parsedQuantity,
      product: { ...promotionSuggestion.product, title },
    });
  }

  return (
    <form className="research-promotion" onSubmit={submit} noValidate>
      <div className="research-form__grid">
        <label className="field">
          <span className="field__label">{t("research.item")}</span>
          <select
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
          >
            <option value="">—</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t("commerce.quantity")}</span>
          <input
            min="1"
            onChange={(event) => setQuantity(event.target.value)}
            step="1"
            type="number"
            value={quantity}
          />
        </label>
        <label className="field research-form__wide">
          <span className="field__label">{t("commerce.productTitle")}</span>
          <input
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <label className="field research-form__wide">
          <span className="field__label">{t("commerce.merchantName")}</span>
          <input
            maxLength={160}
            onChange={(event) => setMerchantName(event.target.value)}
            value={merchantName}
          />
        </label>
      </div>
      <label className="research-confirmation">
        <input
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        <span>{t("research.promotion.confirm")}</span>
      </label>
      {validation ? <p className="field-error">{validation}</p> : null}
      <button
        className="button button--secondary"
        disabled={busy}
        type="submit"
      >
        {t("research.promotion.submit")}
      </button>
    </form>
  );
}

function ResultCard({
  busy,
  defaultItemId,
  items,
  onModerate,
  onPromote,
  result,
}: {
  busy: boolean;
  defaultItemId: string | null;
  items: ItemResource[];
  onModerate: (resultId: string, dismissed: boolean) => Promise<void>;
  onPromote: (
    resultId: string,
    value: ResearchResultPromotionInput,
  ) => Promise<void>;
  result: ResearchResultResource;
}) {
  const { locale, t } = useLocale();
  const facts = result.suggestion?.offer.facts;
  const price =
    facts?.unitPriceMinor !== null &&
    facts?.unitPriceMinor !== undefined &&
    facts.currency
      ? formatMoney(locale, facts.unitPriceMinor, facts.currency)
      : t("research.priceUnknown");

  return (
    <article
      className={
        result.status === "dismissed"
          ? "research-result research-result--dismissed"
          : "research-result"
      }
    >
      <header className="research-result__header">
        <div>
          <p>{result.suggestion?.product.brand ?? t("research.result")}</p>
          <h4 dir="auto">{result.title}</h4>
        </div>
        <span className="research-result__price">{price}</span>
      </header>
      {result.summary ? <p dir="auto">{result.summary}</p> : null}
      <div className="research-result__source">
        <a href={result.source.url} rel="noreferrer" target="_blank">
          {result.source.title ?? new URL(result.source.url).hostname} ↗
        </a>
        <span>
          {t("research.retrieved", {
            date: formatDateTime(locale, result.source.retrievedAt),
          })}
        </span>
        <span>{t(extractionStatusKey[result.source.extractionStatus])}</span>
      </div>
      {result.promotion ? (
        <p className="research-promotion-complete">
          {t("research.promotion.complete")}
        </p>
      ) : (
        <div className="research-result__actions">
          <button
            className="text-action"
            disabled={busy}
            onClick={() =>
              void onModerate(result.id, result.status === "active")
            }
            type="button"
          >
            {result.status === "active"
              ? t("research.dismiss")
              : t("research.restore")}
          </button>
          {result.status === "active" && items.length > 0 ? (
            <details>
              <summary>{t("research.promotion.open")}</summary>
              <PromotionForm
                busy={busy}
                defaultItemId={defaultItemId}
                items={items}
                onSubmit={(value) => onPromote(result.id, value)}
                result={result}
              />
            </details>
          ) : null}
        </div>
      )}
    </article>
  );
}

function RunPanel({
  busy,
  defaultItemId,
  items,
  onCancel,
  onModerate,
  onPromote,
  run,
}: {
  busy: boolean;
  defaultItemId: string | null;
  items: ItemResource[];
  onCancel: (runId: string) => Promise<void>;
  onModerate: (resultId: string, dismissed: boolean) => Promise<void>;
  onPromote: (
    resultId: string,
    value: ResearchResultPromotionInput,
  ) => Promise<void>;
  run: ResearchRunResource;
}) {
  const { locale, t } = useLocale();
  return (
    <section className="research-run">
      <header className="research-run__header">
        <div>
          <span
            className={`research-run__status research-run__status--${run.status}`}
          >
            {t(runStatusKey[run.status])}
          </span>
          <small>{formatDateTime(locale, run.createdAt)}</small>
        </div>
        {activeStatuses.has(run.status) ? (
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={() => void onCancel(run.id)}
            type="button"
          >
            {t("research.cancel")}
          </button>
        ) : null}
      </header>
      {run.errorMessage ? (
        <p className="field-error" role="alert">
          {t("research.failedMessage", { message: run.errorMessage })}
        </p>
      ) : null}
      {run.results.length === 0 && run.status === "completed" ? (
        <p className="research-note">{t("research.noResults")}</p>
      ) : (
        <div className="research-results">
          {run.results.map((result) => (
            <ResultCard
              busy={busy}
              defaultItemId={defaultItemId}
              items={items}
              key={result.id}
              onModerate={onModerate}
              onPromote={onPromote}
              result={result}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProviderResearchDialog({
  api,
  collection,
  items,
  onChange,
  onClose,
}: {
  api: PlanningApi;
  collection: CollectionResource;
  items: ItemResource[];
  onChange: () => void;
  onClose: () => void;
}) {
  const { locale, t } = useLocale();
  const [desk, setDesk] = useState<ResearchDeskResponse | null>(null);
  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [preferredDomains, setPreferredDomains] = useState("");
  const [requiredTerms, setRequiredTerms] = useState("");
  const [excludedTerms, setExcludedTerms] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = useMemo(
    () =>
      desk?.requests.some((request) =>
        request.runs.some((run) => activeStatuses.has(run.status)),
      ) ?? false,
    [desk],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .readResearchDesk(collection.id)
      .then((value) => {
        if (!cancelled) setDesk(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught, t("research.loadError")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, collection.id, t]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void api
        .readResearchDesk(collection.id)
        .then(setDesk)
        .catch(() => undefined);
    }, 2_500);
    return () => window.clearInterval(timer);
  }, [active, api, collection.id]);

  async function mutate(
    operation: () => Promise<ResearchDeskResponse>,
    message: MessageKey,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setDesk(await operation());
      setNotice(t(message));
    } catch (caught) {
      setError(errorMessage(caught, t("status.genericMutationError")));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = parseEuroAmount(maxPrice);
    if (!query.trim() || !price.valid) {
      setError(t("research.validation"));
      return;
    }
    await mutate(
      () =>
        api.createResearchRequest(collection.id, {
          constraints: {
            currency: "EUR",
            excludedTerms: separatedValues(excludedTerms),
            maxUnitPriceMinor: price.minor,
            preferredDomains: separatedValues(preferredDomains).map((domain) =>
              domain.toLowerCase(),
            ),
            requiredTerms: separatedValues(requiredTerms),
          },
          itemId: itemId || null,
          query,
        }),
      "research.created",
    );
  }

  return (
    <EditorDialog
      busy={busy}
      description={t("research.description")}
      onClose={onClose}
      size="wide"
      title={`${t("research.title")} · ${collection.name}`}
    >
      <div className="research-desk">
        <section className="research-query">
          <header>
            <p className="eyebrow">{t("research.newEyebrow")}</p>
            <h3>{t("research.newTitle")}</h3>
          </header>
          <form onSubmit={submit} noValidate>
            <label className="field">
              <span className="field__label">{t("research.query")}</span>
              <textarea
                maxLength={1_000}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("research.queryPlaceholder")}
                rows={3}
                value={query}
              />
            </label>
            <div className="research-form__grid">
              <label className="field">
                <span className="field__label">
                  {t("research.itemOptional")}
                </span>
                <select
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                >
                  <option value="">{t("research.wholeCollection")}</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">{t("research.maxPrice")}</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="250.00"
                  value={maxPrice}
                />
              </label>
              <label className="field research-form__wide">
                <span className="field__label">
                  {t("research.preferredDomains")}
                </span>
                <input
                  onChange={(event) => setPreferredDomains(event.target.value)}
                  placeholder="jysk.nl, loods5.nl"
                  value={preferredDomains}
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("research.requiredTerms")}
                </span>
                <input
                  onChange={(event) => setRequiredTerms(event.target.value)}
                  placeholder={t("research.termsPlaceholder")}
                  value={requiredTerms}
                />
              </label>
              <label className="field">
                <span className="field__label">
                  {t("research.excludedTerms")}
                </span>
                <input
                  onChange={(event) => setExcludedTerms(event.target.value)}
                  placeholder={t("research.termsPlaceholder")}
                  value={excludedTerms}
                />
              </label>
            </div>
            <p className="research-note">{t("research.providerNote")}</p>
            <button
              className="button button--primary"
              disabled={
                busy || !query.trim() || desk?.permissions.canCreate === false
              }
              type="submit"
            >
              {t("research.start")}
            </button>
          </form>
        </section>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="research-notice" role="status">
            {notice}
          </p>
        ) : null}

        <section className="research-register">
          <header>
            <div>
              <p className="eyebrow">{t("research.historyEyebrow")}</p>
              <h3>{t("research.history")}</h3>
            </div>
            <span>{formatNumber(locale, desk?.requests.length ?? 0)}</span>
          </header>
          {loading ? (
            <p className="research-note">{t("common.loading")}</p>
          ) : desk?.requests.length ? (
            <div className="research-requests">
              {desk.requests.map((request) => {
                const latest = request.runs[0];
                return (
                  <article className="research-request" key={request.id}>
                    <header className="research-request__header">
                      <div>
                        <h3 dir="auto">{request.query}</h3>
                        <p>
                          {request.itemId
                            ? (items.find((item) => item.id === request.itemId)
                                ?.title ?? t("research.item"))
                            : t("research.wholeCollection")}
                        </p>
                      </div>
                      {latest &&
                      !activeStatuses.has(latest.status) &&
                      desk.permissions.canCreate ? (
                        <button
                          className="button button--quiet"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () =>
                                api.retryResearchRequest(
                                  collection.id,
                                  request.id,
                                ),
                              "research.created",
                            )
                          }
                          type="button"
                        >
                          {t("common.retry")}
                        </button>
                      ) : null}
                    </header>
                    {request.runs.map((run) => (
                      <RunPanel
                        busy={busy}
                        defaultItemId={request.itemId}
                        items={items}
                        key={run.id}
                        onCancel={(runId) =>
                          mutate(
                            () => api.cancelResearchRun(collection.id, runId),
                            "research.cancelled",
                          )
                        }
                        onModerate={(resultId, dismissed) =>
                          mutate(
                            () =>
                              api.moderateResearchResult(
                                collection.id,
                                resultId,
                                dismissed,
                              ),
                            dismissed
                              ? "research.dismissed"
                              : "research.restored",
                          )
                        }
                        onPromote={async (resultId, value) => {
                          await mutate(
                            () =>
                              api.promoteResearchResult(
                                collection.id,
                                resultId,
                                value,
                              ),
                            "research.promoted",
                          );
                          onChange();
                        }}
                        run={run}
                      />
                    ))}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="research-note">{t("research.empty")}</p>
          )}
        </section>
      </div>
    </EditorDialog>
  );
}
