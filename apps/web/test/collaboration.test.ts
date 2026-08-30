import { env, exports } from "cloudflare:workers";
import { hasCapability, type MembershipRole } from "@kharidyar/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { loadCollectionAccess } from "../src/worker/authorization";
import {
	invitationAcceptanceRateLimit,
	invitationPreviewRateLimit,
} from "../src/worker/collaboration-rate-limit";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceA = "collab-workspace-a";
const workspaceB = "collab-workspace-b";
const collectionA1 = "collab-collection-a1";
const collectionA2 = "collab-collection-a2";
const collectionB1 = "collab-collection-b1";

const users = {
	owner: "collab-owner",
	otherOwner: "collab-other-owner",
	collectionOwner: "collab-collection-owner",
	viewer: "collab-viewer",
	commenter: "collab-commenter",
	contributor: "collab-contributor",
	editor: "collab-editor",
	workspaceMember: "collab-workspace-member",
	secondOwner: "collab-second-owner",
	invitee: "collab-invitee",
	mismatch: "collab-mismatch",
	unverified: "collab-unverified",
} as const;

type TestUserId = (typeof users)[keyof typeof users];

const userDetails: readonly {
	id: TestUserId;
	email: string;
	emailVerified: boolean;
	name: string;
}[] = [
	{
		id: users.owner,
		email: "owner@example.com",
		emailVerified: true,
		name: "Workspace Owner",
	},
	{
		id: users.otherOwner,
		email: "other-owner@example.com",
		emailVerified: true,
		name: "Other Owner",
	},
	{
		id: users.collectionOwner,
		email: "collection-owner@example.com",
		emailVerified: true,
		name: "Collection Owner",
	},
	{
		id: users.viewer,
		email: "viewer@example.com",
		emailVerified: true,
		name: "Viewer",
	},
	{
		id: users.commenter,
		email: "commenter@example.com",
		emailVerified: true,
		name: "Commenter",
	},
	{
		id: users.contributor,
		email: "contributor@example.com",
		emailVerified: true,
		name: "Contributor",
	},
	{
		id: users.editor,
		email: "editor@example.com",
		emailVerified: true,
		name: "Editor",
	},
	{
		id: users.workspaceMember,
		email: "member@example.com",
		emailVerified: true,
		name: "Workspace Member",
	},
	{
		id: users.secondOwner,
		email: "second-owner@example.com",
		emailVerified: true,
		name: "Second Owner",
	},
	{
		id: users.invitee,
		email: "invitee@example.com",
		emailVerified: true,
		name: "Invitee",
	},
	{
		id: users.mismatch,
		email: "mismatch@example.com",
		emailVerified: true,
		name: "Mismatch",
	},
	{
		id: users.unverified,
		email: "unverified@example.com",
		emailVerified: false,
		name: "Unverified",
	},
];

async function signedSessionCookie(userId: TestUserId): Promise<string> {
	const token = `session-token-${userId}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(authSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	const encodedSignature = btoa(
		String.fromCharCode(...new Uint8Array(signature)),
	);
	return `better-auth.session_token=${token}.${encodedSignature}`;
}

async function apiRequest(
	path: string,
	options?: {
		body?: unknown;
		clientIp?: string;
		fetchSite?: string;
		method?: string;
		origin?: string | null;
		userId?: TestUserId;
	},
): Promise<Response> {
	const headers = new Headers();
	if (options?.body !== undefined) {
		headers.set("content-type", "application/json");
	}
	if (options?.origin !== null) {
		headers.set("origin", options?.origin ?? "http://example.com");
	}
	if (options?.clientIp !== undefined) {
		headers.set("cf-connecting-ip", options.clientIp);
	}
	if (options?.fetchSite !== undefined) {
		headers.set("sec-fetch-site", options.fetchSite);
	}
	if (options?.userId !== undefined) {
		headers.set("cookie", await signedSessionCookie(options.userId));
	}

	return exports.default.fetch(
		new Request(`http://example.com${path}`, {
			body:
				options?.body === undefined ? undefined : JSON.stringify(options.body),
			headers,
			method: options?.method ?? "GET",
		}),
	);
}

