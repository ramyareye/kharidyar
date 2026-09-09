import { useEffect, useRef, useState } from "react";
import type { InvitationPreviewResponse } from "@kharidyar/contracts";
import { formatDateTime, type MessageKey } from "@kharidyar/i18n";
import { authClient } from "./auth-client";
import { invitationApi, PlanningApiError } from "./planning-api";
import {
	clearPendingInvitation,
	invitationStorage,
	readInvitationToken,
	rememberInvitation,
} from "./invitation-link";
import { useLocale } from "./locale-context";
import { BrandMark, LocaleSwitch } from "./ui";
import "./InvitationPage.css";

type User = { email: string; name: string } | null;
type Preview = InvitationPreviewResponse["invitation"];
type ReviewState =
	| { status: "loading" }
	| { status: "ready"; invitation: Preview }
	| { status: "accepted" }
	| { status: "error"; message: MessageKey; retryable: boolean };
const roleLabels: Record<Preview["role"], MessageKey> = {
	viewer: "collaboration.role.viewer",
	commenter: "collaboration.role.commenter",
	contributor: "collaboration.role.contributor",
	editor: "collaboration.role.editor",
	owner: "collaboration.role.owner",
};

function invitationError(error: unknown): MessageKey {
	if (error instanceof PlanningApiError) {
		switch (error.code) {
			case "INVITATION_EMAIL_MISMATCH":
				return "invite.emailMismatch";
			case "UNAUTHENTICATED":
				return "invite.sessionExpired";
			case "RATE_LIMITED":
				return "invite.rateLimited";
			case "BAD_REQUEST":
			case "INVITATION_INVALID":
			case "INVITATION_EXPIRED":
			case "INVITATION_REVOKED":
			case "CONFLICT":
				return "invite.unavailable";
		}
	}
	return "invite.requestError";
}

