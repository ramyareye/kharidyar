import { env, exports } from "cloudflare:workers";
import {
	invitationCreatedResponseSchema,
	itemDiscussionResponseSchema,
	workspaceCollaborationResponseSchema,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "discussion-workspace";
const collectionId = "discussion-collection";
const siblingCollectionId = "discussion-sibling-collection";
const itemId = "discussion-item";
const siblingItemId = "discussion-sibling-item";
const candidateId = "discussion-candidate";
const siblingCandidateId = "discussion-sibling-candidate";

const users = {
	owner: "discussion-owner",
	collectionOwner: "discussion-collection-owner",
	viewer: "discussion-viewer",
	commenter: "discussion-commenter",
	editor: "discussion-editor",
} as const;

type UserId = (typeof users)[keyof typeof users];

async function signedSessionCookie(userId: UserId): Promise<string> {
	const token = `session-token-${userId}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(authSecret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return `better-auth.session_token=${token}.${encoded}`;
}

async function request(
	path: string,
	options: {
		body?: unknown;
		method?: string;
		userId: UserId;
	},
): Promise<Response> {
	const headers = new Headers({
		cookie: await signedSessionCookie(options.userId),
		origin: "http://example.com",
	});
	if (options.body !== undefined)
		headers.set("content-type", "application/json");
	return exports.default.fetch(
		new Request(`http://example.com${path}`, {
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			headers,
			method: options.method ?? "GET",
		}),
	);
}

async function resetFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("delete from workspaces where id = ?").bind(workspaceId),
		env.DB.prepare("delete from user where id like 'discussion-%'"),
	]);
	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	for (const [key, userId] of Object.entries(users)) {
		statements.push(
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?1, ?2, ?3, 1)",
			).bind(
				userId,
				key.replace(/([A-Z])/gu, " $1"),
				`${key.toLowerCase()}@example.com`,
			),
			env.DB.prepare(
				"insert into session (id, expires_at, token, updated_at, user_id) values (?1, ?2, ?3, ?4, ?5)",
			).bind(
				`session-${userId}`,
				now + 60 * 60 * 1_000,
				`session-token-${userId}`,
				now,
				userId,
			),
		);
	}
	statements.push(
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id) values (?1, 'Shared home', ?2)",
		).bind(workspaceId, users.owner),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role) values ('discussion-owner-membership', ?1, ?2, 'owner')",
		).bind(workspaceId, users.owner),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?1, ?2, 'Living room', ?3)",
		).bind(collectionId, workspaceId, users.owner),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?1, ?2, 'Bedroom', ?3)",
		).bind(siblingCollectionId, workspaceId, users.owner),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role) values ('discussion-collection-owner-membership', ?1, ?2, 'owner')",
		).bind(collectionId, users.collectionOwner),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role) values ('discussion-viewer-membership', ?1, ?2, 'viewer')",
		).bind(collectionId, users.viewer),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role) values ('discussion-commenter-membership', ?1, ?2, 'commenter')",
		).bind(collectionId, users.commenter),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role) values ('discussion-editor-membership', ?1, ?2, 'editor')",
		).bind(collectionId, users.editor),
		env.DB.prepare(
			`insert into items (
				id, workspace_id, collection_id, title, created_by_user_id
			) values (?1, ?2, ?3, 'Paper floor lamp', ?4)`,
		).bind(itemId, workspaceId, collectionId, users.owner),
		env.DB.prepare(
			`insert into items (
				id, workspace_id, collection_id, title, created_by_user_id
			) values (?1, ?2, ?3, 'Bed frame', ?4)`,
		).bind(siblingItemId, workspaceId, siblingCollectionId, users.owner),
		env.DB.prepare(
			`insert into products (
				id, workspace_id, title, created_by_user_id
			) values ('discussion-product', ?1, 'VARPTROSS lamp', ?2)`,
		).bind(workspaceId, users.owner),
		env.DB.prepare(
			`insert into products (
				id, workspace_id, title, created_by_user_id
			) values ('discussion-sibling-product', ?1, 'BJÖRKSNÄS bed', ?2)`,
		).bind(workspaceId, users.owner),
		env.DB.prepare(
			`insert into item_candidates (
				id, workspace_id, item_id, product_id, created_by_user_id
			) values (?1, ?2, ?3, 'discussion-product', ?4)`,
		).bind(candidateId, workspaceId, itemId, users.owner),
		env.DB.prepare(
			`insert into item_candidates (
				id, workspace_id, item_id, product_id, created_by_user_id
			) values (?1, ?2, ?3, 'discussion-sibling-product', ?4)`,
		).bind(siblingCandidateId, workspaceId, siblingItemId, users.owner),
	);
	await env.DB.batch(statements);
}

beforeEach(resetFixture);