async function resetFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("delete from workspaces where id in (?, ?)").bind(
			workspaceA,
			workspaceB,
		),
		env.DB.prepare("delete from user where id like 'collab-%'"),
		env.DB.prepare("delete from collaboration_rate_limits"),
	]);

	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	for (const person of userDetails) {
		statements.push(
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?, ?, ?, ?)",
			).bind(
				person.id,
				person.name,
				person.email,
				person.emailVerified ? 1 : 0,
			),
			env.DB.prepare(
				"insert into session (id, expires_at, token, updated_at, user_id) values (?, ?, ?, ?, ?)",
			).bind(
				`session-${person.id}`,
				now + 60 * 60 * 1_000,
				`session-token-${person.id}`,
				now,
				person.id,
			),
		);
	}

	statements.push(
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id) values (?, ?, ?)",
		).bind(workspaceA, "Home A", users.owner),
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id) values (?, ?, ?)",
		).bind(workspaceB, "Home B", users.otherOwner),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?, ?, ?, ?)",
		).bind(collectionA1, workspaceA, "Bedroom", users.owner),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?, ?, ?, ?)",
		).bind(collectionA2, workspaceA, "Living room", users.owner),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?, ?, ?, ?)",
		).bind(collectionB1, workspaceB, "Other home", users.otherOwner),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role) values (?, ?, ?, ?)",
		).bind("membership-owner-a", workspaceA, users.owner, "owner"),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role) values (?, ?, ?, ?)",
		).bind("membership-owner-b", workspaceB, users.otherOwner, "owner"),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role) values (?, ?, ?, ?)",
		).bind(
			"membership-workspace-member",
			workspaceA,
			users.workspaceMember,
			"viewer",
		),
	);

	const roleMembers: readonly [TestUserId, MembershipRole][] = [
		[users.viewer, "viewer"],
		[users.commenter, "commenter"],
		[users.contributor, "contributor"],
		[users.editor, "editor"],
		[users.collectionOwner, "owner"],
	];
	for (const [userId, role] of roleMembers) {
		statements.push(
			env.DB.prepare(
				"insert into collection_memberships (id, collection_id, user_id, role) values (?, ?, ?, ?)",
			).bind(`membership-${userId}`, collectionA1, userId, role),
		);
	}

	await env.DB.batch(statements);
}

async function createInvitation(input?: {
	invitedEmail?: string;
	restrictToEmail?: boolean;
	role?: MembershipRole;
	scope?:
		| { type: "workspace" }
		| { type: "collections"; collectionIds: readonly string[] };
	userId?: TestUserId;
}): Promise<{
	body: {
		invitation: {
			emailRestrictionEnabled: boolean;
			expiresAt: string;
			id: string;
			role: MembershipRole;
			scopeType: string;
			url: string;
		};
	};
	response: Response;
}> {
	const requestBody: Record<string, unknown> = {
		expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
		role: input?.role ?? "viewer",
		scope: input?.scope ?? { type: "workspace" },
	};
	if (input?.invitedEmail !== undefined) {
		requestBody.invitedEmail = input.invitedEmail;
	}
	if (input?.restrictToEmail !== undefined) {
		requestBody.restrictToEmail = input.restrictToEmail;
	}

	const response = await apiRequest(
		`/api/workspaces/${workspaceA}/invitations`,
		{
			body: requestBody,
			method: "POST",
			userId: input?.userId ?? users.owner,
		},
	);
	const body = await response.clone().json<{
		invitation: {
			emailRestrictionEnabled: boolean;
			expiresAt: string;
			id: string;
			role: MembershipRole;
			scopeType: string;
			url: string;
		};
	}>();
	return { body, response };
}

function rawTokenFrom(invitationUrl: string): string {
	const url = new URL(invitationUrl);
	expect(url.pathname).toBe("/invite");
	expect(url.search).toBe("");
	const token = new URLSearchParams(url.hash.slice(1)).get("token");
	expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
	return token!;
}