function InvitationReview({
	token,
	user,
	sessionError,
}: {
	token: string | null;
	user: User;
	sessionError: boolean;
}) {
	const { t, locale } = useLocale();
	const [state, setState] = useState<ReviewState>(() =>
		token
			? { status: "loading" }
			: { status: "error", message: "invite.missing", retryable: false },
	);
	const [attempt, setAttempt] = useState(0);
	const [busy, setBusy] = useState(false);
	const inFlight = useRef(false);
	const [actionError, setActionError] = useState<MessageKey | null>(null);

	useEffect(() => {
		if (!token) return;
		let active = true;
		void invitationApi
			.preview(token)
			.then(({ invitation }) => {
				if (active) setState({ status: "ready", invitation });
			})
			.catch((error: unknown) => {
				if (!active) return;
				const message = invitationError(error);
				if (message === "invite.unavailable")
					clearPendingInvitation(invitationStorage());
				setState({
					status: "error",
					message,
					retryable: message !== "invite.unavailable",
				});
			});
		return () => {
			active = false;
		};
	}, [token, attempt]);

	async function act(action: "accept" | "signIn" | "signOut") {
		if (!token || inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setActionError(null);
		try {
			if (action === "accept") {
				await invitationApi.accept(token);
				clearPendingInvitation(invitationStorage());
				window.history.replaceState(null, "", window.location.pathname);
				setState({ status: "accepted" });
			} else {
				if (!rememberInvitation(token, invitationStorage())) {
					setActionError("invite.storageError");
					return;
				}
				const result =
					action === "signOut"
						? await authClient.signOut()
						: await authClient.signIn.social({
								provider: "google",
								// Only the route enters OAuth; the token stays in this tab.
								callbackURL: `${window.location.origin}/invite`,
							});
				if (result.error) setActionError("auth.genericError");
			}
		} catch (error) {
			const message = invitationError(error);
			if (message === "invite.unavailable") {
				clearPendingInvitation(invitationStorage());
				setState({ status: "error", message, retryable: false });
			} else setActionError(message);
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	}

	return (
		<section
			className="invitation-card"
			aria-labelledby="invitation-heading"
			aria-busy={busy || state.status === "loading"}
		>
			<p className="eyebrow">{t("invite.eyebrow")}</p>
			<h1 id="invitation-heading">
				{t(state.status === "accepted" ? "invite.accepted" : "invite.heading")}
			</h1>
			{state.status === "loading" && <p role="status">{t("invite.loading")}</p>}
			{state.status === "error" && (
				<>
					<p role="alert">{t(state.message)}</p>
					{state.retryable && (
						<button
							type="button"
							className="invitation-primary"
							onClick={() => {
								setState({ status: "loading" });
								setAttempt((value) => value + 1);
							}}
						>
							{t("invite.retry")}
						</button>
					)}
					<a href="/">{t("invite.openWorkspaces")}</a>
				</>
			)}
			{state.status === "accepted" && (
				<>
					<p role="status">{t("invite.success")}</p>
					<a className="invitation-primary" href="/">
						{t("invite.openWorkspaces")}
					</a>
				</>
			)}
			{state.status === "ready" && (
				<>
					<p>
						{t("invite.from", { name: state.invitation.inviterDisplayName })}
					</p>
					<dl className="invitation-details">
						<div>
							<dt>
								{t(
									state.invitation.scopeType === "workspace"
										? "collaboration.scopeWorkspace"
										: "collaboration.scopeCollections",
								)}
							</dt>
							<dd>
								<ul>
									{state.invitation.scopes.map((scope, index) => (
										<li key={index}>{scope.name}</li>
									))}
								</ul>
							</dd>
						</div>
						<div>
							<dt>{t("collaboration.role")}</dt>
							<dd>{t(roleLabels[state.invitation.role])}</dd>
						</div>
						<div>
							<dt>{t("invite.expires")}</dt>
							<dd>{formatDateTime(locale, state.invitation.expiresAt)}</dd>
						</div>
					</dl>
					<p>
						{t(
							state.invitation.scopeType === "workspace"
								? "invite.workspaceAccess"
								: "invite.collectionAccess",
						)}
					</p>
					{user ? (
						<>
							<p>
								{t("invite.signedInAs")} <strong dir="ltr">{user.email}</strong>
							</p>
							<div className="invitation-actions">
								<button
									type="button"
									className="invitation-primary"
									disabled={busy || sessionError}
									onClick={() => void act("accept")}
								>
									{t(busy ? "invite.working" : "invite.accept")}
								</button>
								<button
									type="button"
									className="invitation-secondary"
									disabled={busy}
									onClick={() => void act("signOut")}
								>
									{t("invite.switchAccount")}
								</button>
							</div>
						</>
					) : (
						<>
							<p>{t("invite.signInHint")}</p>
							<button
								type="button"
								className="invitation-primary"
								disabled={busy || sessionError}
								onClick={() => void act("signIn")}
							>
								{t(busy ? "auth.openingGoogle" : "auth.continueGoogle")}
							</button>
						</>
					)}
					<p className="invitation-error" role="alert">
						{sessionError
							? t("auth.sessionError")
							: actionError
								? t(actionError)
								: null}
					</p>
				</>
			)}
		</section>
	);
}

export function InvitationPage({
	user,
	sessionError,
}: {
	user: User;
	sessionError: boolean;
}) {
	const [token, setToken] = useState(() =>
		readInvitationToken(window.location.hash, invitationStorage()),
	);
	useEffect(() => {
		const update = () =>
			setToken(readInvitationToken(window.location.hash, invitationStorage()));
		window.addEventListener("hashchange", update);
		return () => window.removeEventListener("hashchange", update);
	}, []);
	return (
		<main className="invitation-page">
			<header>
				<BrandMark />
				<LocaleSwitch />
			</header>
			<InvitationReview
				key={token}
				token={token}
				user={user}
				sessionError={sessionError}
			/>
		</main>
	);
}
