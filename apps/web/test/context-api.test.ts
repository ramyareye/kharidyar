import { env, exports } from "cloudflare:workers";
import {
	contextSnapshotResponseSchema,
	type ContextSnapshotResource,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceA = "context-workspace-a";
const workspaceB = "context-workspace-b";
const collectionA1 = "context-collection-a1";
const collectionA2 = "context-collection-a2";
const collectionB1 = "context-collection-b1";
const itemA1 = "context-item-a1";

const users = {
	owner: "context-owner",
	otherOwner: "context-other-owner",
	scopedViewer: "context-scoped-viewer",
	workspaceViewer: "context-workspace-viewer",
	outsider: "context-outsider",
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
	options?: {
		method?: string;
		origin?: string | null;
		userId?: TestUserId;
	},
): Promise<Response> {
	const headers = new Headers();
	if (options?.origin !== null) {
		headers.set("origin", options?.origin ?? "http://example.com");
	}
	if (options?.userId !== undefined) {
		headers.set("cookie", await signedSessionCookie(options.userId));
	}

	return exports.default.fetch(
		new Request(`http://example.com${path}`, {
			headers,
			method: options?.method ?? "GET",
		}),
	);
}

async function resetFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare(
			"delete from workspaces where created_by_user_id in (select id from user where id like 'context-%')",
		),
		env.DB.prepare("delete from user where id like 'context-%'"),
	]);

	const now = Date.now();
	const expiresAt = now + 30 * 24 * 60 * 60 * 1_000;
	const statements: D1PreparedStatement[] = [];
	for (const [name, id] of Object.entries(users)) {
		statements.push(
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?1, ?2, ?3, 1)",
			).bind(id, name, `${name}@example.com`),
			env.DB.prepare(
				"insert into session (id, expires_at, token, updated_at, user_id) values (?1, ?2, ?3, ?4, ?5)",
			).bind(
				`session-${id}`,
				now + 60 * 60 * 1_000,
				`session-token-${id}`,
				now,
				id,
			),
		);
	}

	statements.push(
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)",
		).bind(workspaceA, "Visible home", users.owner, now),
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)",
		).bind(workspaceB, "Cross workspace secret", users.otherOwner, now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("context-membership-owner", workspaceA, users.owner, "owner", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"context-membership-other-owner",
			workspaceB,
			users.otherOwner,
			"owner",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"context-membership-workspace-viewer",
			workspaceA,
			users.workspaceViewer,
			"viewer",
			now,
		),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, description, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			collectionA1,
			workspaceA,
			"Japanese-modern bedroom",
			"A calm room",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, description, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			collectionA2,
			workspaceA,
			"Same workspace secret",
			"Do not leak this collection",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, description, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			collectionB1,
			workspaceB,
			"Other home",
			"Cross workspace collection secret",
			users.otherOwner,
			now,
		),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'viewer', ?4, ?4)",
		).bind(
			"context-membership-scoped-viewer",
			collectionA1,
			users.scopedViewer,
			now,
		),
		env.DB.prepare(
			`insert into collection_briefs (
				id, collection_id, title, description, keywords_json,
				materials_json, preferred_brands_json, intended_use,
				requirements, things_to_avoid, reference_urls_json,
				budget_minor, budget_currency, created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'EUR', ?13, ?13)`,
		).bind(
			"context-brief-a1",
			collectionA1,
			"Quiet natural room",
			"Warm wood and paper light",
			JSON.stringify(["Japandi", "low profile"]),
			JSON.stringify(["birch", "linen"]),
			JSON.stringify(["IKEA"]),
			"Sleeping and reading",
			"Keep an 80 cm walkway",
			"Glossy finishes",
			JSON.stringify(["https://example.com/reference"]),
			215_000,
			now,
		),
		env.DB.prepare(
			"insert into collection_brief_colors (id, collection_brief_id, kind, position, hex, label, usage_note, created_at, updated_at) values (?1, ?2, 'core', 0, '#C8A97E', ?3, ?4, ?5, ?5)",
		).bind(
			"context-color-a1",
			"context-brief-a1",
			"Warm oak",
			"Main wood",
			now,
		),
		env.DB.prepare(
			"insert into concepts (id, collection_id, title, narrative, created_by_user_id, updated_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?6)",
		).bind(
			"context-concept-a1",
			collectionA1,
			"Japanese-modern calm",
			"Natural timber, paper light, quiet lines.",
			users.owner,
			now,
		),
		env.DB.prepare(
			`insert into items (
				id, workspace_id, collection_id, title, description, requirements,
				priority, status, quantity_needed, group_label, budget_minor,
				budget_currency, created_by_user_id, created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, ?6, 'essential', 'comparing', 1, ?7, 60000, 'EUR', ?8, ?9, ?9)`,
		).bind(
			itemA1,
			workspaceA,
			collectionA1,
			"Visible bed",
			"Low birch bed",
			"Fits 180 × 214 cm",
			"Bedroom",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			"context-item-a2-secret",
			workspaceA,
			collectionA2,
			"Same workspace secret item",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into products (id, workspace_id, title, brand, model, category, attributes_json, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
		).bind(
			"context-product-a1",
			workspaceA,
			"BJÖRKSNÄS bed",
			"IKEA",
			"BJÖRKSNÄS",
			"Bed",
			JSON.stringify([{ label: "Material", value: "Birch" }]),
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into merchants (id, workspace_id, name, sales_channel, website_url, notes, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, 'both', ?4, ?5, ?6, ?7, ?7)",
		).bind(
			"context-merchant-a1",
			workspaceA,
			"IKEA Netherlands",
			"https://www.ikea.com/nl/en/",
			"Check Amsterdam stock",
			users.owner,
			now,
		),
		env.DB.prepare(
			`insert into offers (
				id, workspace_id, product_id, merchant_id, source_url, price_kind,
				unit_price_minor, currency, shipping_minor, shipping_basis,
				availability_state, availability_location, locale, last_checked_at,
				created_by_user_id, created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, 'exact', 52900, 'EUR', null, 'unknown', 'available', 'Amsterdam', 'nl-NL', ?6, ?7, ?6, ?6)`,
		).bind(
			"context-offer-a1",
			workspaceA,
			"context-product-a1",
			"context-merchant-a1",
			"https://www.ikea.com/nl/en/p/example/",
			now,
			users.owner,
		),
		env.DB.prepare(
			`insert into item_candidates (
				id, workspace_id, item_id, product_id, planned_purchase_quantity,
				is_planned, planned_offer_id, notes, rank, created_by_user_id,
				created_at, updated_at
			) values (?1, ?2, ?3, ?4, 1, 1, ?5, ?6, 1, ?7, ?8, ?8)`,
		).bind(
			"context-candidate-a1",
			workspaceA,
			itemA1,
			"context-product-a1",
			"context-offer-a1",
			"Best fit for the concept",
			users.owner,
			now,
		),
		env.DB.prepare(
			`insert into price_checks (
				id, offer_id, price_kind, unit_price_minor, currency,
				shipping_minor, shipping_basis, availability_state,
				availability_location, observed_at, observed_by_user_id, created_at
			) values (?1, ?2, 'exact', 52900, 'EUR', null, 'unknown', 'available', 'Amsterdam', ?3, ?4, ?3)`,
		).bind("context-price-a1", "context-offer-a1", now, users.owner),
		env.DB.prepare(
			"insert into comments (id, workspace_id, item_id, candidate_id, body, author_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
		).bind(
			"context-comment-a1",
			workspaceA,
			itemA1,
			"context-candidate-a1",
			"Try this bed in person.",
			users.scopedViewer,
			now,
		),
		env.DB.prepare(
			"insert into candidate_votes (workspace_id, item_id, candidate_id, user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			workspaceA,
			itemA1,
			"context-candidate-a1",
			users.workspaceViewer,
			now,
		),
		env.DB.prepare(
			`insert into decision_events (
				id, item_id, kind, actor_user_id, from_status, to_status,
				transition_kind, note, created_at
			) values (?1, ?2, 'item_status_changed', ?3, 'researching', 'comparing', 'progression', ?4, ?5)`,
		).bind(
			"context-decision-a1",
			itemA1,
			users.owner,
			"Ready to compare",
			now,
		),
		env.DB.prepare(
			"insert into research_requests (id, workspace_id, collection_id, item_id, query, constraints_json, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
		).bind(
			"context-request-a1",
			workspaceA,
			collectionA1,
			itemA1,
			"Find a low birch bed",
			JSON.stringify({
				maxUnitPriceMinor: 60_000,
				currency: "EUR",
				preferredDomains: ["ikea.com"],
				requiredTerms: ["birch"],
				excludedTerms: [],
			}),
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into research_runs (id, request_id, workspace_id, collection_id, status, provider, provider_query, workflow_instance_id, requested_by_user_id, started_at, finished_at, created_at, updated_at) values (?1, ?2, ?3, ?4, 'completed', 'tavily-basic-v1', ?5, ?6, ?7, ?8, ?8, ?8, ?8)",
		).bind(
			"context-run-a1",
			"context-request-a1",
			workspaceA,
			collectionA1,
			"Find a low birch bed",
			"context-workflow-a1",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into research_sources (id, run_id, request_id, workspace_id, collection_id, url, title, provider, retrieved_at, extraction_status, extraction_method, extraction_metadata_json, snapshot_json, snapshot_expires_at, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'tavily-basic-v1', ?8, 'not_allowed', 'search', '{}', null, ?9, ?8, ?8)",
		).bind(
			"context-source-a1",
			"context-run-a1",
			"context-request-a1",
			workspaceA,
			collectionA1,
			"https://example.com/visible-bed",
			"Visible sourced bed",
			now,
			expiresAt,
		),
		env.DB.prepare(
			"insert into research_results (id, run_id, source_id, title, summary, score, status, snapshot_expires_at, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, 0.92, 'active', ?6, ?7, ?7)",
		).bind(
			"context-result-a1",
			"context-run-a1",
			"context-source-a1",
			"Visible sourced bed",
			"A low birch frame",
			expiresAt,
			now,
		),
		env.DB.prepare(
			"insert into research_requests (id, workspace_id, collection_id, query, constraints_json, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
		).bind(
			"context-request-a2-secret",
			workspaceA,
			collectionA2,
			"Same workspace secret research",
			JSON.stringify({
				maxUnitPriceMinor: null,
				currency: "EUR",
				preferredDomains: [],
				requiredTerms: [],
				excludedTerms: [],
			}),
			users.owner,
			now,
		),
	);

	await env.DB.batch(statements);
}