beforeEach(resetFixture);

describe("request and capability boundaries", () => {
	it("requires authentication and a trusted origin for mutations", async () => {
		const anonymous = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: { type: "workspace" },
				},
				method: "POST",
			},
		);
		expect(anonymous.status).toBe(401);

		const crossSite = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: { type: "workspace" },
				},
				method: "POST",
				origin: "https://attacker.example",
				userId: users.owner,
			},
		);
		expect(crossSite.status).toBe(403);

		const browserWithoutOrigin = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: { type: "workspace" },
				},
				fetchSite: "cross-site",
				method: "POST",
				origin: null,
				userId: users.owner,
			},
		);
		expect(browserWithoutOrigin.status).toBe(403);

		const nativeClient = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: { type: "workspace" },
				},
				method: "POST",
				origin: null,
				userId: users.owner,
			},
		);
		expect(nativeClient.status).toBe(201);
	});

	it("resolves every persisted role and keeps record_purchase Owner-only", async () => {
		const cases: readonly [TestUserId, boolean][] = [
			[users.viewer, false],
			[users.commenter, false],
			[users.contributor, false],
			[users.editor, false],
			[users.collectionOwner, true],
			[users.owner, true],
		];

		for (const [userId, expected] of cases) {
			const access = await loadCollectionAccess(env.DB, userId, collectionA1);
			expect(access).not.toBeNull();
			expect(
				hasCapability(access!.grants, access!.target, "record_purchase"),
			).toBe(expected);
		}
	});

	it("allows only Owners to invite and isolates Collection Owners from siblings", async () => {
		for (const userId of [
			users.viewer,
			users.commenter,
			users.contributor,
			users.editor,
		] as const) {
			const response = await apiRequest(
				`/api/workspaces/${workspaceA}/invitations`,
				{
					body: {
						expiresAt: new Date(Date.now() + 60_000).toISOString(),
						role: "viewer",
						scope: {
							type: "collections",
							collectionIds: [collectionA1],
						},
					},
					method: "POST",
					userId,
				},
			);
			expect(response.status).toBe(403);
		}

		const ownCollection = await createInvitation({
			scope: { type: "collections", collectionIds: [collectionA1] },
			userId: users.collectionOwner,
		});
		expect(ownCollection.response.status).toBe(201);

		const sibling = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: {
						type: "collections",
						collectionIds: [collectionA2],
					},
				},
				method: "POST",
				userId: users.collectionOwner,
			},
		);
		expect(sibling.status).toBe(404);
	});

	it("reserves Owner grants and removals for Workspace-scoped Owners", async () => {
		const allowedNonOwnerChange = await apiRequest(
			`/api/collections/${collectionA1}/members/${users.editor}`,
			{
				body: { role: "contributor" },
				method: "PATCH",
				userId: users.collectionOwner,
			},
		);
		expect(allowedNonOwnerChange.status).toBe(200);

		const deniedOwnerInvite = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "owner",
					scope: {
						type: "collections",
						collectionIds: [collectionA1],
					},
				},
				method: "POST",
				userId: users.collectionOwner,
			},
		);
		expect(deniedOwnerInvite.status).toBe(403);

		const allowedOwnerInvite = await createInvitation({ role: "owner" });
		expect(allowedOwnerInvite.response.status).toBe(201);

		const deniedRemoval = await apiRequest(
			`/api/collections/${collectionA1}/members/${users.collectionOwner}`,
			{ method: "DELETE", userId: users.collectionOwner },
		);
		expect(deniedRemoval.status).toBe(403);

		const allowedRemoval = await apiRequest(
			`/api/collections/${collectionA1}/members/${users.collectionOwner}`,
			{ body: { role: "editor" }, method: "PATCH", userId: users.owner },
		);
		expect(allowedRemoval.status).toBe(200);
	});

	it("keeps at least one Workspace-scoped Owner with an atomic condition", async () => {
		const lastOwner = await apiRequest(
			`/api/workspaces/${workspaceA}/members/${users.owner}`,
			{ method: "DELETE", userId: users.owner },
		);
		expect(lastOwner.status).toBe(409);

		const grantSecondOwner = await apiRequest(
			`/api/workspaces/${workspaceA}/members/${users.workspaceMember}`,
			{ body: { role: "owner" }, method: "PATCH", userId: users.owner },
		);
		expect(grantSecondOwner.status).toBe(200);

		const competingRemovals = await Promise.all([
			apiRequest(`/api/workspaces/${workspaceA}/members/${users.owner}`, {
				method: "DELETE",
				userId: users.owner,
			}),
			apiRequest(
				`/api/workspaces/${workspaceA}/members/${users.workspaceMember}`,
				{ method: "DELETE", userId: users.owner },
			),
		]);
		const removalStatuses = competingRemovals.map(({ status }) => status);
		expect(removalStatuses.filter((status) => status === 200)).toHaveLength(1);
		expect(
			removalStatuses.every((status) => [200, 404, 409].includes(status)),
		).toBe(true);
		const ownerCount = await env.DB.prepare(
			"select count(*) as count from workspace_memberships where workspace_id = ? and role = 'owner'",
		)
			.bind(workspaceA)
			.first<{ count: number }>();
		expect(ownerCount?.count).toBe(1);
	});

	it("applies Workspace grants to Collections created later", async () => {
		const newCollection = "collab-collection-created-later";
		await env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?, ?, ?, ?)",
		)
			.bind(newCollection, workspaceA, "New room", users.owner)
			.run();

		const invitation = await createInvitation({
			scope: { type: "collections", collectionIds: [newCollection] },
		});
		expect(invitation.response.status).toBe(201);
	});

	it("rejects cross-Workspace identifier substitution", async () => {
		const response = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
					role: "viewer",
					scope: {
						type: "collections",
						collectionIds: [collectionB1],
					},
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(response.status).toBe(404);
	});
});

