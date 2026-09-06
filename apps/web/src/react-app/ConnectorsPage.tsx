import { useEffect, useState } from "react";
import { z } from "zod";
import { authClient } from "./auth-client";
import { useLocale } from "./locale-context";
import { BrandMark, LocaleSwitch } from "./ui";
import { LocalCodexPanel } from "./LocalCodexPanel";
import "./ConnectorsPage.css";

const statusSchema = z.object({
	enabled: z.boolean(),
	endpoint: z.string().nullable(),
	connections: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			redirectUris: z.array(z.string()).optional(),
			allowWrites: z.boolean().default(false),
		}),
	),
});
const credentialsSchema = z.object({
	clientId: z.string(),
	clientSecret: z.string(),
	endpoint: z.string(),
});

export function ConnectorsPage({ email }: { email: string }) {
	const { t } = useLocale();
	const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
		null,
	);
	const [revision, setRevision] = useState(0);
	const [provider, setProvider] = useState<"chatgpt" | "claude">("chatgpt");
	const [redirectUri, setRedirectUri] = useState(
		"https://chatgpt.com/connector_platform_oauth_redirect",
	);
	const [credentials, setCredentials] = useState<z.infer<
		typeof credentialsSchema
	> | null>(null);
	const [allowWrites, setAllowWrites] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const consent = window.location.pathname === "/connectors/consent";
	const query = new URLSearchParams(window.location.search);
	const client = status?.connections.find(
		({ id }) => id === query.get("client_id"),
	);
	const scopes = (query.get("scope") ?? "").split(" ").filter(Boolean);
	const validConsent = Boolean(
		client &&
			scopes.includes("wantkit:read") &&
			scopes.every((scope) =>
				["wantkit:read", "wantkit:write", "offline_access"].includes(scope),
			) &&
			(!scopes.includes("wantkit:write") || client.allowWrites) &&
			!query.has("claims") &&
			client.redirectUris?.includes(query.get("redirect_uri") ?? ""),
	);

	useEffect(() => {
		const controller = new AbortController();
		void fetch("/api/connectors", {
			signal: controller.signal,
			cache: "no-store",
		})
			.then(async (response) => {
				if (!response.ok) throw new Error("Connector status unavailable");
				const data = statusSchema.parse(await response.json());
				if (!controller.signal.aborted) setStatus(data);
			})
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true);
			});
		return () => controller.abort();
	}, [revision]);

	async function createConnection() {
		setBusy(true);
		setFailed(false);
		setCredentials(null);
		try {
			const response = await fetch("/api/connectors", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider, redirectUri, allowWrites }),
			});
			if (!response.ok) throw new Error("Registration failed");
			setCredentials(credentialsSchema.parse(await response.json()));
			setRevision((value) => value + 1);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}
	async function disconnect(clientId: string) {
		setBusy(true);
		setFailed(false);
		try {
			const response = await fetch(
				`/api/connectors/${encodeURIComponent(clientId)}`,
				{ method: "DELETE" },
			);
			if (!response.ok) throw new Error("Disconnect failed");
			setCredentials(null);
			setRevision((value) => value + 1);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}
	async function decide(accept: boolean) {
		if (!validConsent) return;
		setBusy(true);
		setFailed(false);
		try {
			const result = await authClient.oauth2.consent({ accept });
			if (result.error || !result.data?.url) throw new Error("Consent failed");
			const target = new URL(result.data.url);
			// Follow only the registered callback or a same-origin OAuth continuation.
			if (
				target.origin !== window.location.origin &&
				!client?.redirectUris?.some((uri) => {
					const registered = new URL(uri);
					return (
						registered.origin === target.origin &&
						registered.pathname === target.pathname
					);
				})
			)
				throw new Error("Unexpected callback");
			window.location.assign(target.href);
		} catch {
			setFailed(true);
			setBusy(false);
		}
	}
	return (
		<div className="studio-shell connector-shell">
			<header className="studio-header">
				<BrandMark compact />
				<LocaleSwitch />
			</header>
			<main className="connectors-page">
				<a href="/">{t("connectors.back")}</a>
				<p className="eyebrow">{t("connectors.pilot")}</p>
				<h1>{t(consent ? "connectors.consentTitle" : "connectors.title")}</h1>
				<p>{t("connectors.account", { email })}</p>
				<p>{t("connectors.privacy")}</p>
				<p>{t("connectors.cost")}</p>
				{!consent && <LocalCodexPanel />}
				{failed && (
					<p role="alert" className="field-error">
						{t("connectors.error")}
					</p>
				)}
				{!status && !failed && <p role="status">{t("common.loading")}</p>}
				{status && !status.enabled && (
					<p role="status">{t("connectors.disabled")}</p>
				)}
				{status?.enabled &&
					(consent ? (
						<section className="connector-card">
							<h2>{client?.name ?? t("connectors.invalidRequest")}</h2>
							{validConsent ? (
								<>
									<p>
										{t(
											scopes.includes("wantkit:write")
												? "connectors.writeAccess"
												: "connectors.readAccess",
										)}
									</p>
									<p>{t("connectors.refresh")}</p>
									<p>
										{t("connectors.returnTo")}{" "}
										<b dir="ltr">
											{new URL(query.get("redirect_uri") ?? "").hostname}
										</b>
									</p>
									<div className="connector-actions">
										<button
											className="button button--primary"
											disabled={busy}
											onClick={() => void decide(true)}
										>
											{t(
												scopes.includes("wantkit:write")
													? "connectors.allowWrite"
													: "connectors.allow",
											)}
										</button>
										<button
											className="button button--secondary"
											disabled={busy}
											onClick={() => void decide(false)}
										>
											{t("connectors.deny")}
										</button>
									</div>
								</>
							) : (
								<p>{t("connectors.invalidRequest")}</p>
							)}
						</section>
					) : (
						<>
							<section className="connector-card">
								<h2>{t("connectors.add")}</h2>
								<p>{t("connectors.setup")}</p>
								<p>{t("connectors.writeReconnect")}</p>
								<form
									onSubmit={(event) => {
										event.preventDefault();
										void createConnection();
									}}
								>
									<label>
										{t("connectors.assistant")}
										<select
											value={provider}
											disabled={busy}
											onChange={(event) => {
												const next =
													event.target.value === "claude"
														? "claude"
														: "chatgpt";
												setProvider(next);
												setRedirectUri(
													next === "claude"
														? "https://claude.ai/api/mcp/auth_callback"
														: "https://chatgpt.com/connector_platform_oauth_redirect",
												);
											}}
										>
											<option value="chatgpt">ChatGPT</option>
											<option value="claude">Claude</option>
										</select>
									</label>
									<label>
										{t("connectors.callback")}
										<input
											type="url"
											dir="ltr"
											value={redirectUri}
											onChange={(event) => setRedirectUri(event.target.value)}
											required
											maxLength={512}
											disabled={busy}
										/>
									</label>
									<label className="connector-write-choice">
										<input
											type="checkbox"
											checked={allowWrites}
											disabled={busy}
											onChange={(event) => setAllowWrites(event.target.checked)}
										/>
										<span>{t("connectors.enableWrites")}</span>
									</label>
									<button
										className="button button--primary"
										disabled={busy || Boolean(credentials)}
									>
										{t("connectors.create")}
									</button>
								</form>
							</section>
							{credentials && (
								<section className="connector-card" aria-live="polite">
									<h2>{t("connectors.credentials")}</h2>
									<p>{t("connectors.secretNote")}</p>
									<label>
										{t("connectors.endpoint")}
										<input
											dir="ltr"
											value={credentials.endpoint}
											readOnly
											onFocus={(event) => event.target.select()}
										/>
									</label>
									<label>
										{t("connectors.clientId")}
										<input
											dir="ltr"
											value={credentials.clientId}
											readOnly
											onFocus={(event) => event.target.select()}
										/>
									</label>
									<details>
										<summary>{t("connectors.revealSecret")}</summary>
										<label>
											{t("connectors.clientSecret")}
											<input
												dir="ltr"
												autoComplete="off"
												value={credentials.clientSecret}
												readOnly
												onFocus={(event) => event.target.select()}
											/>
										</label>
									</details>
									<button
										className="button button--quiet"
										onClick={() => setCredentials(null)}
									>
										{t("connectors.dismissSecret")}
									</button>
								</section>
							)}
							<section className="connector-card">
								<h2>{t("connectors.registered")}</h2>
								<p>{t("connectors.disconnectNote")}</p>
								{status.connections.length === 0 && (
									<p>{t("connectors.empty")}</p>
								)}
								{status.connections.map((connection) => (
									<div className="connector-row" key={connection.id}>
										<div>
											<strong>{connection.name}</strong>
											<span>
												{t(
													connection.allowWrites
														? "connectors.modeWrite"
														: "connectors.modeRead",
												)}
											</span>
											<code dir="ltr">{connection.id}</code>
										</div>
										<button
											className="button button--secondary"
											disabled={busy}
											onClick={() => void disconnect(connection.id)}
										>
											{t("connectors.disconnect")}
										</button>
									</div>
								))}
							</section>
						</>
					))}
			</main>
		</div>
	);
}
