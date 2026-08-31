import { env, exports } from "cloudflare:workers";
import {
	apiErrorResponseSchema,
  collectionBriefResponseSchema,
	collectionResponseSchema,
  conceptResponseSchema,
	itemListResponseSchema,
	itemResponseSchema,
	workspaceListResponseSchema,
	workspaceResponseSchema,
} from "@kharidyar/contracts";
import { hc } from "hono/client";
import { beforeEach, describe, expect, it } from "vitest";

import type { CoreWorkspaceRoutes } from "../src/worker/core-workspace-routes";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceA = "core-workspace-a";
const workspaceB = "core-workspace-b";
const collectionA1 = "core-collection-a1";
const collectionA2 = "core-collection-a2";
const collectionB1 = "core-collection-b1";
const itemA1 = "core-item-a1";
const itemA1Second = "core-item-a1-second";
const itemA2 = "core-item-a2";

const users = {
	owner: "core-owner",
	otherOwner: "core-other-owner",
	editor: "core-editor",
	contributor: "core-contributor",
	viewer: "core-viewer",
	collectionContributor: "core-collection-contributor",
	collectionOwner: "core-collection-owner",
	newOwner: "core-new-owner",
	outsider: "core-outsider",
} as const;

type TestUserId = (typeof users)[keyof typeof users];

const userDetails: readonly {
	id: TestUserId;
	email: string;
	name: string;
}[] = Object.entries(users).map(([name, id]) => ({
	id,
	email: `${name.replaceAll(/([A-Z])/g, "-$1").toLowerCase()}@example.com`,
	name,
}));

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
		bodyText?: string;
		method?: string;
		origin?: string | null;
		userId?: TestUserId;
	},
): Promise<Response> {
	const headers = new Headers();
	if (options?.body !== undefined || options?.bodyText !== undefined) {
		headers.set("content-type", "application/json");
	}
	if (options?.origin !== null) {
		headers.set("origin", options?.origin ?? "http://example.com");
	}
	if (options?.userId !== undefined) {
		headers.set("cookie", await signedSessionCookie(options.userId));
	}

	return exports.default.fetch(
		new Request(`http://example.com${path}`, {
			body:
				options?.bodyText ??
				(options?.body === undefined
					? undefined
					: JSON.stringify(options.body)),
			headers,
			method: options?.method ?? "GET",
		}),
	);
}

async function resetFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare(
			"delete from workspaces where created_by_user_id in (select id from user where id like 'core-%')",
		),
		env.DB.prepare("delete from user where id like 'core-%'"),
	]);

	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	for (const person of userDetails) {
		statements.push(
			env.DB.prepare(
				"insert into user (id, name, email, email_verified) values (?1, ?2, ?3, 1)",
			).bind(person.id, person.name, person.email),
			env.DB.prepare(
				"insert into session (id, expires_at, token, updated_at, user_id) values (?1, ?2, ?3, ?4, ?5)",
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
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)",
		).bind(workspaceA, "Home A", users.owner, now),
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)",
		).bind(workspaceB, "Home B", users.otherOwner, now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("core-membership-owner", workspaceA, users.owner, "owner", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"core-membership-other-owner",
			workspaceB,
			users.otherOwner,
			"owner",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("core-membership-editor", workspaceA, users.editor, "editor", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"core-membership-contributor",
			workspaceA,
			users.contributor,
			"contributor",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("core-membership-viewer", workspaceA, users.viewer, "viewer", now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, description, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			collectionA1,
			workspaceA,
			"Bedroom",
			"Main bedroom",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(collectionA2, workspaceA, "Living room", users.owner, now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(collectionB1, workspaceB, "Other home", users.otherOwner, now),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"core-membership-collection-contributor",
			collectionA1,
			users.collectionContributor,
			"contributor",
			now,
		),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"core-membership-collection-owner",
			collectionA1,
			users.collectionOwner,
			"owner",
			now,
		),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, priority, status, quantity_needed, group_label, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
		).bind(
			itemA1,
			workspaceA,
			collectionA1,
			"Bed",
			"essential",
			"idea",
			1,
			"Bedroom",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, priority, status, quantity_needed, group_label, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
		).bind(
			itemA1Second,
			workspaceA,
			collectionA1,
			"Lamp",
			"soon",
			"researching",
			2,
			"Bedroom",
			users.owner,
			now - 1,
		),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(itemA2, workspaceA, collectionA2, "Sofa", users.owner, now),
	);

	await env.DB.batch(statements);
}

beforeEach(resetFixture);