describe("invitation creation and preview", () => {
	it("defaults an supplied email restriction on and permits an explicit opt-out", async () => {
		const restricted = await createInvitation({
			invitedEmail: "  INVITEE@EXAMPLE.COM ",
		});
		expect(restricted.response.status).toBe(201);
		expect(restricted.body.invitation.emailRestrictionEnabled).toBe(true);
		const restrictedStored = await env.DB.prepare(
			"select invited_email_normalized, email_restriction_enabled from invitations where id = ?",
		)
			.bind(restricted.body.invitation.id)
			.first<{
				email_restriction_enabled: number;
				invited_email_normalized: string | null;
			}>();
		expect(restrictedStored).toEqual({
			email_restriction_enabled: 1,
			invited_email_normalized: "invitee@example.com",
		});

		const open = await createInvitation({
			invitedEmail: "invitee@example.com",
			restrictToEmail: false,
		});
		expect(open.body.invitation.emailRestrictionEnabled).toBe(false);
		const openStored = await env.DB.prepare(
			"select invited_email_normalized, email_restriction_enabled from invitations where id = ?",
		)
			.bind(open.body.invitation.id)
			.first<{
				email_restriction_enabled: number;
				invited_email_normalized: string | null;
			}>();
		expect(openStored).toEqual({
			email_restriction_enabled: 0,
			invited_email_normalized: null,
		});
	});

	it("keeps the raw token out of storage and previews approved metadata only", async () => {
		const created = await createInvitation({
			invitedEmail: "invitee@example.com",
			role: "editor",
			scope: {
				type: "collections",
				collectionIds: [collectionA1, collectionA2],
			},
		});
		expect(created.response.headers.get("cache-control")).toBe("no-store");
		const token = rawTokenFrom(created.body.invitation.url);
		const stored = await env.DB.prepare(
			"select token_hash from invitations where id = ?",
		)
			.bind(created.body.invitation.id)
			.first<{ token_hash: string }>();
		expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/u);
		expect(stored?.token_hash).not.toContain(token);

		const preview = await apiRequest("/api/invitations/preview", {
			body: { token },
			clientIp: "203.0.113.10",
			method: "POST",
			origin: null,
		});
		expect(preview.status).toBe(200);
		expect(preview.headers.get("cache-control")).toBe("no-store");
		const body = await preview.json<{
			invitation: Record<string, unknown> & { scopes: unknown[] };
		}>();
		expect(body.invitation).toMatchObject({
			inviterDisplayName: "Workspace Owner",
			role: "editor",
			scopeType: "collections",
			scopes: [
				{ name: "Bedroom", type: "collection" },
				{ name: "Living room", type: "collection" },
			],
		});
		expect(Object.keys(body.invitation).sort()).toEqual([
			"expiresAt",
			"inviterDisplayName",
			"role",
			"scopeType",
			"scopes",
		]);
		expect(JSON.stringify(body)).not.toContain(workspaceA);
		expect(JSON.stringify(body)).not.toContain("invitee@example.com");
	});

	it("rate-limits unauthenticated previews without storing the client address", async () => {
		const created = await createInvitation();
		const token = rawTokenFrom(created.body.invitation.url);
		for (let index = 0; index < invitationPreviewRateLimit.limit; index += 1) {
			const response = await apiRequest("/api/invitations/preview", {
				body: { token },
				clientIp: "203.0.113.99",
				method: "POST",
				origin: null,
			});
			expect(response.status).toBe(200);
		}

		const limited = await apiRequest("/api/invitations/preview", {
			body: { token },
			clientIp: "203.0.113.99",
			method: "POST",
			origin: null,
		});
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toBeTruthy();
		const keys = await env.DB.prepare(
			"select key from collaboration_rate_limits",
		).all<{ key: string }>();
		expect(keys.results).toHaveLength(1);
		expect(keys.results[0]?.key).toMatch(/^[0-9a-f]{64}$/u);
		expect(keys.results[0]?.key).not.toContain("203.0.113.99");
	});
});

