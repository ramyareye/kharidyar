import { env, exports } from "cloudflare:workers";
import {
	apiErrorResponseSchema,
	importDraftListResponseSchema,
	importDraftResponseSchema,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "import-workspace";
const collectionId = "import-collection";
const existingMerchantId = "import-existing-merchant";

const users = {
	owner: "import-owner",
	contributor: "import-contributor",
	viewer: "import-viewer",
	outsider: "import-outsider",
} as const;

type TestUserId = (typeof users)[keyof typeof users];

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
	options?: { body?: unknown; method?: string; userId?: TestUserId },
): Promise<Response> {
	const headers = new Headers({ origin: "http://example.com" });
	if (options?.body !== undefined)
		headers.set("content-type", "application/json");
	if (options?.userId)
		headers.set("cookie", await signedSessionCookie(options.userId));
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
		env.DB.prepare("delete from workspaces where id = ?1").bind(workspaceId),
		env.DB.prepare("delete from user where id like 'import-%'"),
	]);
	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	for (const [name, id] of Object.entries(users)) {
		statements.push(
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?1, ?2, ?3, 1)",
			).bind(id, name, `${name}@example.com`),
			env.DB.prepare(
				"insert into session (id, expires_at, token, updated_at, user_id) values (?1, ?2, ?3, ?4, ?5)",
			).bind(`session-${id}`, now + 3_600_000, `session-token-${id}`, now, id),
		);
	}
	statements.push(
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, 'Import home', ?2, ?3, ?3)",
		).bind(workspaceId, users.owner, now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Apartment', ?3, ?4, ?4)",
		).bind(collectionId, workspaceId, users.owner, now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("import-membership-owner", workspaceId, users.owner, "owner", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'contributor', ?4, ?4)",
		).bind(
			"import-membership-contributor",
			workspaceId,
			users.contributor,
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'viewer', ?4, ?4)",
		).bind("import-membership-viewer", workspaceId, users.viewer, now),
		env.DB.prepare(
			"insert into merchants (id, workspace_id, name, sales_channel, website_url, created_by_user_id, created_at, updated_at) values (?1, ?2, 'IKEA', 'both', 'https://www.ikea.com', ?3, ?4, ?4)",
		).bind(existingMerchantId, workspaceId, users.owner, now),
	);
	await env.DB.batch(statements);
}

const research = `
### Bedroom
| Product | Price | Notes |
| --- | --- | --- |
| [LISABO chair](https://www.ikea.com/nl/en/p/lisabo-chair-00457235/) ×2 | €119.98 | Buy two now; perhaps two later |
| [Natural rugs](https://www.ikea.com/nl/en/cat/rugs-10653/) | from €29.99 | Size depends on the room |

Total bedroom: €149.97
Delivery is not included.
`;