describe("typed Workspace to Item flow", () => {
	it("creates the hierarchy with an owner grant and typed Hono RPC contracts", async () => {
		const cookie = await signedSessionCookie(users.newOwner);
		const rpcFetch: typeof fetch = async (request, init) => {
			const headers = new Headers(init?.headers);
			headers.set("cookie", cookie);
			headers.set("origin", "http://example.com");
			return exports.default.fetch(new Request(request, { ...init, headers }));
		};
		const client = hc<CoreWorkspaceRoutes>("http://example.com/api", {
			fetch: rpcFetch,
		});

		const workspaceResponse = await client.workspaces.$post({
			json: { name: "  Apartment purchases  " },
		});
		expect(workspaceResponse.status).toBe(201);
		const workspaceBody = workspaceResponseSchema.parse(
			await workspaceResponse.json(),
		);
		expect(workspaceBody.workspace.name).toBe("Apartment purchases");

		const ownerGrant = await env.DB.prepare(
			"select role from workspace_memberships where workspace_id = ?1 and user_id = ?2",
		)
			.bind(workspaceBody.workspace.id, users.newOwner)
			.first<{ role: string }>();
		expect(ownerGrant?.role).toBe("owner");

		const collectionResponse = await client.workspaces[
			":workspaceId"
		].collections.$post({
			json: { name: "  New home  ", description: "  Quiet Japandi home  " },
			param: { workspaceId: workspaceBody.workspace.id },
		});
		expect(collectionResponse.status).toBe(201);
		const collectionBody = collectionResponseSchema.parse(
			await collectionResponse.json(),
		);

		const itemResponse = await client.collections[":collectionId"].items.$post({
			json: {
				title: "  Dining chairs  ",
				priority: "essential",
				quantityNeeded: 4,
				groupLabel: "  Dining area  ",
				budget: { minor: 24000, currency: "eur" },
				deadlineAt: "2026-12-31T12:00:00+01:00",
			},
			param: { collectionId: collectionBody.collection.id },
		});
		expect(itemResponse.status).toBe(201);
		const itemBody = itemResponseSchema.parse(await itemResponse.json());
		expect(itemBody.item).toMatchObject({
			title: "Dining chairs",
			quantityNeeded: 4,
			groupLabel: "Dining area",
			budget: { minor: 24000, currency: "EUR" },
			deadlineAt: "2026-12-31T11:00:00.000Z",
			status: "idea",
		});
	});
});

