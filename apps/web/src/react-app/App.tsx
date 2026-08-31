import { useState } from "react";

import { authClient } from "./auth-client";
import { useLocale } from "./locale-context";
import { PlanningDashboard } from "./PlanningDashboard";
import { BrandMark, LocaleSwitch } from "./ui";
import "./App.css";

function GoogleIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" className="google-icon">
			<path
				fill="#4285f4"
				d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z"
			/>
			<path
				fill="#34a853"
				d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"
			/>
			<path
				fill="#fbbc05"
				d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z"
			/>
			<path
				fill="#ea4335"
				d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 5.9Z"
			/>
		</svg>
	);
}

function LoadingScreen() {
	const { t } = useLocale();

	return (
		<main className="loading-screen" aria-busy="true" aria-label={t("auth.loading")}>
			<BrandMark compact />
			<span className="loading-line" aria-hidden="true" />
		</main>
	);
}

function SignedOutScreen({ sessionError }: { sessionError: boolean }) {
	const { t } = useLocale();
	const [isSigningIn, setIsSigningIn] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const callbackError = new URLSearchParams(window.location.search).has("error");

	async function signInWithGoogle() {
		setIsSigningIn(true);
		setActionError(null);

		try {
			const result = await authClient.signIn.social({
				provider: "google",
				callbackURL: `${window.location.origin}/`,
			});

			if (result.error) {
				setActionError(t("auth.genericError"));
				setIsSigningIn(false);
			}
		} catch {
			setActionError(t("auth.genericError"));
			setIsSigningIn(false);
		}
	}

	return (
		<main className="auth-page">
			<section className="auth-story" aria-labelledby="auth-heading">
				<div className="auth-story__topline">
					<BrandMark />
					<LocaleSwitch />
				</div>

				<div className="auth-story__copy">
					<p className="eyebrow">{t("auth.eyebrow")}</p>
					<h1 id="auth-heading">{t("auth.title")}</h1>
					<p className="auth-story__description">{t("auth.description")}</p>
				</div>

				<p className="auth-story__note">{t("auth.note")}</p>
			</section>

			<section className="auth-entry" aria-labelledby="sign-in-heading">
				<div className="auth-card">
					<p className="auth-card__index" aria-hidden="true">
						{t("auth.index")}
					</p>
					<h2 id="sign-in-heading">{t("auth.cardTitle")}</h2>
					<p className="auth-card__body">{t("auth.cardBody")}</p>

					<button
						type="button"
						className="google-button"
						onClick={() => void signInWithGoogle()}
						disabled={isSigningIn || sessionError}
					>
						<GoogleIcon />
						<span>
							{isSigningIn ? t("auth.openingGoogle") : t("auth.continueGoogle")}
						</span>
						<span className="button-arrow" aria-hidden="true">
							↗
						</span>
					</button>

					<div className="auth-message" aria-live="polite">
						{sessionError ? (
							<p>{t("auth.sessionError")}</p>
						) : actionError || callbackError ? (
							<p>{actionError ?? t("auth.genericError")}</p>
						) : null}
					</div>

					<p className="auth-card__footer">{t("auth.footer")}</p>
				</div>
			</section>
		</main>
	);
}

function SignedInShell({
	user,
}: {
	user: { email: string; image?: null | string; name: string };
}) {
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [signOutError, setSignOutError] = useState(false);

	async function signOut() {
		setIsSigningOut(true);
		setSignOutError(false);

		try {
			const result = await authClient.signOut();

			if (result.error) {
				setSignOutError(true);
				setIsSigningOut(false);
			}
		} catch {
			setSignOutError(true);
			setIsSigningOut(false);
		}
	}

	return (
		<PlanningDashboard
			user={user}
			isSigningOut={isSigningOut}
			signOutError={signOutError}
			onDismissSignOutError={() => setSignOutError(false)}
			onSignOut={signOut}
		/>
	);
}

function App() {
	const { data: session, isPending, error } = authClient.useSession();

	if (isPending) {
		return <LoadingScreen />;
	}

	if (!session) {
		return <SignedOutScreen sessionError={Boolean(error)} />;
	}

	return <SignedInShell user={session.user} />;
}

export default App;
