const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const storageKey = "wantkit.pending-invitation";
const signInWindowMs = 30 * 60 * 1000;
type InviteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function invitationStorage(): InviteStorage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

export function clearPendingInvitation(storage: InviteStorage | null) {
	try {
		storage?.removeItem(storageKey);
	} catch {
		// Storage can be disabled. The fragment still lets the user reopen the link.
	}
}

export function readInvitationToken(
	hash: string,
	storage: InviteStorage | null,
	now = Date.now(),
): string | null {
	// A newly opened link always takes precedence, including a malformed one.
	if (hash && hash !== "#") {
		const tokens = new URLSearchParams(hash.slice(1)).getAll("token");
		return tokens.length === 1 && tokenPattern.test(tokens[0])
			? tokens[0]
			: null;
	}
	try {
		const saved = JSON.parse(storage?.getItem(storageKey) ?? "null");
		if (
			saved &&
			typeof saved.token === "string" &&
			tokenPattern.test(saved.token) &&
			typeof saved.savedAt === "number" &&
			saved.savedAt <= now &&
			now - saved.savedAt < signInWindowMs
		)
			return saved.token;
	} catch {
		// Missing, unreadable or expired state must never select a different invite.
	}
	clearPendingInvitation(storage);
	return null;
}

export function rememberInvitation(
	token: string,
	storage: InviteStorage | null,
	now = Date.now(),
): boolean {
	if (!storage || !tokenPattern.test(token)) return false;
	try {
		const value = JSON.stringify({ token, savedAt: now });
		storage.setItem(storageKey, value);
		return storage.getItem(storageKey) === value;
	} catch {
		return false;
	}
}
