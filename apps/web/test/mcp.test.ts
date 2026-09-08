import { deleteFloorPlan } from "../src/worker/floor-plan-service";
import { readVisualImage, readVisualRun, importVisualImage } from "../src/worker/visual-service";
import { boundedBytes, chatgptDownloadUrl, downloadChatgptImage } from "../src/worker/chatgpt-files";
import { cleanupVisualRuns } from "../src/worker/visual-lifecycle";
import { conceptMediaLimits, uploadConceptImage, readConceptMedia, readConceptImageContent, deleteConceptImage } from "../src/worker/concept-media-service";
import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/worker";
import { authenticateMcpRequest, connectorInputSchema } from "../src/worker/mcp-auth-service";
import { visualRunResultSchema, visualImageResultSchema } from "@kharidyar/contracts";

const origin = "http://localhost:5173";
const owner = "mcp-owner";
const other = "mcp-other";
const viewer = "mcp-viewer";
const callback = "https://claude.ai/api/mcp/auth_callback";
// Production is disabled in Wrangler; this isolated Worker test enables it.
const pilotEnv = () => ({
	...env,
	BETTER_AUTH_URL: origin,
	AUTH_TRUSTED_ORIGINS: origin,
	MCP_ENABLED: "true",
	MCP_ALLOWED_USER_IDS: `${owner},${other},${viewer}`,
});
const credentialsSchema = z.object({
	clientId: z.string(),
	clientSecret: z.string(),
	endpoint: z.string(),
});
const tokensSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
});
const rpcSchema = z.object({
	result: z.record(z.string(), z.unknown()).optional(),
	error: z.unknown().optional(),
});

