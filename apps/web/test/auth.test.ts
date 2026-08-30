import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import {
	readAuthRuntimeConfig,
	type AuthBindings,
} from "../src/auth/server";
import {
	authAccountOptions,
	authIpAddressOptions,
} from "../src/auth/shared-options";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const userId = "auth-test-user";
const sessionId = "auth-test-session";
const sessionToken = "auth-test-session-token";

async function signedSessionCookie(token: string): Promise<string> {
	const algorithm = { name: "HMAC", hash: "SHA-256" };
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(authSecret),
		algorithm,
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		algorithm.name,
		key,
		new TextEncoder().encode(token),
	);
	const encodedSignature = btoa(
		String.fromCharCode(...new Uint8Array(signature)),
	);

	return `better-auth.session_token=${token}.${encodedSignature}`;
}

async function clearAuthFixture(): Promise<void> {
	await env.DB.prepare("delete from user where id = ?").bind(userId).run();
}

async function insertAuthenticatedUser(): Promise<void> {
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			"insert into user (id, name, email, email_verified, image) values (?, ?, ?, ?, ?)",
		).bind(
			userId,
			"Reza Test",
			"reza.auth@example.com",
			1,
			"https://example.com/avatar.png",
		),
		env.DB.prepare(
			"insert into session (id, expires_at, token, updated_at, user_id) values (?, ?, ?, ?, ?)",
		).bind(sessionId, now + 60 * 60 * 1000, sessionToken, now, userId),
	]);
}

function request(path: string, init?: RequestInit): Request {
	return new Request(`http://example.com${path}`, init);
}

describe("authentication configuration", () => {
	it("keeps implicit provider linking disabled", () => {
		expect(authAccountOptions.accountLinking).toEqual({
			enabled: true,
			disableImplicitLinking: true,
		});
	});

	it("uses Cloudflare's edge-controlled client IP for rate limits", () => {
		expect(authIpAddressOptions.ipAddressHeaders).toEqual([
			"cf-connecting-ip",
		]);
	});

	it("requires a strong secret and an explicit matching origin", () => {
		const bindings = env as AuthBindings;
		expect(readAuthRuntimeConfig(bindings)).toMatchObject({
			baseURL: "http://example.com",
			trustedOrigins: ["http://example.com"],
			useSecureCookies: false,
		});

		expect(() =>
			readAuthRuntimeConfig({
				...bindings,
				BETTER_AUTH_SECRET: "too-short",
			}),
		).toThrow(/at least 32 characters/);
		expect(() =>
			readAuthRuntimeConfig({
				...bindings,
				AUTH_TRUSTED_ORIGINS: "https://other.example.com",
			}),
		).toThrow(/must include BETTER_AUTH_URL/);
	});
});

describe("Google and session integration", () => {
	beforeEach(clearAuthFixture);

	it("rejects an anonymous request to the protected session endpoint", async () => {
		const response = await exports.default.fetch(
			request("/api/session"),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: {
				code: "UNAUTHENTICATED",
				message: "Authentication is required.",
			},
		});
	});

	it("starts the configured Google OAuth flow without contacting Google", async () => {
		const response = await exports.default.fetch(
			request("/api/auth/sign-in/social", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://example.com",
				},
				body: JSON.stringify({
					callbackURL: "/",
					provider: "google",
				}),
			}),
		);

		expect(response.status).toBe(200);
		const body = await response.json<{ redirect: boolean; url: string }>();
		const authorizationURL = new URL(body.url);
		expect(body.redirect).toBe(true);
		expect(authorizationURL.origin).toBe("https://accounts.google.com");
		expect(authorizationURL.searchParams.get("client_id")).toBe(
			"test-google-client-id",
		);
		expect(authorizationURL.searchParams.get("redirect_uri")).toBe(
			"http://example.com/api/auth/callback/google",
		);
		expect(response.headers.get("set-cookie")).toBeTruthy();
	});

	it("blocks an untrusted OAuth callback URL", async () => {
		const response = await exports.default.fetch(
			request("/api/auth/sign-in/social", {
				method: "POST",
					headers: { "content-type": "application/json" },
				body: JSON.stringify({
					callbackURL: "https://attacker.example/steal",
					provider: "google",
				}),
			}),
		);

		expect(response.status).toBe(403);
	});

	it("loads a database-backed session once for a protected request", async () => {
		await insertAuthenticatedUser();
		const cookie = await signedSessionCookie(sessionToken);
		const response = await exports.default.fetch(
			request("/api/session", { headers: { cookie } }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			session: { id: sessionId },
			user: {
				email: "reza.auth@example.com",
				id: userId,
				name: "Reza Test",
			},
		});
	});

	it("signs out and revokes the database session", async () => {
		await insertAuthenticatedUser();
		const cookie = await signedSessionCookie(sessionToken);
		const response = await exports.default.fetch(
			request("/api/auth/sign-out", {
				method: "POST",
				headers: { cookie, origin: "http://example.com" },
			}),
		);

		expect(response.status).toBe(200);
		const stored = await env.DB.prepare(
			"select count(*) as count from session where id = ?",
		)
			.bind(sessionId)
			.first<{ count: number }>();
		expect(stored?.count).toBe(0);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
	});

	it("stores provider Accounts separately from internal Users", async () => {
		await insertAuthenticatedUser();
		await env.DB.prepare(
			"insert into account (id, issuer, account_id, provider_id, user_id, updated_at) values (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"google-provider-account",
				"https://accounts.google.com",
				"google-subject-123",
				"google",
				userId,
				Date.now(),
			)
			.run();

		const linked = await env.DB.prepare(
			"select account.id as account_id, account.user_id, user.id as internal_user_id from account join user on user.id = account.user_id where account.id = ?",
		)
			.bind("google-provider-account")
			.first<{
				account_id: string;
				internal_user_id: string;
				user_id: string;
			}>();

		expect(linked).toEqual({
			account_id: "google-provider-account",
			internal_user_id: userId,
			user_id: userId,
		});
		expect(linked?.account_id).not.toBe(linked?.internal_user_id);
	});
});
