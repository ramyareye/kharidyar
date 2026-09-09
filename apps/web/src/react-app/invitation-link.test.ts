import { describe, expect, it } from "vitest";
import {
	clearPendingInvitation,
	readInvitationToken,
	rememberInvitation,
} from "./invitation-link";

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
}
const token = "a".repeat(43);
describe("Invitation link recovery", () => {
	it("recovers the invitation after returning from sign-in without a fragment", () => {
		const storage = memoryStorage();
		expect(rememberInvitation(token, storage, 1000)).toBe(true);
		expect(readInvitationToken("", storage, 1100)).toBe(token);
		clearPendingInvitation(storage);
		expect(readInvitationToken("", storage, 1200)).toBeNull();
	});
	it("always selects the new link instead of a previous sign-in's invitation", () => {
		const storage = memoryStorage();
		rememberInvitation(token, storage);
		expect(readInvitationToken(`#token=${"b".repeat(43)}`, storage)).toBe(
			"b".repeat(43),
		);
	});
	it.each([
		"#token=short",
		"#token=",
		`#token=${token}&token=${token}`,
		"#unrelated=value",
	])(
		"does not fall back to a saved invitation for malformed link %s",
		(hash) => {
			const storage = memoryStorage();
			rememberInvitation(token, storage);
			expect(readInvitationToken(hash, storage)).toBeNull();
		},
	);
	it.each([1000 + 30 * 60 * 1000, 999])(
		"rejects expired or future sign-in state at %s",
		(now) => {
			const storage = memoryStorage();
			rememberInvitation(token, storage, 1000);
			expect(readInvitationToken("", storage, now)).toBeNull();
		},
	);
	it("can read a complete link when browser storage is disabled", () => {
		expect(readInvitationToken(`#token=${token}`, null)).toBe(token);
		expect(rememberInvitation(token, null)).toBe(false);
		expect(readInvitationToken("", null)).toBeNull();
	});
	it("handles corrupt or blocked storage without crashing the invitation route", () => {
		const corrupt = { ...memoryStorage(), getItem: () => "not-json" };
		const blocked = {
			getItem: () => {
				throw Error();
			},
			setItem: () => {
				throw Error();
			},
			removeItem: () => {
				throw Error();
			},
		};
		expect(readInvitationToken("", corrupt)).toBeNull();
		expect(readInvitationToken("", blocked)).toBeNull();
		expect(rememberInvitation(token, blocked)).toBe(false);
	});
});
