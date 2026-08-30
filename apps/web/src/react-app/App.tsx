import { useState } from "react";
import { authClient } from "./auth-client";
import "./App.css";

const GENERIC_AUTH_ERROR =
	"We couldn't complete sign-in. Please try again in a moment.";

function BrandMark({ compact = false }: { compact?: boolean }) {
	return (
		<div className={compact ? "brand brand--compact" : "brand"}>
			<svg
				className="brand__mark"
				viewBox="0 0 40 40"
				role="img"
				aria-label="Kharidyar"
			>
				<path d="M6 6h12v12H6zM22 6h12v12H22zM6 22h12v12H6z" />
				<path className="brand__mark-accent" d="M22 22h12v12H22z" />
			</svg>
			<span className="brand__name">Kharidyar</span>
		</div>
	);
}

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
	return (
		<main className="loading-screen" aria-busy="true" aria-label="Loading account">
			<BrandMark compact />
			<span className="loading-line" aria-hidden="true" />
		</main>
	);
}

function SignedOutScreen({ sessionError }: { sessionError: boolean }) {
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
				setActionError(GENERIC_AUTH_ERROR);
				setIsSigningIn(false);
			}
		} catch {
			setActionError(GENERIC_AUTH_ERROR);
			setIsSigningIn(false);
		}
	}

	return (
		<main className="auth-page">
			<section className="auth-story" aria-labelledby="auth-heading">
				<BrandMark />

				<div className="auth-story__copy">
					<p className="eyebrow">A quieter way to choose</p>
					<h1 id="auth-heading">
						Buy slowly.
						<br />
						Decide clearly.
					</h1>
					<p className="auth-story__description">
						Keep the brief, options, prices, and conversation together—from
						first thought to final choice.
					</p>
				</div>

				<p className="auth-story__note">
					Built for considered purchases, shared without the noise.
				</p>
			</section>

			<section className="auth-entry" aria-labelledby="sign-in-heading">
				<div className="auth-card">
					<p className="auth-card__index" aria-hidden="true">
						01 / SIGN IN
					</p>
					<h2 id="sign-in-heading">Your decisions, kept private.</h2>
					<p className="auth-card__body">
						Continue with Google to enter your workspace. We only use your
						account to identify you and protect what you save.
					</p>

					<button
						type="button"
						className="google-button"
						onClick={signInWithGoogle}
						disabled={isSigningIn || sessionError}
					>
						<GoogleIcon />
						<span>{isSigningIn ? "Opening Google…" : "Continue with Google"}</span>
						<span className="button-arrow" aria-hidden="true">
							↗
						</span>
					</button>

					<div className="auth-message" aria-live="polite">
						{sessionError ? (
							<p>
								We couldn't reach the sign-in service. Please refresh and try
								again.
							</p>
						) : actionError || callbackError ? (
							<p>{actionError ?? GENERIC_AUTH_ERROR}</p>
						) : null}
					</div>

					<p className="auth-card__footer">
						No password to remember. You can sign out from any workspace screen.
					</p>
				</div>
			</section>
		</main>
	);
}

function UserAvatar({ name, image }: { name: string; image?: string | null }) {
	const [imageFailed, setImageFailed] = useState(false);
	const initial = name.trim().charAt(0).toLocaleUpperCase() || "K";

	return (
		<div className="user-avatar" aria-hidden="true">
			{image && !imageFailed ? (
				<img
					src={image}
					alt=""
					referrerPolicy="no-referrer"
					onError={() => setImageFailed(true)}
				/>
			) : (
				<span>{initial}</span>
			)}
		</div>
	);
}

function SignedInShell({
	user,
}: {
	user: { name: string; email: string; image?: string | null };
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
		<div className="shell">
			<header className="shell-header">
				<BrandMark compact />

				<div className="account-menu">
					<div className="account-menu__identity">
						<UserAvatar name={user.name} image={user.image} />
						<span>{user.name}</span>
					</div>
					<button
						type="button"
						className="text-button"
						onClick={signOut}
						disabled={isSigningOut}
					>
						{isSigningOut ? "Signing out…" : "Sign out"}
					</button>
				</div>
			</header>

			<main className="shell-main">
				<section className="shell-intro" aria-labelledby="shell-heading">
					<p className="eyebrow">Private workspace</p>
					<h1 id="shell-heading">
						Welcome, {user.name.split(" ")[0] || user.name}.
					</h1>
					<p>
						This is your calm starting point for purchases worth thinking
						through.
					</p>
				</section>

				<section className="empty-workspace" aria-labelledby="empty-heading">
					<div className="empty-workspace__number" aria-hidden="true">
						01
					</div>
					<div className="empty-workspace__copy">
						<p className="eyebrow">Your space is ready</p>
						<h2 id="empty-heading">Nothing competing for your attention.</h2>
						<p>
							Collections, briefs, options, and shared decisions will gather
							here as you create them.
						</p>
					</div>
					<div className="empty-workspace__seal" aria-hidden="true">
						<span>PRIVATE</span>
						<span>BY DEFAULT</span>
					</div>
				</section>

				<div className="account-footnote">
					<span className="status-dot" aria-hidden="true" />
					Signed in as {user.email}
				</div>
				{signOutError ? (
					<p className="shell-error" role="alert">
						We couldn't sign you out. Please try again.
					</p>
				) : null}
			</main>
		</div>
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