describe("collaboration administration", () => {
	it("shows only scopes the current Owner may administer and never repeats the raw link", async () => {
		const created = await request(
			`/api/workspaces/${workspaceId}/invitations`,
			{
				body: {
					expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
					invitedEmail: "new-member@example.com",
					restrictToEmail: true,
					role: "commenter",
					scope: { collectionIds: [collectionId], type: "collections" },
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(created.status).toBe(201);
		const creationBody = invitationCreatedResponseSchema.parse(
			await created.json(),
		);

		const ownerResponse = await request(
			`/api/workspaces/${workspaceId}/collaboration`,
			{ userId: users.owner },
		);
		expect(ownerResponse.status).toBe(200);
		const ownerBody = workspaceCollaborationResponseSchema.parse(
			await ownerResponse.json(),
		);
		expect(ownerBody.permissions).toMatchObject({
			canGrantOwner: true,
			canInviteWorkspace: true,
		});
		expect(ownerBody.permissions.invitableCollections).toHaveLength(2);
		expect(
			ownerBody.members.some((member) => member.scope.type === "workspace"),
		).toBe(true);
		expect(ownerBody.invitations[0]).toMatchObject({
			id: creationBody.invitation.id,
			status: "pending",
			invitedEmail: "new-member@example.com",
		});
		expect(JSON.stringify(ownerBody)).not.toContain(
			creationBody.invitation.url,
		);

		const collectionOwnerResponse = await request(
			`/api/workspaces/${workspaceId}/collaboration`,
			{ userId: users.collectionOwner },
		);
		const collectionOwnerBody = workspaceCollaborationResponseSchema.parse(
			await collectionOwnerResponse.json(),
		);
		expect(collectionOwnerBody.permissions.canInviteWorkspace).toBe(false);
		expect(collectionOwnerBody.permissions.invitableCollections).toEqual([
			{ id: collectionId, name: "Living room" },
		]);
		expect(
			collectionOwnerBody.members.every(
				(member) =>
					member.scope.type === "collection" &&
					member.scope.collectionId === collectionId,
			),
		).toBe(true);
	});
});

describe("Item and Candidate discussion", () => {
	it("enforces capabilities, target integrity, one preference, and moderation", async () => {
		const viewerRead = await request(`/api/items/${itemId}/discussion`, {
			userId: users.viewer,
		});
		expect(viewerRead.status).toBe(200);
		expect(
			itemDiscussionResponseSchema.parse(await viewerRead.json()).permissions,
		).toMatchObject({
			canComment: false,
			canVote: false,
		});
		const viewerWrite = await request(`/api/items/${itemId}/comments`, {
			body: { body: "I should not be able to post." },
			method: "POST",
			userId: users.viewer,
		});
		expect(viewerWrite.status).toBe(403);

		const itemComment = await request(`/api/items/${itemId}/comments`, {
			body: { body: "Does the shade feel warm enough?" },
			method: "POST",
			userId: users.commenter,
		});
		expect(itemComment.status).toBe(201);
		const itemCommentBody = itemDiscussionResponseSchema.parse(
			await itemComment.json(),
		);
		const commentId = itemCommentBody.itemComments[0].id;
		expect(itemCommentBody.itemComments[0].permissions.canEdit).toBe(true);

		const candidateComment = await request(
			`/api/items/${itemId}/candidates/${candidateId}/comments`,
			{
				body: { body: "This is my preferred shape." },
				method: "POST",
				userId: users.commenter,
			},
		);
		expect(candidateComment.status).toBe(201);
		const candidateCommentBody = itemDiscussionResponseSchema.parse(
			await candidateComment.json(),
		);
		const candidateCommentId =
			candidateCommentBody.candidates[0].comments[0].id;
		const crossItemCandidate = await request(
			`/api/items/${itemId}/candidates/${siblingCandidateId}/comments`,
			{
				body: { body: "Wrong target." },
				method: "POST",
				userId: users.commenter,
			},
		);
		expect(crossItemCandidate.status).toBe(404);

		for (let index = 0; index < 2; index += 1) {
			const vote = await request(
				`/api/items/${itemId}/candidates/${candidateId}/vote`,
				{
					body: { selected: true },
					method: "PUT",
					userId: users.commenter,
				},
			);
			expect(vote.status).toBe(200);
		}
		const votes = await env.DB.prepare(
			"select count(*) as count from candidate_votes where candidate_id = ?",
		)
			.bind(candidateId)
			.first<{ count: number }>();
		expect(votes?.count).toBe(1);

		const resolved = await request(
			`/api/items/${itemId}/comments/${commentId}/resolve`,
			{
				body: { resolved: true },
				method: "POST",
				userId: users.editor,
			},
		);
		expect(resolved.status).toBe(200);
		expect(
			itemDiscussionResponseSchema.parse(await resolved.json()).itemComments[0]
				.resolvedAt,
		).toBeTruthy();

		const removed = await request(
			`/api/items/${itemId}/comments/${commentId}`,
			{ method: "DELETE", userId: users.editor },
		);
		expect(removed.status).toBe(200);
		expect(
			itemDiscussionResponseSchema.parse(await removed.json()).itemComments[0],
		).toMatchObject({
			body: null,
			resolvedAt: null,
		});

		await env.DB.prepare(
			"update item_candidates set archived_at = ?1 where id = ?2",
		)
			.bind(Date.now(), candidateId)
			.run();
		const archivedRead = await request(`/api/items/${itemId}/discussion`, {
			userId: users.commenter,
		});
		const archivedBody = itemDiscussionResponseSchema.parse(
			await archivedRead.json(),
		);
		expect(archivedBody.candidates[0].archived).toBe(true);
		expect(archivedBody.candidates[0].comments[0].permissions).toEqual({
			canEdit: false,
			canRemove: false,
			canResolve: false,
		});

		const archivedUpdate = await request(
			`/api/items/${itemId}/comments/${candidateCommentId}`,
			{
				body: { body: "This archived Candidate must stay read-only." },
				method: "PATCH",
				userId: users.commenter,
			},
		);
		expect(archivedUpdate.status).toBe(409);
	});

	it("applies membership revocation to the next request without a client refresh", async () => {
		const before = await request(`/api/items/${itemId}/discussion`, {
			userId: users.commenter,
		});
		expect(before.status).toBe(200);

		const revoked = await request(
			`/api/collections/${collectionId}/members/${users.commenter}`,
			{ method: "DELETE", userId: users.owner },
		);
		expect(revoked.status).toBe(200);

		const after = await request(`/api/items/${itemId}/discussion`, {
			userId: users.commenter,
		});
		expect(after.status).toBe(404);
	});
});