async function cookie(userId: string) {
	const token = `token-${userId}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(env.BETTER_AUTH_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	return `better-auth.session_token=${token}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
async function request(
	path: string,
	init?: RequestInit,
	userId?: string,
	bindings?: Env,
) {
	const headers = new Headers(init?.headers);
	headers.set("cf-connecting-ip", "192.0.2.40");
	if (userId) {
		headers.set("cookie", await cookie(userId));
		headers.set("origin", origin);
	}
	const req = new Request(`${origin}${path}`, {
		...init,
		headers,
		redirect: "manual",
	});
	return bindings ? app.fetch(req, bindings) : exports.default.fetch(req);
}
const post = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});
async function register(userId = owner, allowWrites = false) {
	const response = await request(
		"/api/connectors",
		post({ provider: "claude", redirectUri: callback, allowWrites }),
		userId,
	);
	expect(response.status, await response.clone().text()).toBe(201);
	return credentialsSchema.parse(await response.json());
}
async function authorize(
	userId = owner,
	client?: z.infer<typeof credentialsSchema>,
	accept = true,
	allowWrites = false,
) {
	const credentials = client ?? (await register(userId, allowWrites));
	const verifier = "wantkit-test-code-verifier-with-enough-entropy-0123456789";
	const challengeBytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	const challenge = btoa(String.fromCharCode(...new Uint8Array(challengeBytes)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
	const params = new URLSearchParams({
		client_id: credentials.clientId,
		redirect_uri: callback,
		response_type: "code",
		scope: `wantkit:read${allowWrites ? " wantkit:write" : ""} offline_access`,
		resource: credentials.endpoint,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state: "test-state",
		prompt: "consent",
	});
	const response = await request(
		`/api/auth/oauth2/authorize?${params}`,
		undefined,
		userId,
	);
	expect(response.status, await response.clone().text()).toBe(302);
	const consentUrl = new URL(response.headers.get("location") ?? "", origin);
	expect(consentUrl.pathname).toBe("/connectors/consent");
	const consent = await request(
		"/api/auth/oauth2/consent",
		post({ accept, oauth_query: consentUrl.search.slice(1) }),
		userId,
	);
	expect(consent.status, await consent.clone().text()).toBe(200);
	const result = z.object({ url: z.string() }).parse(await consent.json());
	const redirect = new URL(result.url);
	expect(redirect.origin + redirect.pathname).toBe(callback);
	expect(redirect.searchParams.get("state")).toBe("test-state");
	return { credentials, verifier, redirect };
}
async function exchange(
	authorization: Awaited<ReturnType<typeof authorize>>,
	verifier = authorization.verifier,
) {
	return request("/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: authorization.credentials.clientId,
			client_secret: authorization.credentials.clientSecret,
			redirect_uri: callback,
			code: authorization.redirect.searchParams.get("code") ?? "",
			code_verifier: verifier,
			resource: authorization.credentials.endpoint,
		}),
	});
}
async function connect(userId = owner, allowWrites = false) {
	const authorization = await authorize(userId, undefined, true, allowWrites);
	const response = await exchange(authorization);
	expect(response.status, await response.clone().text()).toBe(200);
	return {
		...tokensSchema.parse(await response.json()),
		...authorization.credentials,
	};
}
async function rpc(token: string, method: string, params?: unknown, bindings?:Env) {
	const response = await request("/api/mcp", {
		...post({ jsonrpc: "2.0", id: 1, method, params }),
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${token}`,
			"mcp-protocol-version": "2025-11-25",
		},
	},undefined,bindings);
	const text = await response.text();
	const data = text.startsWith("event:")
		? text
				.split("\n")
				.find((line) => line.startsWith("data: "))
				?.slice(6)
		: text;
	return {
		status: response.status,
		headers: response.headers,
		body: rpcSchema.parse(JSON.parse(data ?? "{}")),
		text,
	};
}
const call = (token: string, name: string, args: unknown = {}) =>
	rpc(token, "tools/call", { name, arguments: args });

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("delete from visual_runs where collection_id like 'mcp-%'"),
 env.DB.prepare("delete from concept_images where role='edited' and concept_id in (select id from concepts where collection_id like 'mcp-%')"),
		env.DB.prepare("delete from floor_plans where collection_id like 'mcp-%'"),
		env.DB.prepare("delete from workspaces where id like 'mcp-%'"),
		env.DB.prepare("delete from user where id like 'mcp-%'"),
		env.DB.prepare("delete from collaboration_rate_limits"),
		env.DB.prepare("delete from rate_limit"),
	]);
	const now = Date.now();
	for (const userId of [owner, other, viewer]) {
		await env.DB.batch([
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?, ?, ?, 1)",
			).bind(userId, userId, `${userId}@example.test`),
			env.DB.prepare(
				"insert into session (id, token, user_id, expires_at, updated_at) values (?, ?, ?, ?, ?)",
			).bind(
				`session-${userId}`,
				`token-${userId}`,
				userId,
				now + 3_600_000,
				now,
			),
		]);
	}
	for (const [suffix, userId] of [
		["a", owner],
		["b", other],
	]) {
		await env.DB.batch([
			env.DB.prepare(
				"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?, ?, ?, ?, ?)",
			).bind(
				`mcp-workspace-${suffix}`,
				`Workspace ${suffix}`,
				userId,
				now,
				now,
			),
			env.DB.prepare(
				"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?, ?, ?, 'owner', ?, ?)",
			).bind(
				`mcp-membership-${suffix}`,
				`mcp-workspace-${suffix}`,
				userId,
				now,
				now,
			),
			env.DB.prepare(
				"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
			).bind(
				`mcp-collection-${suffix}`,
				`mcp-workspace-${suffix}`,
				`Collection ${suffix}`,
				userId,
				now,
				now,
			),
			env.DB.prepare(
				"insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
			).bind(
				`mcp-item-${suffix}`,
				`mcp-workspace-${suffix}`,
				`mcp-collection-${suffix}`,
				`Item ${suffix}`,
				userId,
				now,
				now,
			),
		]);
	}
	await env.DB.batch([
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values ('mcp-hidden', 'mcp-workspace-a', 'Private sibling', ?, ?, ?)",
		).bind(owner, now, now),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values ('mcp-scope', 'mcp-collection-a', ?, 'viewer', ?, ?)",
		).bind(viewer, now, now),
	]);
});

describe("private MCP OAuth", () => {
	it("is disabled by default and exposes standards-based discovery only when enabled", async () => {
		expect(
			(
				await request("/api/mcp", undefined, undefined, {
					...env,
					MCP_ENABLED: "false",
				})
			).status,
		).toBe(404);
		const denied = await request("/api/mcp");
		expect(denied.status).toBe(401);
		expect(denied.headers.get("www-authenticate")).toContain(
			"/.well-known/oauth-protected-resource/api/mcp",
		);
		const resource = await request(
			"/.well-known/oauth-protected-resource/api/mcp",
		);
		expect(resource.status).toBe(200);
		expect(await resource.json()).toEqual({
			resource: `${origin}/api/mcp`,
			authorization_servers: [`${origin}/api/auth`],
			bearer_methods_supported: ["header"],
			scopes_supported: ["wantkit:read", "wantkit:write"],
		});
		const metadata = await request(
			"/.well-known/oauth-authorization-server/api/auth",
		);
		expect(metadata.status, await metadata.clone().text()).toBe(200);
		expect(await metadata.json()).toMatchObject({
			issuer: `${origin}/api/auth`,
			code_challenge_methods_supported: ["S256"],
			scopes_supported: ["wantkit:read", "wantkit:write", "offline_access"],
		});
		for (const path of [
			"/api/auth/oauth2/register",
			"/api/auth/oauth2/create-client",
			"/api/auth/oauth2/delete-consent",
			"/api/auth/wantkit-mcp/verify",
			"/api/auth/%6Fauth2/create-client",
			"/api/auth//oauth2/create-client",
			"/api/auth/oauth2/create-client/",
		])
			expect((await request(path, post({}), owner)).status).toBe(404);
	});
	it("requires a pilot session and exact assistant callback; never lists secrets", async () => {
		expect(
			(
				await request(
					"/api/connectors",
					post({ provider: "claude", redirectUri: callback }),
				)
			).status,
		).toBe(401);
		for (const redirectUri of [
			"https://evil.example/callback",
			`${callback}?token=secret`,
			"https://claude.ai.evil.example/api/mcp/auth_callback",
		])
			expect(
				connectorInputSchema.safeParse({ provider: "claude", redirectUri })
					.success,
			).toBe(false);
		const credentials = await register();
		const listing = await request("/api/connectors", undefined, owner);
		const text = await listing.text();
		expect(text).toContain(credentials.clientId);
		expect(text).not.toContain(credentials.clientSecret);
		expect(
			await (await request("/api/connectors", undefined, other)).text(),
		).not.toContain(credentials.clientId);
	});
	it("completes authorization-code + S256 PKCE and maps tokens to the authorizing user", async () => {
		const authorization = await authorize();
		const wrong = await exchange(
			authorization,
			"incorrect-code-verifier-that-is-long-enough-1234567",
		);
		expect([400, 401]).toContain(wrong.status);
		expect(await wrong.json()).toMatchObject({ error: "invalid_request" });
		const connected = await connect();
		expect(connected.expires_in).toBe(600);
		expect(
			(
				await rpc(connected.access_token, "initialize", {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "WantKit test inspector", version: "1" },
				})
			).body.result,
		).toMatchObject({ serverInfo: { name: "wantkit", version: "1.1.0" } });
		const result = await call(connected.access_token, "list_workspaces");
		expect(result.status).toBe(200);
		expect(result.text).toContain("mcp-workspace-a");
		expect(result.text).not.toContain("mcp-workspace-b");
	});
	it("denies consent and prevents another user from authorizing a personal client", async () => {
		const denied = await authorize(owner, undefined, false);
		expect(denied.redirect.searchParams.get("error")).toBe("access_denied");
		expect(denied.redirect.searchParams.has("code")).toBe(false);
		const credentials = await register(owner);
		const crossUser = await authorize(other, credentials);
		expect((await exchange(crossUser)).status).not.toBe(200);
	});
	it("revokes access immediately on disconnect and prevents cross-user disconnect", async () => {
		const connected = await connect();
		expect(
			(
				await request(
					`/api/connectors/${connected.clientId}`,
					{ method: "DELETE" },
					other,
				)
			).status,
		).not.toBe(204);
		expect((await call(connected.access_token, "list_workspaces")).status).toBe(
			200,
		);
		expect(
			(
				await request(
					`/api/connectors/${connected.clientId}`,
					{ method: "DELETE" },
					owner,
				)
			).status,
		).toBe(204);
		expect((await call(connected.access_token, "list_workspaces")).status).toBe(
			401,
		);
		expect((await request("/api/session", undefined, owner)).status).toBe(200);
		expect(
			await env.DB.prepare(
				"select id from items where id = 'mcp-item-a'",
			).first(),
		).not.toBeNull();
	});
	it("rotates refresh tokens, rejects replay, and revokes tokens on web sign-out", async () => {
		const connected = await connect();
		const refresh = (token: string) =>
			request("/api/auth/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					client_id: connected.clientId,
					client_secret: connected.clientSecret,
					refresh_token: token,
					resource: connected.endpoint,
				}),
			});
		const rotatedResponse = await refresh(connected.refresh_token);
		expect(rotatedResponse.status).toBe(200);
		const rotated = tokensSchema.parse(await rotatedResponse.json());
		expect(rotated.refresh_token).not.toBe(connected.refresh_token);
		expect(
			(await call(rotated.access_token, "read_item", { itemId: "mcp-item-a" }))
				.status,
		).toBe(200);
		const replay = await refresh(connected.refresh_token);
		expect(replay.status).toBe(400);
		expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
		const fresh = await connect();
		expect((await request("/api/auth/sign-out", post({}), owner)).status).toBe(
			200,
		);
		expect((await call(fresh.access_token, "list_workspaces")).status).toBe(
			401,
		);
	});
	it("rejects expired/revoked tokens, revoked login sessions, and a removed pilot user", async () => {
		const connected = await connect();
		await env.DB.prepare("update oauth_access_token set expires_at = 1").run();
		expect((await call(connected.access_token, "list_workspaces")).status).toBe(
			401,
		);
		const second = await connect();
		const revoke = await request("/api/auth/oauth2/revoke", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				token: second.access_token,
				client_id: second.clientId,
				client_secret: second.clientSecret,
				token_type_hint: "access_token",
			}),
		});
		expect(revoke.status).toBe(200);
		expect((await call(second.access_token, "list_workspaces")).status).toBe(
			401,
		);
		const third = await connect();
		const removed = await request(
			"/api/mcp",
			{ headers: { authorization: `Bearer ${third.access_token}` } },
			undefined,
			{ ...pilotEnv(), MCP_ALLOWED_USER_IDS: other },
		);
		expect(removed.status).toBe(401);
		expect((await call(third.access_token, "list_workspaces")).status).toBe(
			200,
		);
		await env.DB.prepare("delete from session where user_id = ?")
			.bind(owner)
			.run();
		expect((await call(third.access_token, "list_workspaces")).status).toBe(
			401,
		);
	});
	it("rejects authorization-code replay, wrong audiences and missing read scope", async () => {
		const authorization = await authorize();
		const exchanged = await exchange(authorization);
		expect(exchanged.status).toBe(200);
		const tokens = tokensSchema.parse(await exchanged.json());
		expect((await call(tokens.access_token, "list_workspaces")).status).toBe(
			200,
		);
		expect((await exchange(authorization)).status).not.toBe(200);
		// The provider also revokes the token family on code replay.
		expect((await call(tokens.access_token, "list_workspaces")).status).toBe(
			401,
		);
		const fresh = await connect();
		await env.DB.prepare("update oauth_access_token set resources = ?")
			.bind(JSON.stringify(["https://another-resource.example/api/mcp"]))
			.run();
		expect((await call(fresh.access_token, "list_workspaces")).status).toBe(
			401,
		);
		await env.DB.prepare(
			"update oauth_access_token set resources = ?, scopes = ?",
		)
			.bind(
				JSON.stringify([`${origin}/api/mcp`]),
				JSON.stringify(["offline_access"]),
			)
			.run();
		expect((await call(fresh.access_token, "list_workspaces")).status).toBe(
			401,
		);
	});
	it("lets a removed pilot participant disconnect an existing registration", async () => {
		const connected = await connect();
		expect(
			(
				await request(
					`/api/connectors/${connected.clientId}`,
					{ method: "DELETE" },
					owner,
					{
						...pilotEnv(),
						MCP_ALLOWED_USER_IDS: other,
					},
				)
			).status,
		).toBe(204);
		expect((await call(connected.access_token, "list_workspaces")).status).toBe(
			401,
		);
	});
});

describe("read-only MCP tools", () => {
	it("discovers scoped tools with schemas and rejects unsupported writes, oversized inputs and foreign Origins", async () => {
		const connected = await connect();
		const discovery = await rpc(connected.access_token, "tools/list");
		expect(discovery.body.error, discovery.text).toBeUndefined();
		const tools = z
			.array(
				z.object({
					name: z.string(),
					inputSchema: z.object({ type: z.literal("object") }),
					outputSchema: z.object({ type: z.literal("object") }),
					annotations: z.object({
						readOnlyHint: z.boolean(),
						destructiveHint: z.boolean(),
					}),
				}),
			)
			.parse(discovery.body.result?.tools);
		expect(
			tools.some(
				(tool) => tool.name === "create_item" && !tool.annotations.readOnlyHint,
			),
		).toBe(true);
		expect(
			tools.some(
				(tool) => tool.name === "read_item" && tool.annotations.readOnlyHint,
			),
		).toBe(true);
		expect(
			(
				await call(connected.access_token, "delete_item", {
					itemId: "mcp-item-a",
				})
			).body.error,
		).toBeDefined();
		expect(
			(
				await call(connected.access_token, "list_items", {
					collectionId: "mcp-collection-a",
					limit: 26,
				})
			).body.result?.isError,
		).toBe(true);
		expect(
			(
				await request("/api/mcp", {
					...post({ large: "x".repeat(17_000) }),
					headers: { authorization: `Bearer ${connected.access_token}` },
				})
			).status,
		).toBe(413);
		expect(
			(
				await request("/api/mcp", {
					headers: {
						origin: "https://evil.example",
						authorization: `Bearer ${connected.access_token}`,
					},
				})
			).status,
		).toBe(403);
	});
	it("preserves Collection-only boundaries, export capability, pagination and lost access", async () => {
		const connected = await connect(viewer);
		const list = await call(connected.access_token, "list_collections", {
			workspaceId: "mcp-workspace-a",
			limit: 1,
		});
		expect(list.text).toContain("mcp-collection-a");
		expect(list.text).not.toContain("mcp-hidden");
		for (const [name, args] of [
			["read_collection", { collectionId: "mcp-hidden" }],
			["read_workspace", { workspaceId: "mcp-workspace-a" }],
			["read_item", { itemId: "mcp-item-b" }],
		] as const) {
			const result = await call(connected.access_token, name, args);
			expect(result.body.result?.isError, result.text).toBe(true);
		}
		expect(
			(
				await call(connected.access_token, "list_items", {
					collectionId: "mcp-collection-a",
					limit: 1,
					offset: 1,
				})
			).text,
		).not.toContain("mcp-item-a");
		await env.DB.prepare(
			"delete from collection_memberships where id = 'mcp-scope'",
		).run();
		expect(
			(
				await call(connected.access_token, "read_item", {
					itemId: "mcp-item-a",
				})
			).body.result?.isError,
		).toBe(true);
	});
	it("reads context without creating snapshots; existing snapshots retain creator checks", async () => {
		const connected = await connect();
		const before = await env.DB.prepare(
			"select count(*) as count from context_snapshots",
		).first();
		const current = await call(
			connected.access_token,
			"read_collection_context",
			{ collectionId: "mcp-collection-a" },
		);
		expect(current.body.result?.isError, current.text).not.toBe(true);
		expect(current.text).toContain("mcp-item-a");
		expect(
			await env.DB.prepare(
				"select count(*) as count from context_snapshots",
			).first(),
		).toEqual(before);
		const created = await request(
			"/api/collections/mcp-collection-a/context-snapshots",
			{ method: "POST" },
			owner,
		);
		const snapshot = z
			.object({ snapshot: z.object({ id: z.string() }) })
			.parse(await created.json());
		const peer = await connect(other);
		expect(
			(
				await call(peer.access_token, "read_context_snapshot", {
					snapshotId: snapshot.snapshot.id,
				})
			).body.result?.isError,
		).toBe(true);
		expect(
			(
				await call(connected.access_token, "read_context_snapshot", {
					snapshotId: snapshot.snapshot.id,
				})
			).body.result?.isError,
		).not.toBe(true);
	});
	it("bounds output without leaking a partial payload and rechecks account request limits", async () => {
		const connected = await connect();
		await env.DB.prepare(
			"update items set description = ? where id = 'mcp-item-a'",
		)
			.bind("private-text".repeat(10_000))
			.run();
		const oversized = await call(connected.access_token, "read_item", {
			itemId: "mcp-item-a",
		});
		expect(oversized.body.result?.isError).toBe(true);
		expect(oversized.text).not.toContain("private-text");
		for (let index = 0; index < 59; index += 1)
			expect((await rpc(connected.access_token, "ping")).status).toBe(200);
		const limited = await rpc(connected.access_token, "ping");
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toBeTruthy();
	});
});

const actionReceipt = z.object({
	id: z.string(),
	status: z.string(),
	result: z.unknown(),
	approvalUrl: z.string().nullable(),
});
const writeCall = async (
	token: string,
	name: string,
	args: unknown,
	operationId = crypto.randomUUID(),
) => {
	const response = await call(token, name, { operationId, arguments: args });
	return {
		response,
		receipt: response.body.result?.structuredContent
			? actionReceipt.parse(response.body.result.structuredContent)
			: null,
	};
};
const approveAction = (id: string, approve = true, userId = owner) =>
	request(`/api/connectors/actions/${id}/decision`, post({ approve }), userId);

const visualEnv = () => ({ ...pilotEnv(), CHATGPT_VISUALS_ENABLED: "true" });
const visualCall = (token: string, name: string, args: unknown) =>
	rpc(token, "tools/call", { name, arguments: args }, visualEnv());
const pngBytes = () =>
	Uint8Array.from(
		atob(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
		),
		(c) => c.charCodeAt(0),
	);
const imageResponse = () =>
	new Response(pngBytes(), { headers: { "content-type": "image/png" } });
const importArgs = (runId: string) => ({
	runId,
	operationId: crypto.randomUUID(),
	file: {
		download_url:
			"https://files.oaiusercontent.com/file-local-fixture?sig=secret",
		file_id: "file-local-fixture",
		mime_type: "image/png",
		file_name: "room.png",
	},
	reportedModel: null,
	caption: "Warmer room draft",
});
const runResult = z.object({
	id: z.string(),
	status: z.string(),
	outputImageId: z.string().nullable(),
});
async function visualFixture() {
	const connection = await connect(owner, true);
	const token = await env.DB.prepare(
		"select id,session_id from oauth_access_token where client_id=?",
	)
		.bind(connection.clientId)
		.first<{ id: string; session_id: string }>();
	if (!token) throw Error("No test grant");
	const ctx = {
		env: visualEnv(),
		actor: {
			userId: owner,
			clientId: connection.clientId,
			accessTokenId: token.id,
			sessionId: token.session_id,
			scopes: ["wantkit:read", "wantkit:write"],
		},
	};
	await env.DB.prepare(
		"insert into concepts(id,collection_id,title,narrative,created_by_user_id,updated_by_user_id) values('mcp-concept','mcp-collection-a','Room','Warm',?,?)",
	)
		.bind(owner, owner)
		.run();
	const mediaInput = {
		database: env.DB,
		bucket: env.CONCEPT_MEDIA,
		collectionId: "mcp-collection-a",
		userId: owner,
		limits: conceptMediaLimits(env),
	};
	const upload = async (role = "base") => {
		const form = new FormData();
		form.set("file", new File([pngBytes()], "room.png", { type: "image/png" }));
		form.set("role", role);
		if (role === "base") form.set("subjectKind", "space");
		form.set("caption", "Original room");
		form.set("containsPerson", "false");
		form.set("personRightsConfirmed", "false");
		return uploadConceptImage({
			...mediaInput,
			images: env.IMAGES,
			rateLimitSecret: env.BETTER_AUTH_SECRET,
			request: new Request(origin, { method: "POST", body: form }),
		});
	};
	const media = await upload();
	const base = media.images[0];
	const selection: {
		baseImageId: string | null;
		floorPlanId: string | null;
		referenceImageIds: string[];
		candidates: { itemId: string; candidateId: string }[];
		prompt: string;
	} = {
		baseImageId: base.id,
		floorPlanId: null,
		referenceImageIds: [],
		candidates: [],
		prompt: "Keep the room geometry. Add warmer lighting. No people.",
	};
	const prepare = async () => {
		const response = await visualCall(
			connection.access_token,
			"prepare_visual_edit",
			{
				operationId: crypto.randomUUID(),
				arguments: { collectionId: "mcp-collection-a", value: selection },
			},
		);
		const receipt = actionReceipt.parse(
			response.body.result?.structuredContent,
		);
		expect(receipt.status, response.text).toBe("pending");
		return receipt;
	};
	const approve = async (id: string) => {
		const response = await request(
			`/api/connectors/actions/${id}/decision`,
			post({ approve: true }),
			owner,
			visualEnv(),
		);
		const receipt = actionReceipt.parse(await response.json());
		expect(receipt.status, JSON.stringify(receipt)).toBe("succeeded");
		return runResult.parse(receipt.result);
	};
	return {
		connection,
		ctx,
		mediaInput,
		base,
		selection,
		prepare,
		approve,
		upload,
	};
}
afterEach(() => vi.restoreAllMocks());

async function refreshVisualFixture(f: Awaited<ReturnType<typeof visualFixture>>) {
	const response = await request("/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			client_id: f.connection.clientId,
			client_secret: f.connection.clientSecret,
			refresh_token: f.connection.refresh_token,
			resource: f.connection.endpoint,
		}),
	});
	expect(response.status).toBe(200);
	const tokens = tokensSchema.parse(await response.json());
	const actor = await authenticateMcpRequest(f.ctx.env, new Request(origin, {
		headers: { authorization: `Bearer ${tokens.access_token}` },
	}));
	if (!actor) throw new Error("Refreshed test grant was rejected");
	return { tokens, ctx: { ...f.ctx, actor } };
}

describe("private ChatGPT image pilot", () => {
	it("keeps approved image reads usable after a same-grant token refresh", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const before = await readVisualRun(f.ctx, run.id);
		const { tokens } = await refreshVisualFixture(f);
		const binary = await visualCall(tokens.access_token, "read_visual_image", {
			runId: run.id,
			sourceId: f.base.id,
		});
		expect(binary.body.result?.isError, binary.text).not.toBe(true);
		expect(binary.body.result?.content).toEqual(expect.arrayContaining([
			expect.objectContaining({ type: "image", mimeType: "image/webp" }),
		]));
		expect(visualImageResultSchema.parse(binary.body.result?.structuredContent).source.id).toBe(f.base.id);
		const status = await visualCall(tokens.access_token, "read_visual_run", { runId: run.id });
		expect(visualRunResultSchema.parse(status.body.result?.structuredContent)).toEqual(before);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => imageResponse());
		const args = importArgs(run.id);
		const imported = await visualCall(tokens.access_token, "import_visual_image", args);
		expect(imported.body.result?.isError, imported.text).not.toBe(true);
		const saved = visualRunResultSchema.parse(imported.body.result?.structuredContent);
		expect(saved.status).toBe("completed");
		expect(saved.expiresAt).toBe(before.expiresAt);
		const replay = await visualCall(tokens.access_token, "import_visual_image", args);
		expect(visualRunResultSchema.parse(replay.body.result?.structuredContent).outputImageId).toBe(saved.outputImageId);
		expect((await readConceptMedia(f.mediaInput)).images).toHaveLength(2);
	});
	it("rejects a separate authorization for the same user, client and session", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const separate = await exchange(await authorize(owner, f.connection, true, true));
		expect(separate.status).toBe(200);
		const tokens = tokensSchema.parse(await separate.json());
		for (const name of ["read_visual_run", "read_visual_image", "import_visual_image"]) {
			const args = name === "read_visual_image" ? { runId: run.id, sourceId: f.base.id }
				: name === "import_visual_image" ? importArgs(run.id) : { runId: run.id };
			const response = await visualCall(tokens.access_token, name, args);
			expect(response.body.result?.isError, response.text).toBe(true);
			expect(response.body.result?.structuredContent).toBeUndefined();
		}
	});
	it.each(["original expiry", "original revocation", "current revocation", "missing lineage"])(
		"does not let a refresh bypass %s", async (reason) => {
			const f = await visualFixture();
			const run = await f.approve((await f.prepare()).id);
			const refreshed = await refreshVisualFixture(f);
			if (reason === "original expiry") await env.DB.prepare("update oauth_access_token set expires_at=0 where id=?").bind(f.ctx.actor.accessTokenId).run();
			else if (reason === "missing lineage") await env.DB.prepare("update oauth_access_token set authorization_code_id=null where id=?").bind(refreshed.ctx.actor.accessTokenId).run();
			else await env.DB.prepare("update oauth_access_token set revoked=1 where id=?").bind(reason === "original revocation" ? f.ctx.actor.accessTokenId : refreshed.ctx.actor.accessTokenId).run();
			await expect(readVisualImage(refreshed.ctx, run.id, f.base.id)).rejects.toMatchObject({ status: reason === "missing lineage" ? 404 : 403 });
		});
	it.each(["original", "current"])("rechecks %s token revocation at the final import transaction after refresh", async (which) => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const refreshed = await refreshVisualFixture(f);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => imageResponse());
		let intercepted = false;
		const database = new Proxy(env.DB, {
			get(target, key) {
				if (key === "batch") return async (statements: D1PreparedStatement[]) => {
					if (!intercepted) {
						intercepted = true;
						await target.prepare("update oauth_access_token set revoked=1 where id=?").bind(which === "original" ? f.ctx.actor.accessTokenId : refreshed.ctx.actor.accessTokenId).run();
					}
					return target.batch(statements);
				};
				const member = Reflect.get(target, key);
				return typeof member === "function" ? member.bind(target) : member;
			},
		});
		await expect(importVisualImage({ ...refreshed.ctx, env: { ...refreshed.ctx.env, DB: database } }, importArgs(run.id))).rejects.toMatchObject({ status: 403 });
		expect(intercepted).toBe(true);
		expect(await env.DB.prepare("select count(*) as n from concept_images where concept_id='mcp-concept' and role='edited'").first("n")).toBe(0);
		expect(await env.DB.prepare("select reserved_bytes from visual_runs where id=?").bind(run.id).first("reserved_bytes")).toBe(0);
	});
	it("encodes a photo-sized transformed payload without losing bytes", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		// Stub only the image-transform output to isolate the binary transport seam.
		const bytes = Uint8Array.from({ length: 885192 }, (_, i) => i % 256);
		const transformer: ImageTransformer = {
			transform: () => transformer,
			draw: () => transformer,
			output: async () => ({
				image: () => new Blob([bytes]).stream(),
				response: () => new Response(bytes),
				contentType: () => "image/webp",
			}),
		};
		vi.spyOn(env.IMAGES, "input").mockReturnValue(transformer);
		const response = await visualCall(f.connection.access_token, "read_visual_image", { runId: run.id, sourceId: f.base.id });
		expect(response.body.result?.isError, response.text).not.toBe(true);
		const content = z.array(z.object({ type: z.string(), data: z.string().optional() })).parse(response.body.result?.content);
		expect(Uint8Array.from(atob(content[1].data!), c => c.charCodeAt(0))).toEqual(bytes);
		expect(visualImageResultSchema.parse(response.body.result?.structuredContent).byteSize).toBe(bytes.length);
	});
	it("rolls back the final image insert if source cancellation wins just before the database batch", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => imageResponse());
		let intercepted = false;
		const database = new Proxy(env.DB, {
			get(target, key) {
				if (key === "batch") return async (statements: D1PreparedStatement[]) => {
					if (!intercepted) {
						intercepted = true;
						await env.DB.prepare("update concept_images set deleted_at=?,deleted_by_user_id=uploaded_by_user_id where id=?").bind(Date.now(), f.base.id).run();
						await cleanupVisualRuns(env.DB, env.CONCEPT_MEDIA, "mcp-collection-a");
					}
					return target.batch(statements);
				};
				const member = Reflect.get(target, key);
				return typeof member === "function" ? member.bind(target) : member;
			},
		});
		const result = await importVisualImage({ ...f.ctx, env: { ...f.ctx.env, DB: database } }, importArgs(run.id));
		expect(intercepted).toBe(true);
		expect(result.status).toBe("failed");
		expect(await env.DB.prepare("select count(*) from concept_images where concept_id='mcp-concept' and deleted_at is null").first("count(*)")).toBe(0);
		expect(await env.DB.prepare("select reserved_bytes from visual_runs where id=?").bind(run.id).first("reserved_bytes")).toBe(0);
	});
	it("hides pilot tools by default and publishes the complete top-level ChatGPT file parameter when enabled", async () => {
		const c = await connect(owner, true);
		const disabled = await rpc(c.access_token, "tools/list");
		expect(disabled.text).not.toContain('"import_visual_image"');
		const enabled = await rpc(c.access_token, "tools/list", {}, visualEnv());
		const descriptors = z
			.array(
				z.object({
					name: z.string(),
					inputSchema: z.record(z.string(), z.unknown()),
					outputSchema: z.record(z.string(), z.unknown()).optional(),
					_meta: z.record(z.string(), z.unknown()).optional(),
				}),
			)
			.parse(enabled.body.result?.tools);
		for (const name of ["read_visual_run", "read_visual_image", "import_visual_image"]) {
			expect(descriptors.find(t => t.name === name)?.outputSchema).toMatchObject({ type: "object" });
		}
		const tool = descriptors.find((t) => t.name === "import_visual_image")!;
		expect(tool._meta?.["openai/fileParams"]).toEqual(["file"]);
		const schema = z
			.object({
				properties: z.object({
					file: z.object({
						properties: z.record(z.string(), z.unknown()),
						required: z.array(z.string()),
					}),
				}),
			})
			.parse(tool.inputSchema);
		expect(Object.keys(schema.properties.file.properties).sort()).toEqual([
			"download_url",
			"file_id",
			"file_name",
			"mime_type",
		]);
		expect(schema.properties.file.required).toEqual([
			"download_url",
			"file_id",
		]);
	});
	it("requires browser approval, transfers only selected image bytes, and denies another grant or viewer", async () => {
		const f = await visualFixture();
		const pending = await f.prepare();
		expect(
			await env.DB.prepare("select count(*) as n from visual_runs").first("n"),
		).toBe(0);
		const run = await f.approve(pending.id);
		const binary = await visualCall(
			f.connection.access_token,
			"read_visual_image",
			{ runId: run.id, sourceId: f.base.id },
		);
		expect(binary.body.result?.isError, binary.text).not.toBe(true);
		const content = z
			.array(
				z.object({
					type: z.string(),
					data: z.string().optional(),
					mimeType: z.string().optional(),
				}),
			)
			.parse(binary.body.result?.content);
		expect(content[1]).toMatchObject({ type: "image", mimeType: "image/webp" });
		expect(atob(content[1].data!)).toContain("WEBP");
		expect(binary.text).not.toContain("concept-images/");
		await expect(
			readVisualImage(f.ctx, run.id, "unselected"),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			readVisualRun(
				{ ...f.ctx, actor: { ...f.ctx.actor, clientId: "other-client" } },
				run.id,
			),
		).rejects.toMatchObject({ status: 404 });
		await env.DB.prepare(
			"update workspace_memberships set role='viewer' where user_id=?",
		)
			.bind(owner)
			.run();
		await expect(
			readVisualImage(f.ctx, run.id, f.base.id),
		).rejects.toMatchObject({ status: 403 });
	});
	it("refuses stale approval and person images before sharing", async () => {
		const f = await visualFixture();
		const pending = await f.prepare();
		await f.upload();
		const response = await request(
			`/api/connectors/actions/${pending.id}/decision`,
			post({ approve: true }),
			owner,
			visualEnv(),
		);
		expect(response.status).toBe(403);
		await env.DB.prepare(
			"update concept_images set contains_person=1,person_rights_confirmed_at=? where deleted_at is null",
		)
			.bind(Date.now())
			.run();
		f.selection.baseImageId = (
			await readConceptMedia(f.mediaInput)
		).images[0].id;
		const denied = await visualCall(
			f.connection.access_token,
			"prepare_visual_edit",
			{
				operationId: crypto.randomUUID(),
				arguments: { collectionId: "mcp-collection-a", value: f.selection },
			},
		);
		expect(denied.body.result?.isError).toBe(true);
	});
	it("stores one normalized draft with provenance, preserves the original, and requires approval to adopt it", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const args = importArgs(run.id);
		const fetcher = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () => imageResponse());
		const response = await visualCall(f.connection.access_token, "import_visual_image", args);
        expect(response.body.result?.isError,response.text).toBe(false);
        const result = runResult.parse(response.body.result?.structuredContent);
		expect(result.status).toBe("completed");
		const replay = await importVisualImage(f.ctx, {
			...args,
			file: {
				...args.file,
				download_url:
					"https://files.oaiusercontent.com/file-local-fixture?sig=new",
			},
		});
		expect(replay.outputImageId).toBe(result.outputImageId);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0][1]).toMatchObject({
			redirect: "manual",
			headers: { accept: "image/png,image/jpeg,image/webp" },
		});
		expect(
			JSON.stringify(
				await env.DB.prepare("select * from visual_runs where id=?")
					.bind(run.id)
					.first(),
			),
		).not.toContain("sig=secret");
		await expect(
			importVisualImage(f.ctx, { ...args, caption: "Different" }),
		).rejects.toMatchObject({ status: 409 });
		fetcher.mockRestore();
		const media = await readConceptMedia(f.mediaInput);
		expect(media.images).toHaveLength(2);
		expect(media.images.find((i) => i.id === f.base.id)).toMatchObject({
			role: "base",
			isCover: true,
		});
		const draft = media.images.find((i) => i.id === result.outputImageId)!;
		expect(draft).toMatchObject({
			role: "edited",
			isCover: false,
			generation: {
				provider: "chatgpt",
				prompt: f.selection.prompt,
				baseImageId: f.base.id,
				sourceLabels: ["Original room"],
			},
		});
		const content = await readConceptImageContent({
			...f.mediaInput,
			imageId: draft.id,
			requestHeaders: new Headers(),
		});
		expect(content.status).toBe(200);
		expect(content.headers.get("cache-control")).toBe("private, no-store");
		const adopt = await writeCall(
			f.connection.access_token,
			"update_concept_image",
			{
				collectionId: "mcp-collection-a",
				imageId: draft.id,
				value: { isCover: true },
			},
		);
		expect(adopt.receipt?.status).toBe("pending");
		await deleteConceptImage({ ...f.mediaInput, imageId: f.base.id });
		await expect(
			readConceptImageContent({
				...f.mediaInput,
				imageId: draft.id,
				requestHeaders: new Headers(),
			}),
		).rejects.toMatchObject({ status: 404 });
		expect(
			await env.CONCEPT_MEDIA.get(
				(await env.DB.prepare("select object_key from visual_runs where id=?")
					.bind(run.id)
					.first<string>("object_key"))!,
			),
		).toBeNull();
		expect(
			await env.DB.prepare(
				"select selection_json,sources_json from visual_runs where id=?",
			)
				.bind(run.id)
				.first(),
		).toEqual({ selection_json: "{}", sources_json: "[]" });
	});
	it("reserves quota across simultaneous imports and manual uploads, with one download on replay", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const args = importArgs(run.id);
		let release!: () => void;
		let started!: () => void;
		const start = new Promise<void>((r) => {
			started = r;
		});
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const fetcher = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () => {
				started();
				await gate;
				return imageResponse();
			});
		const imported = importVisualImage(f.ctx, args);
		await start;
		try {
			expect((await importVisualImage(f.ctx, args)).status).toBe("importing");
			const constrained = {
				...f.mediaInput,
				limits: { ...f.mediaInput.limits, maxImageCount: 2 },
			};
			const form = new FormData();
			form.set(
				"file",
				new File([pngBytes()], "ref.png", { type: "image/png" }),
			);
			form.set("role", "reference");
			form.set("containsPerson", "false");
			form.set("personRightsConfirmed", "false");
			await expect(
				uploadConceptImage({
					...constrained,
					images: env.IMAGES,
					rateLimitSecret: env.BETTER_AUTH_SECRET,
					request: new Request(origin, { method: "POST", body: form }),
				}),
			).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" });
		} finally {
			release();
		}
		expect((await imported).status).toBe("completed");
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it("rechecks revoked access after download and leaves no saved output", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			await env.DB.prepare("update oauth_access_token set revoked=1 where id=?")
				.bind(f.ctx.actor.accessTokenId)
				.run();
			return imageResponse();
		});
		await expect(
			importVisualImage(f.ctx, importArgs(run.id)),
		).rejects.toMatchObject({ status: 403 });
		const row = await env.DB.prepare(
			"select status,reserved_bytes,object_key from visual_runs where id=?",
		)
			.bind(run.id)
			.first<{ status: string; reserved_bytes: number; object_key: string }>();
		expect(row).toMatchObject({ status: "failed", reserved_bytes: 0 });
		expect(await env.CONCEPT_MEDIA.get(row!.object_key)).toBeNull();
		expect((await readConceptMedia(f.mediaInput)).images).toHaveLength(1);
	});
	it("cancels a source deleted during download and scrubs the prompt without publishing a draft", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			await deleteConceptImage({ ...f.mediaInput, imageId: f.base.id });
			return imageResponse();
		});
		expect((await importVisualImage(f.ctx, importArgs(run.id))).status).toBe(
			"failed",
		);
		expect((await readConceptMedia(f.mediaInput)).images).toHaveLength(0);
		expect(
			await env.DB.prepare(
				"select selection_json,reserved_bytes from visual_runs where id=?",
			)
				.bind(run.id)
				.first(),
		).toEqual({ selection_json: "{}", reserved_bytes: 0 });
	});
	it("expires unused requests and recovers abandoned import reservations and objects", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		await env.DB.prepare("update visual_runs set expires_at=0 where id=?")
			.bind(run.id)
			.run();
		await expect(
			readVisualImage(f.ctx, run.id, f.base.id),
		).rejects.toMatchObject({ status: 409 });
		expect((await readVisualRun(f.ctx, run.id)).status).toBe("cancelled");
		const next = await f.approve((await f.prepare()).id);
		const key = "concept-images/abandoned-visual";
		await env.CONCEPT_MEDIA.put(key, pngBytes(), {
			customMetadata: { visualRunId: next.id },
		});
		await env.DB.prepare(
			"update visual_runs set status='importing',object_key=?,reserved_bytes=10485760,updated_at=0 where id=?",
		)
			.bind(key, next.id)
			.run();
		await cleanupVisualRuns(env.DB, env.CONCEPT_MEDIA, "mcp-collection-a");
		expect(await env.CONCEPT_MEDIA.get(key)).toBeNull();
		expect((await readVisualRun(f.ctx, next.id)).status).toBe("failed");
	});
	it.each([
		"sdmntprcentralus",
		"sdmntprnorthcentralus",
		"sdmntpreastus2",
		"sdmntprwestus2",
		"sdmntprsouthcentralus",
		"sdmntprfutureregion9", // Fictional region: support does not depend on enumeration.
	])("imports the native OpenAI host %s through MCP without changing the original or cover", async (nativeHost) => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const args = importArgs(run.id);
		// Match the native three-segment shape; file values and signatures are fictional.
		args.file.download_url = `https://${nativeHost}.oaiusercontent.com/fixture-container/fixture-directory/fixture-image?sig=private-signature`;
		args.file.file_id = "file_native_fixture";
		const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => imageResponse());
		const response = await visualCall(f.connection.access_token, "import_visual_image", args);
		expect(response.body.result?.isError, response.text).not.toBe(true);
		const saved = visualRunResultSchema.parse(response.body.result?.structuredContent);
		expect(saved.status).toBe("completed");
		expect(saved.outputImageId).toBeTruthy();
		expect(fetcher).toHaveBeenCalledExactlyOnceWith(args.file.download_url, {
			redirect: "manual", signal: expect.any(AbortSignal),
			headers: { accept: "image/png,image/jpeg,image/webp" },
		});
		const media = await readConceptMedia(f.mediaInput);
		expect(media.images).toHaveLength(2);
		expect(media.images.find(image => image.id === f.base.id)).toEqual(f.base);
		expect(media.images.find(image => image.id === saved.outputImageId)).toMatchObject({
			role: "edited", generation: { baseImageId: f.base.id }, isCover: false, contentType: "image/webp",
		});
		const replay = await visualCall(f.connection.access_token, "import_visual_image", args);
		expect(visualRunResultSchema.parse(replay.body.result?.structuredContent).outputImageId).toBe(saved.outputImageId);
		expect(fetcher).toHaveBeenCalledTimes(1);
		const stored = await env.DB.prepare("select * from visual_runs where id=?").bind(run.id).first();
		expect(JSON.stringify(stored)).not.toContain("private-signature");
		expect(JSON.stringify(stored)).not.toContain("oaiusercontent.com");
	});
	it.each([
		"sdmntprcentralus",
		"sdmntprnorthcentralus",
		"sdmntpreastus2",
		"sdmntprwestus2",
		"sdmntprsouthcentralus",
		"sdmntprfutureregion9", // Fictional region: support does not depend on enumeration.
	])("limits native-host support to the regional family and path shape for %s", (nativeHost) => {
		const accepted = `https://${nativeHost}.oaiusercontent.com/container/directory/image?sig=unchanged`;
		expect(chatgptDownloadUrl(accepted).href).toBe(accepted);
		for (const url of [
			`https://${nativeHost}.oaiusercontent.com.evil.test/a/b/c`,
			`https://evil-${nativeHost}.oaiusercontent.com/a/b/c`,
			"https://unreviewed.oaiusercontent.com/a/b/c",
			"https://oaiusercontent.com/a/b/c",
			"https://sdmntpr.oaiusercontent.com/a/b/c",
			"https://sdmntpr-region.oaiusercontent.com/a/b/c",
			"https://sdmntpr_region.oaiusercontent.com/a/b/c",
			"https://sdmntpr1region.oaiusercontent.com/a/b/c",
			`https://sdmntpr${"a".repeat(57)}.oaiusercontent.com/a/b/c`,
			`https://${nativeHost}.oaiusercontent.com./a/b/c`,
			`https://${nativeHost}.oaiusercontent-com/a/b/c`,
			`https://${nativeHost}.oaiusercontent.com@127.0.0.1/a/b/c`,
			`https://child.${nativeHost}.oaiusercontent.com/a/b/c`,
			`https://${nativeHost}.blob.core.windows.net/a/b/c`,
			`http://${nativeHost}.oaiusercontent.com/a/b/c`,
			`https://${nativeHost}.oaiusercontent.com:8443/a/b/c`,
			`https://user:pass@${nativeHost}.oaiusercontent.com/a/b/c`,
			`https://${nativeHost}.oaiusercontent.com/a/b/c#fragment`,
			`https://${nativeHost}.oaiusercontent.com/`,
			`https://${nativeHost}.oaiusercontent.com/file-fixture`,
			`https://${nativeHost}.oaiusercontent.com/a/b/`,
			`https://${nativeHost}.oaiusercontent.com/a/../b/c`,
			`https://${nativeHost}.oaiusercontent.com/a//b/c`,
		]) expect(() => chatgptDownloadUrl(url)).toThrow();
	});
	it.each([
		"sdmntprcentralus",
		"sdmntprnorthcentralus",
		"sdmntpreastus2",
		"sdmntprwestus2",
		"sdmntprsouthcentralus",
		"sdmntprfutureregion9", // Fictional region: support does not depend on enumeration.
	])("rejects redirects from the native host %s without making another request", async (nativeHost) => {
		const args = importArgs("unused");
		args.file.download_url = `https://${nativeHost}.oaiusercontent.com/a/b/c`;
		const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, {
			status: 302, headers: { location: "http://127.0.0.1/private" },
		}));
		await expect(downloadChatgptImage(args.file, 1024)).rejects.toMatchObject({ code: "INVALID_MEDIA" });
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
	});
	it("returns a redacted native-file URL rejection through MCP before any import side effects", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const before = await env.DB.prepare("select * from visual_runs where id=?").bind(run.id).first();
		const fetcher = vi.spyOn(globalThis, "fetch");
		const args = importArgs(run.id);
		args.file.download_url = "https://native-files.example.test/private-path/file_hidden-id/image-private.png?sig=query-secret";
		args.file.file_id = "hidden-handoff-id";
		args.file.file_name = "private-room-name.png";
		const response = await visualCall(f.connection.access_token, "import_visual_image", args);
		expect(response.body.result?.isError).toBe(true);
		expect(response.text).toContain("CHATGPT_FILE_URL_REJECTED");
		const content = z.array(z.object({ type: z.literal("text"), text: z.string() })).parse(response.body.result?.content);
		expect(content[0].text).toContain(JSON.stringify({
			reason: "host",
			scheme: "https:",
			hostname: "native-files.example.test",
			pathShape: "/<redacted>/file_<redacted>/<redacted>.png",
		}));
		for (const secret of ["private-path", "hidden-id", "image-private", "query-secret", "hidden-handoff-id", "private-room-name"])
			expect(response.text).not.toContain(secret);
		expect(fetcher).not.toHaveBeenCalled();
		expect(await env.DB.prepare("select * from visual_runs where id=?").bind(run.id).first()).toEqual(before);
		expect((await readConceptMedia(f.mediaInput)).images).toEqual([f.base]);
	});
	it("redacts URL diagnostics for every rejection reason without reflecting credentials or arbitrary path text", () => {
		for (const [url, reason, scheme, hostname, pathShape] of [
			["not-a-url private-secret", "malformed", null, null, null],
			["data:image/png;base64,private-secret", "scheme", "data:", null, null],
			["sandbox:/mnt/data/private-secret.png", "scheme", "sandbox:", null, null],
			["private-secret:/private-secret", "scheme", "other", null, null],
			["http://files.oaiusercontent.com/file-private-secret", "scheme", "http:", "files.oaiusercontent.com", "/file-<redacted>"],
			["https://private-secret:private-secret@files.oaiusercontent.com/file-private-secret?sig=private-secret", "credentials", "https:", "files.oaiusercontent.com", "/file-<redacted>"],
			["https://files.oaiusercontent.com:8443/file-private-secret", "port", "https:", "files.oaiusercontent.com", "/file-<redacted>"],
			["https://files.oaiusercontent.com/file-private-secret#private-secret", "fragment", "https:", "files.oaiusercontent.com", "/file-<redacted>"],
			["https://files.oaiusercontent.com/file_private-secret.png?sig=private-secret", "path", "https:", "files.oaiusercontent.com", "/file_<redacted>.png"],
			["https://files.oaiusercontent.com/%70rivate-secret.png/private-secret?sig=private-secret", "path", "https:", "files.oaiusercontent.com", "/<redacted>.png/<redacted>"],
		]) {
			try {
				chatgptDownloadUrl(url!);
				throw new Error("Expected rejected URL");
			} catch (error) {
				expect(error).toMatchObject({ code: "INVALID_MEDIA", status: 400 });
				const message = error instanceof Error ? error.message : "";
				expect(message).toContain("CHATGPT_FILE_URL_REJECTED");
				expect(message).toContain(JSON.stringify({ reason, scheme, hostname, pathShape }));
				expect(message).not.toContain("private-secret");
			}
		}
		const accepted = "https://files.oaiusercontent.com/file-valid?sig=unchanged";
		expect(chatgptDownloadUrl(accepted).href).toBe(accepted);
		const oversizedHost = `${"private-secret".repeat(20)}.example.test`;
		const deepPath = "/private-secret".repeat(100);
		try {
			chatgptDownloadUrl(`https://${oversizedHost}${deepPath}?sig=private-secret`);
			throw new Error("Expected rejected URL");
		} catch (error) {
			expect(error).toMatchObject({ code: "INVALID_MEDIA" });
			const message = error instanceof Error ? error.message : "";
			expect(message.length).toBeLessThan(1024);
			expect(message).toContain('"hostname":null');
			expect(message).toContain("/<more>");
			expect(message).not.toContain("private-secret");
		}
	});
	it("rejects unsafe hosts, credentials, redirects, MIME mismatches and oversized streaming bodies", async () => {
		for (const url of [
			"http://files.oaiusercontent.com/file-a",
			"https://files.oaiusercontent.com.evil.test/file-a",
			"https://127.0.0.1/file-a",
			"https://user:pass@files.oaiusercontent.com/file-a",
			"https://files.oaiusercontent.com:8443/file-a",
			"https://files.oaiusercontent.com/other",
			"https://files.oaiusercontent.com/file-a#fragment",
		])
			expect(() => chatgptDownloadUrl(url)).toThrow();
		const args = importArgs("unused");
		const fetcher = vi.spyOn(globalThis, "fetch");
		for (const response of [
			new Response(null, {
				status: 302,
				headers: { location: "http://127.0.0.1" },
			}),
			new Response("text", { headers: { "content-type": "text/html" } }),
			new Response(pngBytes(), { headers: { "content-type": "image/jpeg" } }),
		]) {
			fetcher.mockResolvedValueOnce(response);
			await expect(downloadChatgptImage(args.file, 1024)).rejects.toMatchObject({
				code: "INVALID_MEDIA",
				message: "The ChatGPT download did not return a non-empty PNG, JPEG or WebP image.",
			});
		}
		await expect(boundedBytes(new Response("12345"), 4)).rejects.toMatchObject({
			code: "INVALID_MEDIA",
		});
		await expect(
			boundedBytes(
				new Response("x", { headers: { "content-length": "2000" } }),
				1024,
			),
		).rejects.toMatchObject({ code: "INVALID_MEDIA" });
	});
	it("delivers drawing images for interpretation and invalidates an edit when its selected drawing is deleted", async () => {
		const f = await visualFixture();
		const planId = "mcp-visual-plan";
		const base = await env.DB.prepare(
			"select object_key from concept_images where id=?",
		)
			.bind(f.base.id)
			.first<string>("object_key");
		const original = await env.CONCEPT_MEDIA.get(base!);
		await env.CONCEPT_MEDIA.put(
			"floor-plans/visual-fixture",
			await original!.arrayBuffer(),
		);
		await env.DB.prepare(
			"insert into floor_plans(id,collection_id,title,object_key,content_type,byte_size,width,height,status,uploaded_by_user_id) values(?,?,'Room drawing','floor-plans/visual-fixture','image/webp',?,1,1,'ready',?)",
		)
			.bind(planId, "mcp-collection-a", original!.size, owner)
			.run();
		f.selection.floorPlanId = planId;
		f.selection.baseImageId = null;
		const drawing = await f.approve((await f.prepare()).id);
		expect(
			(await readVisualImage(f.ctx, drawing.id, planId)).content[1].type,
		).toBe("image");
		await expect(
			importVisualImage(f.ctx, importArgs(drawing.id)),
		).rejects.toMatchObject({ status: 409 });
		f.selection.baseImageId = f.base.id;
		const edit = await f.approve((await f.prepare()).id);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
			imageResponse(),
		);
		const result = await importVisualImage(f.ctx, importArgs(edit.id));
		expect(result.status).toBe("completed");
		await deleteFloorPlan({ ...f.mediaInput, planId });
		expect((await readVisualRun(f.ctx, edit.id)).status).toBe("cancelled");
		expect((await readConceptMedia(f.mediaInput)).images).toHaveLength(1);
	});
	it("rechecks authorization after private object reads", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const bucket = new Proxy(env.CONCEPT_MEDIA, {
			get(target, key) {
				if (key === "get")
					return async (id: string) => {
						const object = await target.get(id);
						await env.DB.prepare(
							"update oauth_access_token set revoked=1 where id=?",
						)
							.bind(f.ctx.actor.accessTokenId)
							.run();
						return object;
					};
				const member = Reflect.get(target, key);
				return typeof member === "function" ? member.bind(target) : member;
			},
		});
		await expect(
			readVisualImage(
				{ ...f.ctx, env: { ...f.ctx.env, CONCEPT_MEDIA: bucket } },
				run.id,
				f.base.id,
			),
		).rejects.toMatchObject({ status: 403 });
	});
	it("keeps failed deletion retryable and never deletes a colliding storage object", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		const args = importArgs(run.id);
		vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
			imageResponse(),
		);
		let collisionKey = "";
		const collision = new Proxy(env.CONCEPT_MEDIA, {
			get(target, key) {
				if (key === "put")
					return async (id: string) => {
						collisionKey = id;
						await target.put(id, "existing object");
						return null;
					};
				const member = Reflect.get(target, key);
				return typeof member === "function" ? member.bind(target) : member;
			},
		});
		expect(
			(
				await importVisualImage(
					{ ...f.ctx, env: { ...f.ctx.env, CONCEPT_MEDIA: collision } },
					args,
				)
			).status,
		).toBe("failed");
		expect(await (await env.CONCEPT_MEDIA.get(collisionKey))!.text()).toBe(
			"existing object",
		);
		const next = await f.approve((await f.prepare()).id);
		const done = await importVisualImage(f.ctx, importArgs(next.id));
		expect(done.status).toBe("completed");
		const failsDelete = new Proxy(env.CONCEPT_MEDIA, {
			get(target, key) {
				if (key === "delete")
					return async () => {
						throw Error("Storage unavailable");
					};
				const member = Reflect.get(target, key);
				return typeof member === "function" ? member.bind(target) : member;
			},
		});
		await env.DB.prepare(
			"update concept_images set deleted_at=?,deleted_by_user_id=uploaded_by_user_id where id=?",
		)
			.bind(Date.now(), f.base.id)
			.run();
		await cleanupVisualRuns(env.DB, failsDelete, "mcp-collection-a");
		expect(
			await env.DB.prepare(
				"select object_deleted_at from visual_runs where id=?",
			)
				.bind(next.id)
				.first("object_deleted_at"),
		).toBeNull();
		await cleanupVisualRuns(env.DB, env.CONCEPT_MEDIA, "mcp-collection-a");
		expect(
			await env.DB.prepare(
				"select object_deleted_at from visual_runs where id=?",
			)
				.bind(next.id)
				.first("object_deleted_at"),
		).toBeTypeOf("number");
	});
	it("fails closed on a file whose bytes are not the declared image type", async () => {
		const f = await visualFixture();
		const run = await f.approve((await f.prepare()).id);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("not a PNG", { headers: { "content-type": "image/png" } }),
		);
		const result = await importVisualImage(f.ctx, importArgs(run.id));
		expect(result).toMatchObject({
			status: "failed",
			errorCode: "INVALID_MEDIA",
			outputImageId: null,
		});
		expect((await readConceptMedia(f.mediaInput)).images).toHaveLength(1);
	});
});