beforeEach(resetFixture);

async function createSnapshot(userId: TestUserId, collectionId = collectionA1) {
	const response = await apiRequest(
		`/api/collections/${collectionId}/context-snapshots`,
		{ method: "POST", userId },
	);
	return {
		body:
			response.status === 201
				? contextSnapshotResponseSchema.parse(await response.json()).snapshot
				: null,
		response,
	};
}

describe("permission-filtered context snapshots", () => {
	it("captures the accessible Collection and exports inspectable Markdown without adjacent data", async () => {
		const created = await createSnapshot(users.scopedViewer);
		expect(created.response.status).toBe(201);
		const snapshot = created.body as ContextSnapshotResource;
		expect(snapshot).toMatchObject({
			actor: { id: users.scopedViewer, name: "scopedViewer" },
			schemaVersion: 1,
			scope: {
				type: "collection",
				workspaceId: workspaceA,
				collectionId: collectionA1,
			},
		});
		expect(snapshot.content.brief?.colorPreference.core).toEqual([
			{ hex: "#C8A97E", label: "Warm oak", usageNote: "Main wood" },
		]);
		expect(snapshot.content.concept?.title).toBe("Japanese-modern calm");
		expect(snapshot.content.items).toHaveLength(1);
		expect(snapshot.content.items[0]?.candidates[0]).toMatchObject({
			isPlanned: true,
			product: { title: "BJÖRKSNÄS bed" },
			voters: [{ id: users.workspaceViewer, name: "workspaceViewer" }],
		});
		expect(snapshot.content.items[0]?.candidates[0]?.comments[0]?.body).toBe(
			"Try this bed in person.",
		);
		expect(snapshot.content.items[0]?.decisions[0]).toMatchObject({
			kind: "item_status_changed",
			fromStatus: "researching",
			toStatus: "comparing",
		});
		expect(snapshot.content.researchRequests[0]?.runs[0]?.results[0]).toMatchObject(
			{
				title: "Visible sourced bed",
				source: { url: "https://example.com/visible-bed" },
			},
		);

		const serialized = JSON.stringify(snapshot);
		expect(serialized).not.toContain("Same workspace secret");
		expect(serialized).not.toContain("Cross workspace secret");
		expect(serialized).not.toContain("@example.com");
		expect(serialized).not.toContain("session-token");
		expect(serialized).not.toContain('"image"');

		const stored = await env.DB.prepare(
			"select actor_user_id, actor_name, schema_version, content_json, content_bytes from context_snapshots where id = ?1",
		)
			.bind(snapshot.id)
			.first<{
				actor_user_id: string;
				actor_name: string;
				schema_version: number;
				content_json: string;
				content_bytes: number;
			}>();
		expect(stored).toMatchObject({
			actor_user_id: users.scopedViewer,
			actor_name: "scopedViewer",
			schema_version: 1,
			content_bytes: snapshot.contentBytes,
		});
		expect(JSON.parse(stored!.content_json)).toEqual(snapshot.content);

		const readResponse = await apiRequest(
			`/api/context-snapshots/${snapshot.id}`,
			{ userId: users.scopedViewer },
		);
		expect(readResponse.status).toBe(200);
		expect(
			contextSnapshotResponseSchema.parse(await readResponse.json()).snapshot,
		).toEqual(snapshot);

		const markdownResponse = await apiRequest(
			`/api/context-snapshots/${snapshot.id}/export.md`,
			{ userId: users.scopedViewer },
		);
		expect(markdownResponse.status).toBe(200);
		expect(markdownResponse.headers.get("content-type")).toContain(
			"text/markdown",
		);
		expect(markdownResponse.headers.get("content-disposition")).toContain(
			`kharidyar-context-${snapshot.id}.md`,
		);
		const markdown = await markdownResponse.text();
		expect(markdown).toContain("Japanese\\-modern calm");
		expect(markdown).toContain("#C8A97E");
		expect(markdown).toContain("BJÖRKSNÄS bed");
		expect(markdown).toContain("Visible sourced bed");
		expect(markdown).not.toContain("Same workspace secret");
		expect(markdown).not.toContain("Cross workspace secret");
	});

	it("conceals inaccessible Collections and keeps stored snapshots creator-only", async () => {
		const inaccessible = await createSnapshot(
			users.scopedViewer,
			collectionA2,
		);
		expect(inaccessible.response.status).toBe(404);

		const outsider = await createSnapshot(users.outsider);
		expect(outsider.response.status).toBe(404);

		const ownerSnapshot = await createSnapshot(users.owner);
		expect(ownerSnapshot.response.status).toBe(201);
		const otherMemberRead = await apiRequest(
			`/api/context-snapshots/${ownerSnapshot.body!.id}`,
			{ userId: users.scopedViewer },
		);
		expect(otherMemberRead.status).toBe(404);

		const scopedSnapshot = await createSnapshot(users.scopedViewer);
		await env.DB.prepare(
			"delete from collection_memberships where collection_id = ?1 and user_id = ?2",
		)
			.bind(collectionA1, users.scopedViewer)
			.run();
		const revokedRead = await apiRequest(
			`/api/context-snapshots/${scopedSnapshot.body!.id}`,
			{ userId: users.scopedViewer },
		);
		expect(revokedRead.status).toBe(404);
	});

	it("requires authentication and a trusted origin when creating a snapshot", async () => {
		const anonymous = await apiRequest(
			`/api/collections/${collectionA1}/context-snapshots`,
			{ method: "POST" },
		);
		expect(anonymous.status).toBe(401);

		const crossSite = await apiRequest(
			`/api/collections/${collectionA1}/context-snapshots`,
			{
				method: "POST",
				origin: "https://attacker.example",
				userId: users.scopedViewer,
			},
		);
		expect(crossSite.status).toBe(403);
	});
});