describe("invitation acceptance", () => {
	it("accepts once, creates one membership, and returns idempotent success", async () => {
		const created = await createInvitation({ role: "contributor" });
		const token = rawTokenFrom(created.body.invitation.url);
		const first = await apiRequest("/api/invitations/accept", {
			body: { token },
			clientIp: "203.0.113.20",
			method: "POST",
			userId: users.invitee,
		});
		expect(first.status).toBe(200);
		expect(await first.json()).toEqual({
			accepted: true,
			alreadyAccepted: false,
		});

		const repeated = await apiRequest("/api/invitations/accept", {
			body: { token },
			clientIp: "203.0.113.20",
			method: "POST",
			userId: users.invitee,
		});
		expect(repeated.status).toBe(200);
		expect(await repeated.json()).toEqual({
			accepted: true,
			alreadyAccepted: true,
		});

		const counts = await env.DB.prepare(
			`select
				(select count(*) from invitation_acceptances where invitation_id = ?) as acceptances,
				(select count(*) from workspace_memberships where workspace_id = ? and user_id = ?) as memberships`,
		)
			.bind(created.body.invitation.id, workspaceA, users.invitee)
			.first<{ acceptances: number; memberships: number }>();
		expect(counts).toEqual({ acceptances: 1, memberships: 1 });
	});

	it("creates only the selected Collection memberships", async () => {
		const created = await createInvitation({
			role: "commenter",
			scope: {
				type: "collections",
				collectionIds: [collectionA1, collectionA2],
			},
		});
		const accepted = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(created.body.invitation.url) },
			method: "POST",
			userId: users.invitee,
		});
		expect(accepted.status).toBe(200);
		const memberships = await env.DB.prepare(
			"select collection_id, role from collection_memberships where user_id = ? order by collection_id",
		)
			.bind(users.invitee)
			.all<{ collection_id: string; role: string }>();
		expect(memberships.results).toEqual([
			{ collection_id: collectionA1, role: "commenter" },
			{ collection_id: collectionA2, role: "commenter" },
		]);
		const workspaceMembership = await env.DB.prepare(
			"select count(*) as count from workspace_memberships where user_id = ?",
		)
			.bind(users.invitee)
			.first<{ count: number }>();
		expect(workspaceMembership?.count).toBe(0);
	});

	it("upgrades an existing membership but never downgrades it", async () => {
		const upgrade = await createInvitation({ role: "contributor" });
		const upgraded = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(upgrade.body.invitation.url) },
			method: "POST",
			userId: users.workspaceMember,
		});
		expect(upgraded.status).toBe(200);

		const lowerRole = await createInvitation({ role: "viewer" });
		const preserved = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(lowerRole.body.invitation.url) },
			method: "POST",
			userId: users.workspaceMember,
		});
		expect(preserved.status).toBe(200);
		const stored = await env.DB.prepare(
			"select role from workspace_memberships where workspace_id = ? and user_id = ?",
		)
			.bind(workspaceA, users.workspaceMember)
			.first<{ role: string }>();
		expect(stored?.role).toBe("contributor");
	});

	it("enforces verified-email restrictions while open links remain usable", async () => {
		const restricted = await createInvitation({
			invitedEmail: "invitee@example.com",
		});
		const token = rawTokenFrom(restricted.body.invitation.url);
		const mismatch = await apiRequest("/api/invitations/accept", {
			body: { token },
			method: "POST",
			userId: users.mismatch,
		});
		expect(mismatch.status).toBe(403);
		expect(await mismatch.json()).toMatchObject({
			error: { code: "INVITATION_EMAIL_MISMATCH" },
		});

		const unverifiedInvite = await createInvitation({
			invitedEmail: "unverified@example.com",
		});
		const unverified = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(unverifiedInvite.body.invitation.url) },
			method: "POST",
			userId: users.unverified,
		});
		expect(unverified.status).toBe(403);

		const open = await createInvitation({
			invitedEmail: "invitee@example.com",
			restrictToEmail: false,
		});
		const openAcceptance = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(open.body.invitation.url) },
			method: "POST",
			userId: users.mismatch,
		});
		expect(openAcceptance.status).toBe(200);
	});

	it("rejects expired and revoked invitations", async () => {
		const expired = await createInvitation();
		const now = Date.now();
		await env.DB.prepare(
			"update invitations set created_at = ?, expires_at = ? where id = ?",
		)
			.bind(now - 10_000, now - 1, expired.body.invitation.id)
			.run();
		const expiredResponse = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(expired.body.invitation.url) },
			method: "POST",
			userId: users.invitee,
		});
		expect(expiredResponse.status).toBe(410);

		const revoked = await createInvitation();
		const revoke = await apiRequest(
			`/api/workspaces/${workspaceA}/invitations/${revoked.body.invitation.id}/revoke`,
			{ body: {}, method: "POST", userId: users.owner },
		);
		expect(revoke.status).toBe(200);
		const revokedResponse = await apiRequest("/api/invitations/accept", {
			body: { token: rawTokenFrom(revoked.body.invitation.url) },
			method: "POST",
			userId: users.invitee,
		});
		expect(revokedResponse.status).toBe(409);
		expect(await revokedResponse.json()).toMatchObject({
			error: { code: "INVITATION_REVOKED" },
		});
	});

	it("handles concurrent retries without duplicate consumption or membership", async () => {
		const created = await createInvitation();
		const token = rawTokenFrom(created.body.invitation.url);
		const responses = await Promise.all([
			apiRequest("/api/invitations/accept", {
				body: { token },
				clientIp: "203.0.113.31",
				method: "POST",
				userId: users.invitee,
			}),
			apiRequest("/api/invitations/accept", {
				body: { token },
				clientIp: "203.0.113.31",
				method: "POST",
				userId: users.invitee,
			}),
		]);
		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		const bodies = await Promise.all(
			responses.map((response) =>
				response.json<{ alreadyAccepted: boolean }>(),
			),
		);
		expect(bodies.map(({ alreadyAccepted }) => alreadyAccepted).sort()).toEqual(
			[false, true],
		);

		const counts = await env.DB.prepare(
			`select
				(select count(*) from invitation_acceptances where invitation_id = ?) as acceptances,
				(select count(*) from workspace_memberships where workspace_id = ? and user_id = ?) as memberships`,
		)
			.bind(created.body.invitation.id, workspaceA, users.invitee)
			.first<{ acceptances: number; memberships: number }>();
		expect(counts).toEqual({ acceptances: 1, memberships: 1 });
	});

	it("allows only one of two competing users to consume an invitation", async () => {
		const created = await createInvitation();
		const token = rawTokenFrom(created.body.invitation.url);
		const responses = await Promise.all([
			apiRequest("/api/invitations/accept", {
				body: { token },
				clientIp: "203.0.113.41",
				method: "POST",
				userId: users.invitee,
			}),
			apiRequest("/api/invitations/accept", {
				body: { token },
				clientIp: "203.0.113.42",
				method: "POST",
				userId: users.mismatch,
			}),
		]);
		expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);

		const state = await env.DB.prepare(
			`select
				(select count(*) from invitation_acceptances where invitation_id = ?) as acceptances,
				(select count(*) from workspace_memberships
					where workspace_id = ? and user_id in (?, ?)) as memberships`,
		)
			.bind(
				created.body.invitation.id,
				workspaceA,
				users.invitee,
				users.mismatch,
			)
			.first<{ acceptances: number; memberships: number }>();
		expect(state).toEqual({ acceptances: 1, memberships: 1 });
	});

	it("rolls back consumption on membership failure and succeeds on retry", async () => {
		const created = await createInvitation({
			scope: { type: "collections", collectionIds: [collectionA2] },
		});
		const token = rawTokenFrom(created.body.invitation.url);
		await env.DB.prepare(
			`create trigger collab_force_membership_failure
			before insert on collection_memberships
			when new.user_id = '${users.invitee}'
			begin
				select raise(abort, 'forced membership failure');
			end`,
		).run();

		const failed = await apiRequest("/api/invitations/accept", {
			body: { token },
			method: "POST",
			userId: users.invitee,
		});
		expect(failed.status).toBe(500);
		const rolledBack = await env.DB.prepare(
			"select count(*) as count from invitation_acceptances where invitation_id = ?",
		)
			.bind(created.body.invitation.id)
			.first<{ count: number }>();
		expect(rolledBack?.count).toBe(0);

		await env.DB.prepare("drop trigger collab_force_membership_failure").run();
		const retried = await apiRequest("/api/invitations/accept", {
			body: { token },
			method: "POST",
			userId: users.invitee,
		});
		expect(retried.status).toBe(200);
		const accepted = await env.DB.prepare(
			"select count(*) as count from invitation_acceptances where invitation_id = ?",
		)
			.bind(created.body.invitation.id)
			.first<{ count: number }>();
		expect(accepted?.count).toBe(1);

		await expect(
			env.DB.prepare(
				"insert into invitation_acceptances (invitation_id, accepted_by_user_id, accepted_at) values (?, ?, ?)",
			)
				.bind(created.body.invitation.id, users.mismatch, Date.now())
				.run(),
		).rejects.toThrow(/UNIQUE constraint failed/u);
	});

	it("rate-limits authenticated acceptance attempts", async () => {
		const invalidToken = "A".repeat(43);
		for (
			let index = 0;
			index < invitationAcceptanceRateLimit.limit;
			index += 1
		) {
			const response = await apiRequest("/api/invitations/accept", {
				body: { token: invalidToken },
				clientIp: "203.0.113.55",
				method: "POST",
				userId: users.invitee,
			});
			expect(response.status).toBe(404);
		}

		const limited = await apiRequest("/api/invitations/accept", {
			body: { token: invalidToken },
			clientIp: "203.0.113.55",
			method: "POST",
			userId: users.invitee,
		});
		expect(limited.status).toBe(429);
	});
});