describe("private assistant write actions", () => {
	it("reads floor-plan notes without files, edits routinely, and requires fresh approval to delete", async () => {
		const connected = await connect(owner, true);
		const collectionId = "mcp-collection-a";
		const planId = "mcp-floor-plan";
		const key = "floor-plans/mcp-private-key";
		await env.CONCEPT_MEDIA.put(key, "%PDF-private-file-bytes");
		await env.DB.prepare("insert into floor_plans(id,collection_id,title,notes,object_key,content_type,byte_size,uploaded_by_user_id,status) values(?,?,'Living room','4 × 5 m, estimate',?,'application/pdf',23,?,'ready')").bind(planId, collectionId, key, owner).run();
		const read = await call(connected.access_token, "read_floor_plans", { collectionId });
		expect(read.body.result?.isError, read.text).not.toBe(true);
		expect(read.text).toContain("4 × 5 m, estimate");
		for (const secret of [key, "contentUrl", "%PDF-private-file-bytes"]) expect(read.text).not.toContain(secret);
		const foreign = await call(connected.access_token, "read_floor_plans", { collectionId: "mcp-collection-b" });
		expect(foreign.body.result?.isError).toBe(true);
		const readOnly = await connect();
		expect((await writeCall(readOnly.access_token, "update_floor_plan", { collectionId, planId, value: { title: "Living room", notes: "Door 82 cm, measured" } })).response.body.result?.isError).toBe(true);
		const edited = await writeCall(connected.access_token, "update_floor_plan", { collectionId, planId, value: { title: "Living room", notes: "Door 82 cm, measured" } });
		expect(edited.receipt?.status, edited.response.text).toBe("succeeded");
		expect(edited.receipt?.result).toMatchObject({ notes: "Door 82 cm, measured" });
		const stale = await writeCall(connected.access_token, "delete_floor_plan", { collectionId, planId });
		expect(stale.receipt?.status).toBe("pending");
		await writeCall(connected.access_token, "update_floor_plan", { collectionId, planId, value: { title: "Living room", notes: "Door 84 cm, corrected" } });
		expect((await approveAction(stale.receipt!.id)).status).toBe(409);
		expect(await env.CONCEPT_MEDIA.head(key)).not.toBeNull();
		const denied = await writeCall(connected.access_token, "delete_floor_plan", { collectionId, planId });
		expect(await (await approveAction(denied.receipt!.id, false)).json()).toMatchObject({ status: "denied" });
		expect(await env.CONCEPT_MEDIA.head(key)).not.toBeNull();
		const operationId = crypto.randomUUID();
		const deletion = await writeCall(connected.access_token, "delete_floor_plan", { collectionId, planId }, operationId);
		expect(deletion.receipt?.status).toBe("pending");
		expect(await (await approveAction(deletion.receipt!.id)).json()).toMatchObject({ status: "succeeded" });
		expect(await env.CONCEPT_MEDIA.head(key)).toBeNull();
		expect(await env.DB.prepare("select status, notes from floor_plans where id=?").bind(planId).first()).toEqual({ status: "deleted", notes: null });
		const replay = await writeCall(connected.access_token, "delete_floor_plan", { collectionId, planId }, operationId);
		expect(replay.receipt?.status).toBe("succeeded");
		expect((await call(connected.access_token, "read_action_receipt", { actionId: deletion.receipt!.id })).body.result?.isError).not.toBe(true);
	});
	it("keeps old read-only grants read-only and never creates an action row", async () => {
		const connected = await connect();
		const attempted = await writeCall(connected.access_token, "create_item", {
			collectionId: "mcp-collection-a",
			value: { title: "Must not exist" },
		});
		expect(attempted.response.body.result?.isError).toBe(true);
		expect(attempted.response.text).toContain("insufficient_scope");
		expect(
			await env.DB.prepare("select count(*) as total from mcp_actions").first(
				"total",
			),
		).toBe(0);
		const status = await request("/api/connectors", undefined, owner);
		expect(await status.json()).toMatchObject({
			connections: [{ allowWrites: false }],
		});
	});
	it("creates, edits and restores records with write consent, including exact concurrent replay", async () => {
		const connected = await connect(owner, true);
		const operationId = crypto.randomUUID();
		const args = {
			collectionId: "mcp-collection-a",
			value: { title: "Reading chair", quantityNeeded: 2 },
		};
		const results = await Promise.all([
			writeCall(connected.access_token, "create_item", args, operationId),
			writeCall(connected.access_token, "create_item", args, operationId),
		]);
		expect(results.map((r) => r.receipt?.status)).toContain("succeeded");
		const row = await env.DB.prepare(
			"select id,quantity_needed from items where title='Reading chair'",
		).first<{ id: string; quantity_needed: number }>();
		expect(row?.quantity_needed).toBe(2);
		expect(
			await env.DB.prepare(
				"select count(*) as total from items where title='Reading chair'",
			).first("total"),
		).toBe(1);
		const replay = await writeCall(
			connected.access_token,
			"create_item",
			args,
			operationId,
		);
		expect(replay.receipt?.status).toBe("succeeded");
		const edited = await writeCall(connected.access_token, "update_item", {
			itemId: row?.id,
			value: { title: "Oak reading chair", quantityNeeded: 3 },
		});
		expect(edited.receipt?.status, edited.response.text).toBe("succeeded");
		const different = await writeCall(
			connected.access_token,
			"create_item",
			{ ...args, value: { title: "Another chair" } },
			operationId,
		);
		expect(different.response.body.result?.isError).toBe(true);
		expect(different.response.text).toContain("different inputs");
		const status = await request("/api/connectors", undefined, owner);
		expect(await status.json()).toMatchObject({
			connections: [{ allowWrites: true }],
		});
	});
	it("does not let write scopes override roles, collection boundaries or validated fields", async () => {
		const connected = await connect(viewer, true);
		const own = await writeCall(connected.access_token, "create_item", {
			collectionId: "mcp-collection-a",
			value: { title: "Viewer insertion" },
		});
		expect(own.receipt?.status, own.response.text).toBe("failed");
		const foreign = await writeCall(connected.access_token, "create_item", {
			collectionId: "mcp-collection-b",
			value: { title: "Foreign insertion" },
		});
		expect(foreign.response.body.result?.isError).toBe(true);
		const privilege = await writeCall(connected.access_token, "create_item", {
			collectionId: "mcp-collection-a",
			userId: owner,
			value: { title: "Actor spoof" },
		});
		expect(
			privilege.response.body.result?.isError ?? privilege.response.body.error,
		).toBeTruthy();
		expect(
			await env.DB.prepare(
				"select count(*) as total from items where title in ('Viewer insertion','Foreign insertion','Actor spoof')",
			).first("total"),
		).toBe(0);
	});
	it("requires a browser approval for archive, rejects boolean bypasses and applies exactly once", async () => {
		const connected = await connect(owner, true);
		const pending = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		expect(pending.receipt?.status, pending.response.text).toBe("pending");
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).toBeNull();
		const id = pending.receipt!.id;
		expect(pending.receipt?.approvalUrl).toBe(
			`${origin}/connectors/actions/${id}`,
		);
		expect((await approveAction(id, true, other)).status).toBe(404);
		expect(
			(
				await request(`/api/connectors/actions/${id}/decision`, {
					...post({ approve: true }),
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${connected.access_token}`,
					},
				})
			).status,
		).toBe(401);
		expect(
			(
				await request(
					`/api/connectors/actions/${id}/decision`,
					post({ approve: true, arguments: { itemId: "mcp-item-b" } }),
					owner,
				)
			).status,
		).toBe(400);
		const bad = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
			confirmed: true,
		});
		expect(
			bad.response.body.result?.isError ?? bad.response.body.error,
		).toBeTruthy();
		const review = await request(
			`/api/connectors/actions/${id}`,
			undefined,
			owner,
		);
		expect(await review.json()).toMatchObject({
			canApprove: true,
			target: "Item a",
			arguments: { itemId: "mcp-item-a" },
		});
		expect((await approveAction(id)).status).toBe(200);
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).not.toBeNull();
		expect(await (await approveAction(id)).json()).toMatchObject({
			status: "succeeded",
		});
		const restored = await writeCall(connected.access_token, "restore_item", {
			itemId: "mcp-item-a",
		});
		expect(restored.receipt?.status, restored.response.text).toBe("succeeded");
	});
	it("binds approval to the exact target version and preserves a concurrent user's edit", async () => {
		const connected = await connect(owner, true);
		const pending = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await env.DB.prepare(
			"update items set title='Changed by user',updated_at=updated_at+1 where id='mcp-item-a'",
		).run();
		expect((await approveAction(pending.receipt!.id)).status).toBe(409);
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).toBeNull();
		expect(
			await (
				await request(
					`/api/connectors/actions/${pending.receipt!.id}`,
					undefined,
					owner,
				)
			).json(),
		).toMatchObject({ canApprove: false, receipt: { status: "failed" } });
	});
	it("honors rejection and expiry without applying the mutation", async () => {
		const connected = await connect(owner, true);
		const denied = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		expect(
			await (await approveAction(denied.receipt!.id, false)).json(),
		).toMatchObject({ status: "denied" });
		expect(
			await (await approveAction(denied.receipt!.id, true)).json(),
		).toMatchObject({ status: "denied" });
		const expired = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await env.DB.prepare("update mcp_actions set expires_at=? where id=?")
			.bind(Date.now() - 1, expired.receipt!.id)
			.run();
		expect(
			await (await approveAction(expired.receipt!.id)).json(),
		).toMatchObject({ status: "expired" });
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).toBeNull();
	});
	it("invalidates pending actions on token revocation, disconnect and logout", async () => {
		const connected = await connect(owner, true);
		const pending = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await env.DB.prepare(
			"update oauth_access_token set revoked=? where client_id=?",
		)
			.bind(Date.now(), connected.clientId)
			.run();
		expect((await approveAction(pending.receipt!.id)).status).toBe(403);
		const fresh = await connect(owner, true);
		const disconnected = await writeCall(fresh.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await request(
			`/api/connectors/${fresh.clientId}`,
			{ method: "DELETE" },
			owner,
		);
		expect((await approveAction(disconnected.receipt!.id)).status).toBe(403);
		const last = await connect(owner, true);
		const loggedOut = await writeCall(last.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await env.DB.prepare("delete from session where user_id=?")
			.bind(owner)
			.run();
		expect((await approveAction(loggedOut.receipt!.id)).status).toBe(401);
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).toBeNull();
	});
	it("does not return private receipts across clients or after membership is revoked", async () => {
		const connected = await connect(viewer, true);
		await env.DB.prepare(
			"update collection_memberships set role='editor' where id='mcp-scope'",
		).run();
		const changed = await writeCall(connected.access_token, "create_item", {
			collectionId: "mcp-collection-a",
			value: { title: "Private receipt text" },
		});
		expect(changed.receipt?.status).toBe("succeeded");
		const second = await connect(viewer, true);
		const crossClient = await call(second.access_token, "read_action_receipt", {
			actionId: changed.receipt!.id,
		});
		expect(crossClient.body.result?.isError).toBe(true);
		await env.DB.prepare(
			"delete from collection_memberships where id='mcp-scope'",
		).run();
		const lost = await call(connected.access_token, "read_action_receipt", {
			actionId: changed.receipt!.id,
		});
		expect(lost.body.result?.isError).toBe(true);
		expect(lost.text).not.toContain("Private receipt text");
	});
	it("requires confirmation for decisions while routine progress can apply immediately", async () => {
		const connected = await connect(owner, true);
		const researching = await writeCall(
			connected.access_token,
			"change_item_status",
			{ itemId: "mcp-item-a", value: { status: "researching" } },
		);
		expect(researching.receipt?.status, researching.response.text).toBe(
			"succeeded",
		);
		const decided = await writeCall(
			connected.access_token,
			"change_item_status",
			{ itemId: "mcp-item-a", value: { status: "decided" } },
		);
		expect(decided.receipt?.status).toBe("pending");
		await approveAction(decided.receipt!.id);
		const reverse = await writeCall(
			connected.access_token,
			"change_item_status",
			{ itemId: "mcp-item-a", value: { status: "researching" } },
		);
		expect(reverse.receipt?.status, reverse.response.text).toBe("pending");
	});
	it("requires approval for sharing and preserves the last-owner boundary", async () => {
		const connected = await connect(owner, true);
		const pending = await writeCall(
			connected.access_token,
			"create_invitation",
			{
				workspaceId: "mcp-workspace-a",
				value: {
					role: "viewer",
					scope: { type: "workspace" },
					expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
					invitedEmail: "friend@example.test",
					restrictToEmail: true,
				},
			},
		);
		expect(pending.receipt?.status, pending.response.text).toBe("pending");
		expect(
			await env.DB.prepare(
				"select count(*) as total from invitations where workspace_id='mcp-workspace-a'",
			).first("total"),
		).toBe(0);
		const result = await approveAction(pending.receipt!.id);
		expect(await result.json()).toMatchObject({
			status: "succeeded",
			result: { invitation: { role: "viewer", emailRestrictionEnabled: true } },
		});
		const lastOwner = await writeCall(
			connected.access_token,
			"remove_workspace_member",
			{ workspaceId: "mcp-workspace-a", memberId: owner },
		);
		expect(lastOwner.receipt?.status).toBe("pending");
		expect(
			await (await approveAction(lastOwner.receipt!.id)).json(),
		).toMatchObject({ status: "failed" });
		expect(
			await env.DB.prepare(
				"select role from workspace_memberships where id='mcp-membership-a'",
			).first("role"),
		).toBe("owner");
	});
	it("does not replay an interrupted operation or leak its data into metadata", async () => {
		const connected = await connect(owner, true);
		const operationId = crypto.randomUUID();
		const args = {
			collectionId: "mcp-collection-a",
			value: { title: "Private interrupted item" },
		};
		const first = await writeCall(
			connected.access_token,
			"create_item",
			args,
			operationId,
		);
		await env.DB.prepare(
			"update mcp_actions set status='running',started_at=?,result_json=null where id=?",
		)
			.bind(Date.now() - 6 * 60_000, first.receipt!.id)
			.run();
		const replay = await writeCall(
			connected.access_token,
			"create_item",
			args,
			operationId,
		);
		expect(replay.receipt?.status).toBe("unknown");
		expect(
			await env.DB.prepare(
				"select count(*) as total from items where title='Private interrupted item'",
			).first("total"),
		).toBe(1);
		const discovery = await rpc(connected.access_token, "tools/list");
		expect(discovery.text).not.toContain("Private interrupted item");
	});
	it("shows a bounded reconnect destination without reflecting untrusted error details", async () => {
		const response = await request(
			"/api/auth/error?error=invalid_client&error_description=secret-value&redirect_uri=https://evil.example",
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"/connectors/error?code=invalid_client",
		);
		expect(await response.text()).not.toContain("secret-value");
		expect(
			(await request("/api/auth/error?error=%3Cscript%3E")).headers.get(
				"location",
			),
		).toBe("/connectors/error?code=connection_failed");
	});
});

describe("assistant action feature coverage", () => {
	it("creates a priced candidate and requires separate exact approval for selection and purchase", async () => {
		const connected = await connect(owner, true);
		const token = connected.access_token;
		const itemId = "mcp-item-a";
		const candidate = await writeCall(token, "create_candidate", {
			itemId,
			value: {
				product: {
					kind: "new",
					value: {
						title: "Oak chair",
						brand: null,
						model: null,
						category: "Furniture",
						attributes: [],
					},
				},
				plannedPurchaseQuantity: 2,
				notes: null,
				rank: null,
			},
		});
		expect(candidate.receipt?.status, candidate.response.text).toBe(
			"succeeded",
		);
		const candidateId = await env.DB.prepare(
			"select id from item_candidates where item_id=?",
		)
			.bind(itemId)
			.first<string>("id");
		expect(
			(
				await writeCall(token, "update_product", {
					itemId,
					candidateId,
					value: { brand: "Example" },
				})
			).receipt?.status,
		).toBe("succeeded");
		expect(
			(
				await writeCall(token, "create_merchant", {
					itemId,
					value: {
						name: "Example shop",
						salesChannel: "online",
						websiteUrl: "https://shop.example",
						notes: null,
					},
				})
			).receipt?.status,
		).toBe("succeeded");
		const merchantId = await env.DB.prepare(
			"select id from merchants where name='Example shop'",
		).first<string>("id");
		const facts = {
			priceKind: "exact",
			unitPriceMinor: 12900,
			currency: "EUR",
			shippingMinor: 500,
			shippingBasis: "per_line",
			availabilityState: "available",
			availabilityChannel: "online",
			availabilityLocation: null,
			availabilityVariant: null,
			availabilityNote: null,
		};
		const offer = await writeCall(token, "create_offer", {
			itemId,
			candidateId,
			value: {
				merchantId,
				sourceUrl: "https://shop.example/chair",
				locale: "nl-NL",
				facts,
			},
		});
		expect(offer.receipt?.status, offer.response.text).toBe("succeeded");
		const offerId = await env.DB.prepare(
			"select id from offers where merchant_id=?",
		)
			.bind(merchantId)
			.first<string>("id");
		const selected = await writeCall(token, "set_planned_selection", {
			itemId,
			value: { candidateId, offerId, plannedPurchaseQuantity: 2 },
		});
		expect(selected.receipt?.status).toBe("pending");
		expect(
			await (await approveAction(selected.receipt!.id)).json(),
		).toMatchObject({ status: "succeeded" });
		const purchase = await writeCall(token, "record_purchase", {
			itemId,
			value: {
				candidateId,
				offerId,
				purchasedQuantity: 2,
				unitPriceMinor: 12900,
				currency: "EUR",
				shippingMinor: 500,
				shippingBasis: "per_line",
				note: "Receipt already paid",
			},
		});
		expect(purchase.receipt?.status).toBe("pending");
		const review = await request(
			`/api/connectors/actions/${purchase.receipt!.id}`,
			undefined,
			owner,
		);
		expect(await review.json()).toMatchObject({
			target: "Item a · Oak chair · Example shop",
			arguments: { value: { unitPriceMinor: 12900, purchasedQuantity: 2 } },
			canApprove: true,
		});
		expect(
			await env.DB.prepare(
				"select count(*) as total from decision_events where kind='purchase_recorded'",
			).first("total"),
		).toBe(0);
		expect(
			await (await approveAction(purchase.receipt!.id)).json(),
		).toMatchObject({ status: "succeeded" });
		await approveAction(purchase.receipt!.id);
		expect(
			await env.DB.prepare(
				"select count(*) as total from decision_events where kind='purchase_recorded'",
			).first("total"),
		).toBe(1);
		for (const [name, args] of [
			["read_item_catalog", { itemId }],
			["read_item_workflow", { itemId }],
			["read_collection_budget", { collectionId: "mcp-collection-a" }],
		] as const) {
			const result = await call(token, name, args);
			expect(result.body.result?.isError, result.text).not.toBe(true);
		}
	});
	it("saves brief/concept text, protects image cleanup from viewers and supports collection-only sharing owners", async () => {
		const connected = await connect(owner, true);
		const collectionId = "mcp-collection-a";
		const brief = {
			title: "Calm room",
			description: null,
			keywords: [],
			materials: ["Oak"],
			preferredBrands: [],
			intendedUse: null,
			requirements: "Wide walkways",
			thingsToAvoid: null,
			referenceUrls: [],
			budget: { minor: 100000, currency: "EUR" },
			colorPreference: { core: [], supporting: [] },
		};
		expect(
			(
				await writeCall(connected.access_token, "save_collection_brief", {
					collectionId,
					value: brief,
				})
			).receipt?.status,
		).toBe("succeeded");
		const concept = await writeCall(connected.access_token, "save_concept", {
			collectionId,
			value: { title: "Warm wood", narrative: "Soft textures" },
		});
		expect(concept.receipt?.status, concept.response.text).toBe("succeeded");
		const conceptId = await env.DB.prepare(
			"select id from concepts where collection_id=?",
		)
			.bind(collectionId)
			.first<string>("id");
		await env.DB.prepare(
			`insert into concept_images(id,concept_id,role,object_key,content_type,original_filename,byte_size,width,height,sha256,uploaded_by_user_id) values('mcp-photo',?,'reference','test-reference','image/webp','reference.webp',8,1,1,?,?)`,
		)
			.bind(conceptId, "a".repeat(64), owner)
			.run();
		const readOnly = await connect(viewer, true);
		const deletion = await writeCall(readOnly.access_token, "remove_concept", {
			collectionId,
		});
		expect(deletion.receipt?.status, deletion.response.text).toBe("pending");
		expect(
			await (await approveAction(deletion.receipt!.id, true, viewer)).json(),
		).toMatchObject({ status: "failed" });
		expect(
			await env.DB.prepare(
				"select deleted_at from concept_images where id='mcp-photo'",
			).first("deleted_at"),
		).toBeNull();
		for (const name of [
			"read_collection_brief",
			"read_concept",
			"read_concept_images",
		]) {
			const result = await call(connected.access_token, name, { collectionId });
			expect(result.body.result?.isError, result.text).not.toBe(true);
		}
		const secondCollection = await writeCall(
			connected.access_token,
			"create_collection",
			{
				workspaceId: "mcp-workspace-a",
				value: { name: "Other room", description: null },
			},
		);
		const secondCollectionId = z
			.object({ id: z.string() })
			.parse(secondCollection.receipt?.result).id;
		const foreign = await writeCall(
			connected.access_token,
			"update_concept_image",
			{
				collectionId: secondCollectionId,
				imageId: "mcp-photo",
				value: { caption: "Wrong parent" },
			},
		);
		expect(foreign.receipt?.status).toBe("failed");
		await env.DB.prepare(
			"update collection_memberships set role='owner' where id='mcp-scope'",
		).run();
		const invitation = await writeCall(
			readOnly.access_token,
			"create_invitation",
			{
				workspaceId: "mcp-workspace-a",
				value: {
					role: "viewer",
					scope: { type: "collections", collectionIds: [collectionId] },
					expiresAt: new Date(Date.now() + 86400000).toISOString(),
					invitedEmail: null,
					restrictToEmail: false,
				},
			},
		);
		expect(invitation.receipt?.status, invitation.response.text).toBe(
			"pending",
		);
		expect(
			await (await approveAction(invitation.receipt!.id, true, viewer)).json(),
		).toMatchObject({ status: "succeeded" });
	});
	it("keeps comment deletion pending and invalidates it if the comment changes", async () => {
		const connected = await connect(owner, true);
		const itemId = "mcp-item-a";
		const created = await writeCall(connected.access_token, "create_comment", {
			itemId,
			value: { body: "First comment" },
		});
		expect(created.receipt?.status, created.response.text).toBe("succeeded");
		const discussion = await call(
			connected.access_token,
			"read_item_discussion",
			{ itemId },
		);
		const data = z
			.object({ itemComments: z.array(z.object({ id: z.string() })) })
			.parse(discussion.body.result?.structuredContent);
		const commentId = data.itemComments[0].id;
		const removal = await writeCall(connected.access_token, "remove_comment", {
			itemId,
			commentId,
		});
		expect(removal.receipt?.status).toBe("pending");
		expect(
			(
				await writeCall(connected.access_token, "update_comment", {
					itemId,
					commentId,
					value: { body: "Revised comment" },
				})
			).receipt?.status,
		).toBe("succeeded");
		expect((await approveAction(removal.receipt!.id)).status).toBe(409);
		expect(
			(await call(connected.access_token, "read_item_discussion", { itemId }))
				.text,
		).toContain("Revised comment");
	});
	it("prepares research only for an explicit provider and never dispatches before approval", async () => {
		const connected = await connect(owner, true);
		const args = {
			collectionId: "mcp-collection-a",
			value: {
				query: "Reading lamps",
				itemId: null,
				constraints: {
					maxUnitPriceMinor: 5000,
					currency: "EUR",
					preferredDomains: [],
					requiredTerms: [],
					excludedTerms: [],
				},
			},
		};
		const missing = await writeCall(
			connected.access_token,
			"start_research",
			args,
		);
		expect(
			missing.response.body.result?.isError ?? missing.response.body.error,
		).toBeTruthy();
		const explicit = await writeCall(connected.access_token, "start_research", {
			...args,
			value: { ...args.value, provider: "local-codex-v1" },
		});
		expect(explicit.receipt?.status, explicit.response.text).toBe("pending");
		await approveAction(explicit.receipt!.id, false);
		expect(
			await env.DB.prepare(
				"select count(*) as total from research_requests",
			).first("total"),
		).toBe(0);
	});
	it("stages and reads research drafts without importing them automatically", async () => {
		const connected = await connect(owner, true);
		const collectionId = "mcp-collection-a";
		const created = await writeCall(
			connected.access_token,
			"create_import_draft",
			{
				collectionId,
				value: {
					format: "markdown",
					rawInput:
						"| Product | Price |\n| --- | --- |\n| [Oak chair](https://shop.example/chair) | €129.00 |",
				},
			},
		);
		expect(created.receipt?.status, created.response.text).toBe("succeeded");
		const draftId = await env.DB.prepare(
			"select id from import_drafts where collection_id=?",
		)
			.bind(collectionId)
			.first<string>("id");
		for (const [name, args] of [
			["list_import_drafts", { collectionId }],
			["read_import_draft", { collectionId, draftId }],
		] as const) {
			const result = await call(connected.access_token, name, args);
			expect(result.body.result?.isError, result.text).not.toBe(true);
		}
		const discarded = await writeCall(
			connected.access_token,
			"discard_import_draft",
			{ collectionId, draftId },
		);
		expect(discarded.receipt?.status).toBe("pending");
		expect(
			await (await approveAction(discarded.receipt!.id)).json(),
		).toMatchObject({ status: "succeeded" });
	});
	it("masks expired receipt details on every replay path and keeps the operation tombstone", async () => {
		const connected = await connect(owner, true);
		const operationId = crypto.randomUUID();
		const args = {
			collectionId: "mcp-collection-a",
			value: { title: "Retention sample" },
		};
		const first = await writeCall(
			connected.access_token,
			"create_item",
			args,
			operationId,
		);
		await env.DB.prepare("update mcp_actions set created_at=? where id=?")
			.bind(Date.now() - 25 * 3600000, first.receipt!.id)
			.run();
		const replay = await writeCall(
			connected.access_token,
			"create_item",
			args,
			operationId,
		);
		expect(replay.receipt?.result).toBeNull();
		expect(replay.receipt?.status).toBe("succeeded");
		expect(
			(
				await request(
					`/api/connectors/actions/${first.receipt!.id}`,
					undefined,
					owner,
				)
			).status,
		).toBe(404);
		await writeCall(connected.access_token, "update_item", {
			itemId: "mcp-item-a",
			value: { title: "Retention trigger" },
		});
		expect(
			await env.DB.prepare(
				"select arguments_json,target_json,result_json from mcp_actions where id=?",
			)
				.bind(first.receipt!.id)
				.first(),
		).toEqual({ arguments_json: null, target_json: null, result_json: null });
		expect(
			await env.DB.prepare(
				"select count(*) as total from items where title='Retention sample'",
			).first("total"),
		).toBe(1);
	});
});

describe("assistant grant and receipt rechecks", () => {
	it("stops approval if write scope is removed from the registered client", async () => {
		const connected = await connect(owner, true);
		const pending = await writeCall(connected.access_token, "archive_item", {
			itemId: "mcp-item-a",
		});
		await env.DB.prepare("update oauth_client set scopes=? where client_id=?")
			.bind(
				JSON.stringify(JSON.stringify(["wantkit:read", "offline_access"])),
				connected.clientId,
			)
			.run();
		expect((await approveAction(pending.receipt!.id)).status).toBe(403);
		expect(
			await env.DB.prepare(
				"select archived_at from items where id='mcp-item-a'",
			).first("archived_at"),
		).toBeNull();
	});
	it("does not expose a created workspace receipt after its creator loses access", async () => {
		const connected = await connect(owner, true);
		const operationId = crypto.randomUUID();
		const args = { value: { name: "Private transferred workspace" } };
		const created = await writeCall(
			connected.access_token,
			"create_workspace",
			args,
			operationId,
		);
		expect(created.receipt?.status, created.response.text).toBe("succeeded");
		const workspaceId = z
			.object({ id: z.string() })
			.parse(created.receipt?.result).id;
		await env.DB.prepare(
			"delete from workspace_memberships where workspace_id=? and user_id=?",
		)
			.bind(workspaceId, owner)
			.run();
		const receipt = await call(connected.access_token, "read_action_receipt", {
			actionId: created.receipt!.id,
		});
		expect(receipt.body.result?.isError).toBe(true);
		expect(receipt.text).not.toContain("Private transferred workspace");
		const replay = await writeCall(
			connected.access_token,
			"create_workspace",
			args,
			operationId,
		);
		expect(replay.response.body.result?.isError).toBe(true);
		expect((await approveAction(created.receipt!.id)).status).toBe(404);
	});
});