describe("Research Import Draft API", () => {
	beforeEach(resetFixture);

	it("stages a review without mutating planning records and enforces permissions", async () => {
		const denied = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{
				body: { format: "markdown", rawInput: research },
				method: "POST",
				userId: users.viewer,
			},
		);
		expect(denied.status).toBe(403);
		expect(apiErrorResponseSchema.parse(await denied.json()).error.code).toBe(
			"FORBIDDEN",
		);

		const response = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{
				body: { format: "markdown", rawInput: research },
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(response.status).toBe(201);
		const draft = importDraftResponseSchema.parse(await response.json()).draft;
		expect(draft.status).toBe("draft");
		expect(draft.rawInput).toContain("LISABO");
		expect(draft.proposal.lines).toHaveLength(2);
		expect(draft.proposal.lines[1]?.source?.kind).toBe("category");
		expect(draft.proposal.lines[1]?.offer).toBeNull();
		expect(draft.warnings.some(({ severity }) => severity === "error")).toBe(
			true,
		);

		const planningCount = await env.DB.prepare(
			"select count(*) as count from items where collection_id = ?1",
		)
			.bind(collectionId)
			.first<{ count: number }>();
		expect(planningCount?.count).toBe(0);

		const readable = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{ userId: users.viewer },
		);
		expect(readable.status).toBe(200);
		expect(
			importDraftListResponseSchema.parse(await readable.json()).drafts,
		).toHaveLength(1);

		const hidden = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{ userId: users.outsider },
		);
		expect(hidden.status).toBe(404);
	});

	it("applies once after review, reuses Merchants, and erases raw input", async () => {
		const createdResponse = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{
				body: { format: "markdown", rawInput: research },
				method: "POST",
				userId: users.contributor,
			},
		);
		let draft = importDraftResponseSchema.parse(
			await createdResponse.json(),
		).draft;

		const blocked = await apiRequest(
			`/api/collections/${collectionId}/import-drafts/${draft.id}/apply`,
			{ method: "POST", userId: users.contributor },
		);
		expect(blocked.status).toBe(400);

		const proposal = {
			...draft.proposal,
			lines: draft.proposal.lines.map((line) =>
				line.futureQuantity
					? {
							...line,
							candidate: {
								...line.candidate,
								quantityOrigin: "reviewed" as const,
							},
							item: { ...line.item, quantityOrigin: "reviewed" as const },
						}
					: line,
			),
		};
		const correctedResponse = await apiRequest(
			`/api/collections/${collectionId}/import-drafts/${draft.id}`,
			{
				body: { proposal },
				method: "PUT",
				userId: users.contributor,
			},
		);
		expect(correctedResponse.status).toBe(200);
		draft = importDraftResponseSchema.parse(
			await correctedResponse.json(),
		).draft;
		expect(draft.warnings.some(({ severity }) => severity === "error")).toBe(
			false,
		);

		const appliedResponse = await apiRequest(
			`/api/collections/${collectionId}/import-drafts/${draft.id}/apply`,
			{ method: "POST", userId: users.contributor },
		);
		expect(appliedResponse.status).toBe(200);
		const applied = importDraftResponseSchema.parse(
			await appliedResponse.json(),
		).draft;
		expect(applied.status).toBe("applied");
		expect(applied.rawInput).toBeNull();
		expect(applied.application).toHaveLength(9);
		expect(
			applied.application.find(({ recordType }) => recordType === "merchant"),
		).toMatchObject({ action: "reused", recordId: existingMerchantId });

		const retriedResponse = await apiRequest(
			`/api/collections/${collectionId}/import-drafts/${draft.id}/apply`,
			{ method: "POST", userId: users.contributor },
		);
		expect(retriedResponse.status).toBe(200);
		const retried = importDraftResponseSchema.parse(
			await retriedResponse.json(),
		).draft;
		expect(retried.application).toEqual(applied.application);

		const counts = await env.DB.prepare(
			`select
				(select count(*) from items where collection_id = ?1) as items,
				(select count(*) from products where workspace_id = ?2) as products,
				(select count(*) from item_candidates where workspace_id = ?2) as candidates,
				(select count(*) from offers where workspace_id = ?2) as offers,
				(select count(*) from price_checks pc join offers o on o.id = pc.offer_id where o.workspace_id = ?2) as checks,
				(select count(*) from merchants where workspace_id = ?2) as merchants`,
		)
			.bind(collectionId, workspaceId)
			.first<
				Record<
					| "candidates"
					| "checks"
					| "items"
					| "merchants"
					| "offers"
					| "products",
					number
				>
			>();
		expect(counts).toEqual({
			items: 2,
			products: 2,
			candidates: 2,
			offers: 1,
			checks: 1,
			merchants: 1,
		});
	});

	it("discards idempotently and rejects malformed JSON without saving it", async () => {
		const malformed = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{
				body: { format: "json", rawInput: '{"schemaVersion":' },
				method: "POST",
				userId: users.owner,
			},
		);
		expect(malformed.status).toBe(400);

		const created = await apiRequest(
			`/api/collections/${collectionId}/import-drafts`,
			{
				body: { format: "markdown", rawInput: research },
				method: "POST",
				userId: users.owner,
			},
		);
		const draft = importDraftResponseSchema.parse(await created.json()).draft;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const response = await apiRequest(
				`/api/collections/${collectionId}/import-drafts/${draft.id}/discard`,
				{ method: "POST", userId: users.owner },
			);
			expect(response.status).toBe(200);
			const discarded = importDraftResponseSchema.parse(
				await response.json(),
			).draft;
			expect(discarded.status).toBe("discarded");
			expect(discarded.rawInput).toBeNull();
		}

		const count = await env.DB.prepare(
			"select count(*) as count from import_drafts where collection_id = ?1",
		)
			.bind(collectionId)
			.first<{ count: number }>();
		expect(count?.count).toBe(1);
	});
});
