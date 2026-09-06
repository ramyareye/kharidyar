import {
  localCodexCredentialsSchema,
  localCodexStatusSchema,
} from "@kharidyar/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useLocale } from "./locale-context";

export function LocalCodexPanel() {
  const { t } = useLocale();
  const [status, setStatus] = useState<z.infer<
    typeof localCodexStatusSchema
  > | null>(null);
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<z.infer<
    typeof localCodexCredentialsSchema
  > | null>(null);
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/local-codex/pairings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = localCodexStatusSchema.parse(await response.json());
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [revision]);
  async function mutate(id?: string) {
    setBusy(true);
    setError(false);
    setCredentials(null);
    try {
      const response = await fetch(
        id
          ? `/api/local-codex/pairings/${encodeURIComponent(id)}`
          : "/api/local-codex/pairings",
        {
          method: id ? "DELETE" : "POST",
          headers: { "content-type": "application/json" },
          body: id ? undefined : JSON.stringify({ name }),
        },
      );
      if (!response.ok) throw new Error();
      if (!id)
        setCredentials(
          localCodexCredentialsSchema.parse(await response.json()),
        );
      setRevision((value) => value + 1);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!status?.enabled)
    return error ? <p role="alert">{t("localCodex.error")}</p> : null;
  return (
    <section className="connector-card local-codex-panel">
      <h2>{t("localCodex.title")}</h2>
      <p>{t("localCodex.privacy")}</p>
      <p>{t("localCodex.setup")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <label>
          {t("localCodex.name")}
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </label>
        <button
          className="button button--primary"
          disabled={busy || !!credentials || !name.trim()}
        >
          {t("localCodex.pair")}
        </button>
      </form>
      {credentials && (
        <div aria-live="polite">
          <p>{t("localCodex.tokenNote")}</p>
          <code dir="ltr">
            bun run local:codex pair --origin {credentials.origin}
          </code>
          <details>
            <summary>{t("localCodex.reveal")}</summary>
            <input
              aria-label={t("localCodex.reveal")}
              autoComplete="off"
              dir="ltr"
              value={credentials.token}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </details>
          <button
            className="button button--quiet"
            onClick={() => setCredentials(null)}
          >
            {t("connectors.dismissSecret")}
          </button>
        </div>
      )}
      <p>{t("localCodex.disconnectNote")}</p>
      {status.pairings.map((pairing) => (
        <div className="connector-row" key={pairing.id}>
          <strong>{pairing.name}</strong>
          <button
            className="button button--secondary"
            disabled={busy}
            onClick={() => void mutate(pairing.id)}
          >
            {t("connectors.disconnect")}
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="field-error">
          {t("localCodex.error")}
        </p>
      )}
    </section>
  );
}
