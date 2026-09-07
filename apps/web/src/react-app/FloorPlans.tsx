import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  floorPlanLimits,
  type FloorPlansResponse,
  type FloorPlanResource,
} from "@kharidyar/contracts";
import { formatNumber } from "@kharidyar/i18n";
import { useLocale } from "./locale-context";
import {
  floorPlanApi,
  PlanningApiError,
  type FloorPlanApi,
} from "./planning-api";
import "./FloorPlans.css";

const accepted = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function FloorPlans({
  collectionId,
  api = floorPlanApi,
}: {
  collectionId: string;
  api?: FloorPlanApi;
}) {
  const { locale, t } = useLocale();
  const [data, setData] = useState<FloorPlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"error" | "invalid" | "limitError" | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<FloorPlanResource | "new" | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let active = true;
    api
      .read(collectionId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError("error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, collectionId]);
  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (saved && !busy)
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : addRef.current
      )?.focus();
  }, [saved, busy]);

  function openEditor(plan: FloorPlanResource | "new") {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setTitle(plan === "new" ? "" : plan.title);
    setNotes(plan === "new" ? "" : (plan.notes ?? ""));
    setError(null);
    setSaved(false);
    setEditing(plan);
  }
  function closeEditor() {
    setEditing(null);
    returnFocus.current?.focus();
  }
  async function reload() {
    setLoading(true);
    setError(null);
    setData(null);
    setEditing(null);
    try {
      setData(await api.read(collectionId));
    } catch {
      setError("error");
    } finally {
      setLoading(false);
    }
  }
  async function change(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await run();
      setData(await api.read(collectionId));
      closeEditor();
      setSaved(true);
      return true;
    } catch (cause) {
      // A failed response may follow a completed write. Reload before another attempt.
      setData(null);
      setEditing(null);
      setError(
        cause instanceof PlanningApiError &&
          cause.code === "MEDIA_LIMIT_EXCEEDED"
          ? "limitError"
          : cause instanceof PlanningApiError && cause.code === "INVALID_MEDIA"
            ? "invalid"
            : "error",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const details = { title: title.trim(), notes: notes.trim() || null };
    if (editing === "new") {
      const file = fileRef.current?.files?.[0];
      if (
        !file ||
        !accepted.has(file.type) ||
        !file.size ||
        file.size > floorPlanLimits.maxFileBytes
      ) {
        setError("invalid");
        return;
      }
      await change(() => api.upload(collectionId, file, details));
    } else {
      await change(() => api.update(collectionId, editing.id, details));
    }
  }
  async function remove(plan: FloorPlanResource) {
    if (
      busy ||
      !window.confirm(t("floorPlans.deleteConfirm", { title: plan.title }))
    )
      return;
    returnFocus.current = addRef.current;
    await change(() => api.remove(collectionId, plan.id));
  }
  return (
    <div className="floor-plans" aria-busy={busy || loading}>
      <header className="floor-plans__header">
        <div>
          <h2>{t("floorPlans.heading")}</h2>
          <p>{t("floorPlans.intro")}</p>
        </div>
        {data?.permissions.canManage && !editing ? (
          <button
            ref={addRef}
            className="button button--primary"
            type="button"
            disabled={busy || data.plans.length >= floorPlanLimits.maxFiles}
            onClick={() => openEditor("new")}
          >
            {t("floorPlans.add")}
          </button>
        ) : null}
      </header>
      <p className="floor-plans__privacy">{t("floorPlans.privacy")}</p>
      {loading ? <p role="status">{t("common.loading")}</p> : null}
      {error ? (
        <div className="floor-plans__error" role="alert">
          <p>{t(`floorPlans.${error}`)}</p>
          {!data ? (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy || loading}
              onClick={() => void reload()}
            >
              {t("floorPlans.reload")}
            </button>
          ) : null}
        </div>
      ) : null}
      {saved ? (
        <p role="status" className="floor-plans__saved">
          {t("floorPlans.saved")}
        </p>
      ) : null}
      {editing ? (
        <form
          className="floor-plans__form"
          onSubmit={(event) => void submit(event)}
        >
          <h3>{t(editing === "new" ? "floorPlans.add" : "floorPlans.edit")}</h3>
          <label className="field">
            <span className="field__label">{t("floorPlans.title")}</span>
            <input
              ref={titleRef}
              required
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {editing === "new" ? (
            <label className="field">
              <span className="field__label">{t("floorPlans.file")}</span>
              <input
                ref={fileRef}
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={busy}
                aria-describedby="floor-plan-limits"
              />
              <span id="floor-plan-limits" className="floor-plans__hint">
                {t("floorPlans.limits")}
              </span>
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">{t("floorPlans.notes")}</span>
            <textarea
              rows={3}
              maxLength={4000}
              value={notes}
              disabled={busy}
              onChange={(event) => setNotes(event.target.value)}
              aria-describedby="floor-plan-notes-hint"
            />
            <span id="floor-plan-notes-hint" className="floor-plans__hint">
              {t("floorPlans.notesHint")}
            </span>
          </label>
          {editing === "new" ? (
            <p className="floor-plans__hint">{t("floorPlans.pdfNotice")}</p>
          ) : null}
          <div className="floor-plans__actions">
            <button
              className="button button--primary"
              disabled={busy || !title.trim()}
              type="submit"
            >
              {t(
                busy
                  ? "common.saving"
                  : editing === "new"
                    ? "floorPlans.add"
                    : "common.save",
              )}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={closeEditor}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : null}
      {data?.plans.length === 0 && !editing ? (
        <p className="floor-plans__empty">{t("floorPlans.empty")}</p>
      ) : null}
      {data &&
      data.plans.length >= floorPlanLimits.maxFiles &&
      data.permissions.canManage ? (
        <p>{t("floorPlans.full")}</p>
      ) : null}
      <div className="floor-plans__list">
        {data?.plans.map((plan) => (
          <article key={plan.id} className="floor-plan" aria-label={plan.title}>
            <div className="floor-plan__visual">
              {plan.contentType === "application/pdf" ? (
                <span aria-hidden="true">PDF</span>
              ) : (
                <img
                  src={plan.contentUrl}
                  alt={plan.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            <div className="floor-plan__body">
              <h3 dir="auto">{plan.title}</h3>
              <p className="floor-plan__meta">
                {plan.contentType === "application/pdf" ? "PDF" : "WebP"} ·{" "}
                {formatNumber(locale, Math.ceil(plan.byteSize / 1024))} KB
              </p>
              <p className="floor-plan__notes" dir="auto">
                {plan.notes || t("floorPlans.noNotes")}
              </p>
              <div className="floor-plans__actions">
                <a
                  className="button button--secondary"
                  href={plan.contentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(
                    plan.contentType === "application/pdf"
                      ? "floorPlans.download"
                      : "floorPlans.view",
                  )}
                </a>
                {data.permissions.canManage ? (
                  <>
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={busy || !!editing}
                      onClick={() => openEditor(plan)}
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      className="button button--secondary floor-plan__delete"
                      disabled={busy || !!editing}
                      onClick={() => void remove(plan)}
                    >
                      {t("floorPlans.delete")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
