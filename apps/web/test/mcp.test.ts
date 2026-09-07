import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import app from "../src/worker";
import { connectorInputSchema } from "../src/worker/mcp-auth-service";

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
async function rpc(token: string, method: string, params?: unknown) {
	const response = await request("/api/mcp", {
		...post({ jsonrpc: "2.0", id: 1, method, params }),
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${token}`,
			"mcp-protocol-version": "2025-11-25",
		},
	});
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