describe("authorization and scope filtering", () => {
	it("requires authentication and a trusted origin", async () => {
		const anonymous = await apiRequest("/api/workspaces");
		expect(anonymous.status).toBe(401);

		const crossSite = await apiRequest("/api/workspaces", {
			body: { name: "Blocked" },
			method: "POST",
			origin: "https://attacker.example",
			userId: users.newOwner,
		});
		expect(crossSite.status).toBe(403);
	});

	it("shows only explicitly accessible Collections to a Collection member", async () => {
		const workspaces = await apiRequest("/api/workspaces", {
			userId: users.collectionContributor,
		});
		expect(workspaces.status).toBe(200);
		const workspaceSummaries = workspaceListResponseSchema.parse(
			await workspaces.json(),
		).workspaces;
		expect(workspaceSummaries).toHaveLength(1);
		expect(workspaceSummaries[0]?.accessScope).toBe("collections");

		const parentRead = await apiRequest(`/api/workspaces/${workspaceA}`, {
			userId: users.collectionContributor,
		});
		expect(parentRead.status).toBe(404);

		const collections = await apiRequest(
			`/api/workspaces/${workspaceA}/collections`,
			{ userId: users.collectionContributor },
		);
		expect(collections.status).toBe(200);
		const collectionIds = (
			await collections.json<{ collections: { id: string }[] }>()
		).collections.map(({ id }) => id);
		expect(collectionIds).toEqual([collectionA1]);

		const ownItem = await apiRequest(`/api/items/${itemA1}`, {
			userId: users.collectionContributor,
		});
		expect(ownItem.status).toBe(200);
		const siblingItem = await apiRequest(`/api/items/${itemA2}`, {
			userId: users.collectionContributor,
		});
		expect(siblingItem.status).toBe(404);
	});

	it("allows content capabilities and denies higher-level mutations", async () => {
		const createdByContributor = await apiRequest(
			`/api/collections/${collectionA1}/items`,
			{
				body: { title: "Contributor item" },
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(createdByContributor.status).toBe(201);

		const deniedViewer = await apiRequest(
			`/api/collections/${collectionA1}/items`,
			{
				body: { title: "Viewer item" },
				method: "POST",
				userId: users.viewer,
			},
		);
		expect(deniedViewer.status).toBe(403);

		const updatedByContributor = await apiRequest(`/api/items/${itemA1}`, {
			body: { quantityNeeded: 3 },
			method: "PATCH",
			userId: users.contributor,
		});
		expect(updatedByContributor.status).toBe(200);

		const deniedArchive = await apiRequest(`/api/items/${itemA1}/archive`, {
			method: "POST",
			userId: users.contributor,
		});
		expect(deniedArchive.status).toBe(403);

		const allowedArchive = await apiRequest(`/api/items/${itemA1}/archive`, {
			method: "POST",
			userId: users.editor,
		});
		expect(allowedArchive.status).toBe(200);

		const contributorCollection = await apiRequest(
			`/api/workspaces/${workspaceA}/collections`,
			{
				body: { name: "Not allowed" },
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(contributorCollection.status).toBe(403);

		const editorCollection = await apiRequest(
			`/api/workspaces/${workspaceA}/collections`,
			{
				body: { name: "Editor collection" },
				method: "POST",
				userId: users.editor,
			},
		);
		expect(editorCollection.status).toBe(403);
	});

	it("hides cross-Workspace identifiers instead of trusting the URL", async () => {
		const otherWorkspace = await apiRequest(`/api/workspaces/${workspaceB}`, {
			userId: users.owner,
		});
		expect(otherWorkspace.status).toBe(404);

    const otherCollection = await apiRequest(
      `/api/collections/${collectionB1}`,
      {
			userId: users.owner,
      },
    );
		expect(otherCollection.status).toBe(404);

		const collectionOwnerSibling = await apiRequest(
			`/api/collections/${collectionA2}`,
			{ userId: users.collectionOwner },
		);
		expect(collectionOwnerSibling.status).toBe(404);
	});
});

describe("validation, filtering, and archive behavior", () => {
	it("rejects invalid and malformed requests with the stable error contract", async () => {
		const blankWorkspace = await apiRequest("/api/workspaces", {
			body: { name: "   " },
			method: "POST",
			userId: users.newOwner,
		});
		expect(blankWorkspace.status).toBe(400);
    expect(
      apiErrorResponseSchema.parse(await blankWorkspace.json()).error.code,
    ).toBe("BAD_REQUEST");

		const unknownField = await apiRequest("/api/workspaces", {
			body: { name: "Valid", unexpected: true },
			method: "POST",
			userId: users.newOwner,
		});
		expect(unknownField.status).toBe(400);

		const zeroQuantity = await apiRequest(
			`/api/collections/${collectionA1}/items`,
			{
				body: { title: "Invalid", quantityNeeded: 0 },
				method: "POST",
				userId: users.owner,
			},
		);
		expect(zeroQuantity.status).toBe(400);

		const emptyPatch = await apiRequest(`/api/items/${itemA1}`, {
			body: {},
			method: "PATCH",
			userId: users.owner,
		});
		expect(emptyPatch.status).toBe(400);

		const malformed = await apiRequest("/api/workspaces", {
			bodyText: "{",
			method: "POST",
			userId: users.newOwner,
		});
		expect(malformed.status).toBe(400);
    expect(
      apiErrorResponseSchema.parse(await malformed.json()).error.code,
    ).toBe("BAD_REQUEST");
	});

	it("filters and paginates Item lists with typed output", async () => {
		const filtered = await apiRequest(
			`/api/collections/${collectionA1}/items?status=idea&groupLabel=Bedroom&limit=1&offset=0`,
			{ userId: users.owner },
		);
		expect(filtered.status).toBe(200);
		const body = itemListResponseSchema.parse(await filtered.json());
		expect(body.items.map(({ id }) => id)).toEqual([itemA1]);
		expect(body.page).toEqual({ limit: 1, offset: 0, hasMore: false });

		const firstPage = await apiRequest(
			`/api/collections/${collectionA1}/items?limit=1`,
			{ userId: users.owner },
		);
		const firstPageBody = itemListResponseSchema.parse(await firstPage.json());
		expect(firstPageBody.items).toHaveLength(1);
		expect(firstPageBody.page.hasMore).toBe(true);
	});

	it("keeps archived records readable but blocks ordinary mutations", async () => {
		const archivedItem = await apiRequest(`/api/items/${itemA1}/archive`, {
			method: "POST",
			userId: users.owner,
		});
		expect(archivedItem.status).toBe(200);
		expect(
			itemResponseSchema.parse(await archivedItem.json()).item.archivedAt,
		).not.toBeNull();

		const blockedItemUpdate = await apiRequest(`/api/items/${itemA1}`, {
			body: { title: "Blocked" },
			method: "PATCH",
			userId: users.owner,
		});
		expect(blockedItemUpdate.status).toBe(409);
		expect(
			apiErrorResponseSchema.parse(await blockedItemUpdate.json()).error.code,
		).toBe("RESOURCE_ARCHIVED");

		const activeItems = await apiRequest(
			`/api/collections/${collectionA1}/items`,
			{ userId: users.owner },
		);
		expect(
			itemListResponseSchema
				.parse(await activeItems.json())
				.items.some(({ id }) => id === itemA1),
		).toBe(false);

		const historyItems = await apiRequest(
			`/api/collections/${collectionA1}/items?includeArchived=true`,
			{ userId: users.owner },
		);
		expect(
			itemListResponseSchema
				.parse(await historyItems.json())
				.items.some(({ id }) => id === itemA1),
		).toBe(true);

		const restoredItem = await apiRequest(`/api/items/${itemA1}/restore`, {
			method: "POST",
			userId: users.owner,
		});
		expect(restoredItem.status).toBe(200);

		const archivedCollection = await apiRequest(
			`/api/collections/${collectionA1}/archive`,
			{ method: "POST", userId: users.owner },
		);
		expect(archivedCollection.status).toBe(200);
		const blockedItemCreate = await apiRequest(
			`/api/collections/${collectionA1}/items`,
			{
				body: { title: "Blocked" },
				method: "POST",
				userId: users.owner,
			},
		);
		expect(blockedItemCreate.status).toBe(409);

		const restoredCollection = await apiRequest(
			`/api/collections/${collectionA1}/restore`,
			{ method: "POST", userId: users.owner },
		);
		expect(restoredCollection.status).toBe(200);

		const archivedWorkspace = await apiRequest(
			`/api/workspaces/${workspaceA}/archive`,
			{ method: "POST", userId: users.owner },
		);
		expect(archivedWorkspace.status).toBe(200);
		const blockedCollectionCreate = await apiRequest(
			`/api/workspaces/${workspaceA}/collections`,
			{
				body: { name: "Blocked" },
				method: "POST",
				userId: users.owner,
			},
		);
		expect(blockedCollectionCreate.status).toBe(409);

		const nestedRead = await apiRequest(`/api/items/${itemA1}`, {
			userId: users.owner,
		});
		expect(nestedRead.status).toBe(200);

		const restoredWorkspace = await apiRequest(
			`/api/workspaces/${workspaceA}/restore`,
			{ method: "POST", userId: users.owner },
		);
		expect(restoredWorkspace.status).toBe(200);
	});
});

describe("Collection Brief and text Concept", () => {
  it("persists a structured Brief and exposes editor permissions", async () => {
    const saved = await apiRequest(`/api/collections/${collectionA1}/brief`, {
      body: {
        title: "  Quiet Japanese-modern home  ",
        description: "  Natural materials and low visual noise.  ",
        keywords: ["Japandi", "calm"],
        materials: ["oak", "linen"],
        preferredBrands: ["IKEA", "Loods 5"],
        intendedUse: "  A coherent everyday home.  ",
        requirements: "  Durable and easy to maintain.  ",
        thingsToAvoid: "  Glossy finishes.  ",
        referenceUrls: ["https://example.com/reference"],
        budget: { minor: 215_000, currency: "EUR" },
        colorPreference: {
          core: [
            {
              hex: "#d8c7ad",
              label: "Warm oak",
              usageNote: "Main wood",
            },
            { hex: "#334455", label: null, usageNote: null },
          ],
          supporting: [
            {
              hex: "#f4f0e8",
              label: "Paper",
              usageNote: "Walls and lamps",
            },
          ],
        },
      },
      method: "PUT",
      userId: users.editor,
    });
    expect(saved.status).toBe(200);
    const savedBody = collectionBriefResponseSchema.parse(await saved.json());
    expect(savedBody.permissions.canEdit).toBe(true);
    expect(savedBody.brief).toMatchObject({
      title: "Quiet Japanese-modern home",
      description: "Natural materials and low visual noise.",
      budget: { minor: 215_000, currency: "EUR" },
      colorPreference: {
        core: [
          { hex: "#D8C7AD", label: "Warm oak", usageNote: "Main wood" },
          { hex: "#334455", label: null, usageNote: null },
        ],
        supporting: [
          {
            hex: "#F4F0E8",
            label: "Paper",
            usageNote: "Walls and lamps",
          },
        ],
      },
    });

    const viewerRead = await apiRequest(
      `/api/collections/${collectionA1}/brief`,
      { userId: users.viewer },
    );
    expect(viewerRead.status).toBe(200);
    const viewerBody = collectionBriefResponseSchema.parse(
      await viewerRead.json(),
    );
    expect(viewerBody.permissions.canEdit).toBe(false);
    expect(viewerBody.brief?.keywords).toEqual(["Japandi", "calm"]);
  });

  it("enforces palette, URL, currency, and role validation", async () => {
    const base = {
      title: null,
      description: null,
      keywords: [],
      materials: [],
      preferredBrands: [],
      intendedUse: null,
      requirements: null,
      thingsToAvoid: null,
      referenceUrls: [],
      budget: null,
      colorPreference: { core: [], supporting: [] },
    };

    const duplicate = await apiRequest(
      `/api/collections/${collectionA1}/brief`,
      {
        body: {
          ...base,
          colorPreference: {
            core: [{ hex: "#ABCDEF", label: null, usageNote: null }],
            supporting: [{ hex: "#abcdef", label: null, usageNote: null }],
          },
        },
        method: "PUT",
        userId: users.editor,
      },
    );
    expect(duplicate.status).toBe(400);

    const seventh = await apiRequest(`/api/collections/${collectionA1}/brief`, {
      body: {
        ...base,
        colorPreference: {
          core: Array.from({ length: 7 }, (_, index) => ({
            hex: `#00000${index}`,
            label: null,
            usageNote: null,
          })),
          supporting: [],
        },
      },
      method: "PUT",
      userId: users.editor,
    });
    expect(seventh.status).toBe(400);

    const insecureReference = await apiRequest(
      `/api/collections/${collectionA1}/brief`,
      {
        body: { ...base, referenceUrls: ["http://example.com/reference"] },
        method: "PUT",
        userId: users.editor,
      },
    );
    expect(insecureReference.status).toBe(400);

    const otherCurrency = await apiRequest(
      `/api/collections/${collectionA1}/brief`,
      {
        body: { ...base, budget: { minor: 100, currency: "USD" } },
        method: "PUT",
        userId: users.editor,
      },
    );
    expect(otherCurrency.status).toBe(400);

    const contributor = await apiRequest(
      `/api/collections/${collectionA1}/brief`,
      {
        body: base,
        method: "PUT",
        userId: users.contributor,
      },
    );
    expect(contributor.status).toBe(403);
  });

  it("creates, updates, reads, and removes one active text Concept", async () => {
    const created = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      {
        body: {
          title: "  Japanese-modern home  ",
          narrative: "  Warm wood, paper light, and quiet lines.  ",
        },
        method: "PUT",
        userId: users.editor,
      },
    );
    expect(created.status).toBe(200);
    const createdBody = conceptResponseSchema.parse(await created.json());
    expect(createdBody.concept).toMatchObject({
      title: "Japanese-modern home",
      narrative: "Warm wood, paper light, and quiet lines.",
    });

    const viewerRead = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      { userId: users.viewer },
    );
    expect(viewerRead.status).toBe(200);
    const viewerBody = conceptResponseSchema.parse(await viewerRead.json());
    expect(viewerBody.permissions.canEdit).toBe(false);
    expect(viewerBody.concept?.id).toBe(createdBody.concept?.id);

    const updated = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      {
        body: {
          title: "Japanese-modern apartment",
          narrative: "Low forms, warm oak, linen, and restrained contrast.",
        },
        method: "PUT",
        userId: users.editor,
      },
    );
    const updatedBody = conceptResponseSchema.parse(await updated.json());
    expect(updatedBody.concept?.id).toBe(createdBody.concept?.id);

    const denied = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      {
        body: { title: "Denied", narrative: "Contributors cannot do this." },
        method: "PUT",
        userId: users.contributor,
      },
    );
    expect(denied.status).toBe(403);

    const removed = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      { method: "DELETE", userId: users.editor },
    );
    expect(removed.status).toBe(200);
    expect(
      conceptResponseSchema.parse(await removed.json()).concept,
    ).toBeNull();

    const absent = await apiRequest(
      `/api/collections/${collectionA1}/concept`,
      { userId: users.viewer },
    );
    expect(conceptResponseSchema.parse(await absent.json()).concept).toBeNull();
  });
});
