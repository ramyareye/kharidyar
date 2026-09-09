import { afterEach, describe, expect, it, vi } from "vitest";
import { invitationApi } from "./planning-api";

afterEach(() => vi.unstubAllGlobals());
describe("Invitation requests", () => {
	it("previews without granting access and sends the token only in the POST body", async () => {
		const invitation = {
			role: "editor",
			scopeType: "workspace",
			scopes: [{ name: "Sample home", type: "workspace" }],
			inviterDisplayName: "Sample owner",
			expiresAt: "2026-10-01T12:00:00.000Z",
		};
		const fetch = vi.fn().mockResolvedValue(Response.json({ invitation }));
		vi.stubGlobal("fetch", fetch);
		expect(await invitationApi.preview("a".repeat(43))).toEqual({ invitation });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith("/api/invitations/preview", {
			method: "POST",
			credentials: "same-origin",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: "a".repeat(43) }),
		});
	});
	it.each([false, true])(
		"accepts a confirmed receipt including an idempotent retry (%s)",
		async (alreadyAccepted) => {
			const fetch = vi
				.fn()
				.mockResolvedValue(Response.json({ accepted: true, alreadyAccepted }));
			vi.stubGlobal("fetch", fetch);
			expect(await invitationApi.accept("a".repeat(43))).toEqual({
				accepted: true,
				alreadyAccepted,
			});
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch.mock.calls[0][0]).toBe("/api/invitations/accept");
			expect(fetch.mock.calls[0][1].method).toBe("POST");
		},
	);
	it("keeps the server's account-mismatch code so the UI can explain it", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					Response.json(
						{
							error: {
								code: "INVITATION_EMAIL_MISMATCH",
								message: "Wrong verified email",
							},
						},
						{ status: 403 },
					),
				),
		);
		await expect(invitationApi.accept("a".repeat(43))).rejects.toMatchObject({
			code: "INVITATION_EMAIL_MISMATCH",
			status: 403,
		});
	});
	it("does not mistake an unreadable success response for accepted membership", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(Response.json({ accepted: false })),
		);
		await expect(invitationApi.accept("a".repeat(43))).rejects.toThrow();
	});
});
