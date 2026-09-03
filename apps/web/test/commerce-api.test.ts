import { env, exports } from "cloudflare:workers";
import {
	collectionRollupResponseSchema,
	itemComparisonResponseSchema,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "commerce-workspace";
const otherWorkspaceId = "commerce-other-workspace";
const collectionId = "commerce-collection";
const siblingCollectionId = "commerce-sibling-collection";
const otherCollectionId = "commerce-other-collection";
const exactItemId = "commerce-item-exact";
const lowerBoundItemId = "commerce-item-lower-bound";
const incompleteItemId = "commerce-item-incomplete";
const candidateOnlyItemId = "commerce-item-candidate-only";
const unplannedItemId = "commerce-item-unplanned";
const siblingItemId = "commerce-sibling-item";
const otherItemId = "commerce-other-item";
const otherMerchantId = "commerce-other-merchant";

const users = {
	owner: "commerce-owner",
	otherOwner: "commerce-other-owner",
	editor: "commerce-editor",
	contributor: "commerce-contributor",
	collectionContributor: "commerce-collection-contributor",
	viewer: "commerce-viewer",
	outsider: "commerce-outsider",
} as const;

type TestUserId = (typeof users)[keyof typeof users];

const userDetails: readonly {
	id: TestUserId;
	email: string;
	name: string;
}[] = Object.entries(users).map(([name, id]) => ({
	id,
	email: `${name}@example.com`,
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
		method?: string;
		origin?: string;
		userId?: TestUserId;
	},
): Promise<Response> {
	const headers = new Headers();
	if (options?.body !== undefined) headers.set("content-type", "application/json");
	headers.set("origin", options?.origin ?? "http://example.com");
	if (options?.userId !== undefined) {
		headers.set("cookie", await signedSessionCookie(options.userId));
	}

	return exports.default.fetch(
		new Request(`http://example.com${path}`, {
			body: options?.body === undefined ? undefined : JSON.stringify(options.body),
			headers,
			method: options?.method ?? "GET",
		}),
	);
}

async function resetFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare(
			"delete from workspaces where id in (?1, ?2)",
		).bind(workspaceId, otherWorkspaceId),
		env.DB.prepare("delete from user where id like 'commerce-%'"),
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
		).bind(workspaceId, "Apartment", users.owner, now),
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?4)",
		).bind(otherWorkspaceId, "Other", users.otherOwner, now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("commerce-membership-owner", workspaceId, users.owner, "owner", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"commerce-membership-other-owner",
			otherWorkspaceId,
			users.otherOwner,
			"owner",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("commerce-membership-editor", workspaceId, users.editor, "editor", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"commerce-membership-contributor",
			workspaceId,
			users.contributor,
			"contributor",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("commerce-membership-viewer", workspaceId, users.viewer, "viewer", now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(collectionId, workspaceId, "New apartment", users.owner, now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			siblingCollectionId,
			workspaceId,
			"Sibling collection",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			otherCollectionId,
			otherWorkspaceId,
			"Other collection",
			users.otherOwner,
			now,
		),
		env.DB.prepare(
			"insert into collection_briefs (id, collection_id, title, budget_minor, budget_currency, created_at, updated_at) values (?1, ?2, ?3, ?4, 'EUR', ?5, ?5)",
		).bind("commerce-brief", collectionId, "Calm home", 25_000, now),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'contributor', ?4, ?4)",
		).bind(
			"commerce-membership-collection-contributor",
			collectionId,
			users.collectionContributor,
			now,
		),
	);

	for (const [id, title, groupLabel] of [
		[exactItemId, "Dining chairs", "Bedroom"],
		[lowerBoundItemId, "Roller blind", "Bedroom"],
		[incompleteItemId, "Floor lamp", "Living room"],
		[candidateOnlyItemId, "Coffee table", "Living room"],
		[unplannedItemId, "Sofa", "Living room"],
	] as const) {
		statements.push(
			env.DB.prepare(
				"insert into items (id, workspace_id, collection_id, title, group_label, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
			).bind(id, workspaceId, collectionId, title, groupLabel, users.owner, now),
		);
	}

	statements.push(
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			siblingItemId,
			workspaceId,
			siblingCollectionId,
			"Shared Product Item",
			users.owner,
			now,
		),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
		).bind(
			otherItemId,
			otherWorkspaceId,
			otherCollectionId,
			"Other item",
			users.otherOwner,
			now,
		),
		env.DB.prepare(
			"insert into merchants (id, workspace_id, name, sales_channel, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, 'online', ?4, ?5, ?5)",
		).bind(
			otherMerchantId,
			otherWorkspaceId,
			"Other merchant",
			users.otherOwner,
			now,
		),
	);

	await env.DB.batch(statements);
}

function newProduct(title: string) {
	return {
		kind: "new" as const,
		value: {
			title,
			brand: null,
			model: null,
			category: "Furniture",
			attributes: [],
		},
	};
}

function offerFacts(input: {
	availabilityState?: "available" | "unavailable" | "unknown";
	currency?: string | null;
	priceKind: "exact" | "starting_at" | "unknown";
	shippingBasis: "per_line" | "per_unit" | "unknown";
	shippingMinor?: number | null;
	unitPriceMinor?: number | null;
}) {
	return {
		priceKind: input.priceKind,
		unitPriceMinor: input.unitPriceMinor ?? null,
		currency: input.currency ?? null,
		shippingMinor: input.shippingMinor ?? null,
		shippingBasis: input.shippingBasis,
		availabilityState: input.availabilityState ?? "available",
		availabilityChannel: "online",
		availabilityLocation: "Amsterdam",
		availabilityVariant: null,
		availabilityNote: null,
	};
}

async function createCandidate(
	itemId: string,
	title: string,
	userId: TestUserId = users.owner,
) {
	const response = await apiRequest(`/api/items/${itemId}/candidates`, {
		body: {
			product: newProduct(title),
			plannedPurchaseQuantity: 1,
			notes: null,
			rank: null,
		},
		method: "POST",
		userId,
	});
	expect(response.status).toBe(201);
	const comparison = itemComparisonResponseSchema.parse(await response.json());
	return comparison.candidates.find(
		(candidate) => candidate.product.title === title,
	)!;
}

beforeEach(resetFixture);

describe("Task 7 commerce workflow", () => {
	it("compares Candidates and Offers, rolls up honest totals, and records partial purchases", async () => {
		const exactCandidate = await createCandidate(
			exactItemId,
			"LISABO chair",
		);
		await createCandidate(exactItemId, "Alternative chair");

		const merchantResponse = await apiRequest(
			`/api/items/${exactItemId}/merchants`,
			{
				body: {
					name: "IKEA Netherlands",
					salesChannel: "both",
					websiteUrl: "https://www.ikea.com/nl/en/",
					notes: "Online and physical shops",
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(merchantResponse.status).toBe(201);
		const merchant = itemComparisonResponseSchema
			.parse(await merchantResponse.json())
			.merchants.find(({ name }) => name === "IKEA Netherlands")!;

		const secondMerchantResponse = await apiRequest(
			`/api/items/${exactItemId}/merchants`,
			{
				body: {
					name: "JYSK",
					salesChannel: "both",
					websiteUrl: "https://jysk.nl/",
					notes: null,
				},
				method: "POST",
				userId: users.owner,
			},
		);
		const secondMerchant = itemComparisonResponseSchema
			.parse(await secondMerchantResponse.json())
			.merchants.find(({ name }) => name === "JYSK")!;

		const staleObservedAt = "2026-01-01T12:00:00.000Z";
		const exactOfferResponse = await apiRequest(
			`/api/items/${exactItemId}/candidates/${exactCandidate.id}/offers`,
			{
				body: {
					merchantId: merchant.id,
					sourceUrl: "https://www.ikea.com/nl/en/p/lisabo-chair/",
					locale: "nl-NL",
					facts: offerFacts({
						priceKind: "exact",
						unitPriceMinor: 5_999,
						currency: "EUR",
						shippingMinor: 500,
						shippingBasis: "per_line",
						availabilityState: "unavailable",
					}),
					observedAt: staleObservedAt,
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(exactOfferResponse.status).toBe(201);
		let exactComparison = itemComparisonResponseSchema.parse(
			await exactOfferResponse.json(),
		);
		let exactOffer = exactComparison.candidates
			.find(({ id }) => id === exactCandidate.id)!
			.offers.find(({ merchant: { id } }) => id === merchant.id)!;
		expect(exactOffer).toMatchObject({
			freshness: "stale",
			facts: { availabilityState: "unavailable" },
			plannedCost: {
				status: "exact",
				merchandiseMinor: 5_999,
				shippingMinor: 500,
				totalMinor: 6_499,
			},
		});
		expect(exactOffer.priceChecks).toHaveLength(1);

		const secondOfferResponse = await apiRequest(
			`/api/items/${exactItemId}/candidates/${exactCandidate.id}/offers`,
			{
				body: {
					merchantId: secondMerchant.id,
					sourceUrl: "https://jysk.nl/eetkamer/eetkamerstoelen/example",
					locale: "nl-NL",
					facts: offerFacts({
						priceKind: "exact",
						unitPriceMinor: 6_200,
						currency: "EUR",
						shippingMinor: 200,
						shippingBasis: "per_unit",
					}),
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(secondOfferResponse.status).toBe(201);
		expect(
			itemComparisonResponseSchema
				.parse(await secondOfferResponse.json())
				.candidates.find(({ id }) => id === exactCandidate.id)!.offers,
		).toHaveLength(2);

		const lowerCandidate = await createCandidate(
			lowerBoundItemId,
			"LÅNGDANS blind",
		);
		const lowerOfferResponse = await apiRequest(
			`/api/items/${lowerBoundItemId}/candidates/${lowerCandidate.id}/offers`,
			{
				body: {
					merchantId: merchant.id,
					sourceUrl: "https://www.ikea.com/nl/en/p/langdans-roller-blind/",
					locale: "nl-NL",
					facts: offerFacts({
						priceKind: "starting_at",
						unitPriceMinor: 2_299,
						currency: "EUR",
						shippingMinor: 100,
						shippingBasis: "per_unit",
					}),
				},
				method: "POST",
				userId: users.owner,
			},
		);
		const lowerOffer = itemComparisonResponseSchema
			.parse(await lowerOfferResponse.json())
			.candidates.find(({ id }) => id === lowerCandidate.id)!.offers[0]!;

		const incompleteCandidate = await createCandidate(
			incompleteItemId,
			"Bamboo lamp",
		);
		const incompleteOfferResponse = await apiRequest(
			`/api/items/${incompleteItemId}/candidates/${incompleteCandidate.id}/offers`,
			{
				body: {
					merchantId: merchant.id,
					sourceUrl: "https://www.ikea.com/nl/en/p/bamboo-lamp/",
					locale: "nl-NL",
					facts: offerFacts({
						priceKind: "unknown",
						shippingBasis: "unknown",
						availabilityState: "unknown",
					}),
				},
				method: "POST",
				userId: users.owner,
			},
		);
		const incompleteOffer = itemComparisonResponseSchema
			.parse(await incompleteOfferResponse.json())
			.candidates.find(({ id }) => id === incompleteCandidate.id)!.offers[0]!;
		const candidateOnly = await createCandidate(
			candidateOnlyItemId,
			"JAKOBSFORS table",
		);

		for (const selection of [
			{
				itemId: exactItemId,
				candidateId: exactCandidate.id,
				offerId: exactOffer.id,
				plannedPurchaseQuantity: 2,
			},
			{
				itemId: lowerBoundItemId,
				candidateId: lowerCandidate.id,
				offerId: lowerOffer.id,
				plannedPurchaseQuantity: 3,
			},
			{
				itemId: incompleteItemId,
				candidateId: incompleteCandidate.id,
				offerId: incompleteOffer.id,
				plannedPurchaseQuantity: 1,
			},
			{
				itemId: candidateOnlyItemId,
				candidateId: candidateOnly.id,
				offerId: null,
				plannedPurchaseQuantity: 1,
			},
		]) {
			const response = await apiRequest(`/api/items/${selection.itemId}/plan`, {
				body: {
					candidateId: selection.candidateId,
					offerId: selection.offerId,
					plannedPurchaseQuantity: selection.plannedPurchaseQuantity,
				},
				method: "PUT",
				userId: users.owner,
			});
			expect(response.status).toBe(200);
			itemComparisonResponseSchema.parse(await response.json());
		}

		const rollupResponse = await apiRequest(
			`/api/collections/${collectionId}/planned-cost`,
			{ userId: users.viewer },
		);
		expect(rollupResponse.status).toBe(200);
		const rollup = collectionRollupResponseSchema.parse(
			await rollupResponse.json(),
		);
		expect(rollup.summary).toEqual({
			status: "incomplete",
			currency: "EUR",
			merchandiseMinor: 18_895,
			shippingMinor: 800,
			totalMinor: 19_695,
			completeLineCount: 2,
			incompleteLineCount: 2,
			currencyMismatchLineCount: 0,
			unplannedLineCount: 1,
		});
		expect(rollup.budget).toEqual({ minor: 25_000, currency: "EUR" });
		expect(rollup.budgetComparison).toEqual({
			status: "incomplete",
			differenceMinor: null,
		});
		expect(
			rollup.groups.find(({ groupLabel }) => groupLabel === "Bedroom")?.summary,
		).toMatchObject({ status: "lower_bound", totalMinor: 19_695 });
		expect(
			rollup.lines.find(({ itemId }) => itemId === incompleteItemId)?.state,
		).toBe("incomplete");
		expect(
			rollup.lines.find(({ itemId }) => itemId === candidateOnlyItemId),
		).toMatchObject({
			candidateId: candidateOnly.id,
			offerId: null,
			state: "incomplete",
		});
		expect(
			rollup.lines.find(({ itemId }) => itemId === unplannedItemId)?.state,
		).toBe("unplanned");

		const editorPurchase = await apiRequest(
			`/api/items/${exactItemId}/purchases`,
			{
				body: {
					candidateId: exactCandidate.id,
					offerId: exactOffer.id,
					purchasedQuantity: 1,
					unitPriceMinor: 5_999,
					currency: "EUR",
					shippingMinor: 500,
					shippingBasis: "per_line",
					note: null,
				},
				method: "POST",
				userId: users.editor,
			},
		);
		expect(editorPurchase.status).toBe(403);

		for (const note of ["First two chairs", "Remaining two chairs"]) {
			const purchaseResponse = await apiRequest(
				`/api/items/${exactItemId}/purchases`,
				{
					body: {
						candidateId: exactCandidate.id,
						offerId: exactOffer.id,
						purchasedQuantity: 1,
						unitPriceMinor: 5_999,
						currency: "EUR",
						shippingMinor: 500,
						shippingBasis: "per_line",
						note,
					},
					method: "POST",
					userId: users.owner,
				},
			);
			expect(purchaseResponse.status).toBe(201);
			exactComparison = itemComparisonResponseSchema.parse(
				await purchaseResponse.json(),
			);
		}

		const purchasedCandidate = exactComparison.candidates.find(
			({ id }) => id === exactCandidate.id,
		)!;
		expect(purchasedCandidate.purchasedQuantity).toBe(2);
		expect(purchasedCandidate.purchases).toHaveLength(2);
		expect(purchasedCandidate.purchases[0]?.purchase).toMatchObject({
			candidateId: exactCandidate.id,
			offerId: exactOffer.id,
			purchasedQuantity: 1,
			unitPriceMinor: 5_999,
			currency: "EUR",
			merchandiseTotalMinor: 5_999,
			shippingTotalMinor: 500,
			totalMinor: 6_499,
		});

		const item = await env.DB.prepare("select status from items where id = ?1")
			.bind(exactItemId)
			.first<{ status: string }>();
		expect(item?.status).toBe("idea");
		const events = await env.DB.prepare(
			"select kind from decision_events where item_id = ?1 order by created_at, id",
		)
			.bind(exactItemId)
			.all<{ kind: string }>();
		expect(events.results.map(({ kind }) => kind)).toEqual([
			"planned_candidate_changed",
			"purchase_recorded",
			"purchase_recorded",
		]);
		exactOffer = purchasedCandidate.offers.find(({ id }) => id === exactOffer.id)!;
		expect(exactOffer.priceChecks).toHaveLength(3);
		await expect(
			env.DB.prepare("update price_checks set unit_price_minor = 1 where id = ?1")
				.bind(exactOffer.priceChecks[0]!.id)
				.run(),
		).rejects.toThrow(/price_checks are immutable/);
	});

	it("derives commerce permissions from membership and rejects cross-scope identifiers", async () => {
		const viewerRead = await apiRequest(
			`/api/items/${exactItemId}/comparison`,
			{ userId: users.viewer },
		);
		expect(viewerRead.status).toBe(200);
		expect(
			itemComparisonResponseSchema.parse(await viewerRead.json()).permissions,
		).toEqual({
			canManageCandidates: false,
			canArchiveCandidates: false,
				canManageProducts: false,
				canManageOffers: false,
				canRefreshOffers: false,
				canRecordPurchase: false,
			canViewWorkspaceCatalog: true,
		});

		const viewerCreate = await apiRequest(
			`/api/items/${exactItemId}/candidates`,
			{
				body: {
					product: newProduct("Blocked product"),
					plannedPurchaseQuantity: 1,
					notes: null,
					rank: null,
				},
				method: "POST",
				userId: users.viewer,
			},
		);
		expect(viewerCreate.status).toBe(403);

		const candidate = await createCandidate(
			exactItemId,
			"Contributor product",
			users.contributor,
		);
		const merchantResponse = await apiRequest(
			`/api/items/${exactItemId}/merchants`,
			{
				body: {
					name: "Contributor merchant",
					salesChannel: "online",
					websiteUrl: "https://example.com/",
					notes: null,
				},
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(merchantResponse.status).toBe(201);
		const merchant = itemComparisonResponseSchema
			.parse(await merchantResponse.json())
			.merchants.find(({ name }) => name === "Contributor merchant")!;

		const crossWorkspaceOffer = await apiRequest(
			`/api/items/${exactItemId}/candidates/${candidate.id}/offers`,
			{
				body: {
					merchantId: otherMerchantId,
					sourceUrl: "https://example.com/wrong-scope",
					locale: null,
					facts: offerFacts({
						priceKind: "exact",
						unitPriceMinor: 1_000,
						currency: "EUR",
						shippingMinor: 0,
						shippingBasis: "per_line",
					}),
				},
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(crossWorkspaceOffer.status).toBe(404);

		const offerResponse = await apiRequest(
			`/api/items/${exactItemId}/candidates/${candidate.id}/offers`,
			{
				body: {
					merchantId: merchant.id,
					sourceUrl: "https://example.com/product",
					locale: null,
					facts: offerFacts({
						priceKind: "exact",
						unitPriceMinor: 1_000,
						currency: "EUR",
						shippingMinor: 0,
						shippingBasis: "per_line",
					}),
				},
				method: "POST",
				userId: users.contributor,
			},
		);
		expect(offerResponse.status).toBe(201);
		const offer = itemComparisonResponseSchema
			.parse(await offerResponse.json())
			.candidates.find(({ id }) => id === candidate.id)!.offers[0]!;

		const siblingCandidateResponse = await apiRequest(
			`/api/items/${siblingItemId}/candidates`,
			{
				body: {
					product: {
						kind: "existing",
						productId: candidate.product.id,
					},
					plannedPurchaseQuantity: 1,
					notes: null,
					rank: null,
				},
				method: "POST",
				userId: users.owner,
			},
		);
		expect(siblingCandidateResponse.status).toBe(201);

		const collectionOnlyRead = await apiRequest(
			`/api/items/${exactItemId}/comparison`,
			{ userId: users.collectionContributor },
		);
		expect(collectionOnlyRead.status).toBe(200);
		expect(
			itemComparisonResponseSchema.parse(await collectionOnlyRead.json())
				.permissions,
		).toMatchObject({
			canManageOffers: true,
			canViewWorkspaceCatalog: false,
		});

		const collectionMerchantResponse = await apiRequest(
			`/api/items/${exactItemId}/merchants`,
			{
				body: {
					name: "Collection-only merchant",
					salesChannel: "in_person",
					websiteUrl: null,
					notes: null,
				},
				method: "POST",
				userId: users.collectionContributor,
			},
		);
		expect(collectionMerchantResponse.status).toBe(201);
		const collectionMerchant = itemComparisonResponseSchema
			.parse(await collectionMerchantResponse.json())
			.merchants.find(({ name }) => name === "Collection-only merchant")!;
		const sharedProductOffer = await apiRequest(
			`/api/items/${exactItemId}/candidates/${candidate.id}/offers`,
			{
				body: {
					merchantId: collectionMerchant.id,
					sourceUrl: "https://example.com/shared-product",
					locale: null,
					facts: offerFacts({
						priceKind: "exact",
						unitPriceMinor: 900,
						currency: "EUR",
						shippingMinor: 0,
						shippingBasis: "per_line",
					}),
				},
				method: "POST",
				userId: users.collectionContributor,
			},
		);
		expect(sharedProductOffer.status).toBe(403);

		const planResponse = await apiRequest(`/api/items/${exactItemId}/plan`, {
			body: {
				candidateId: candidate.id,
				offerId: offer.id,
				plannedPurchaseQuantity: 1,
			},
			method: "PUT",
			userId: users.contributor,
		});
		expect(planResponse.status).toBe(200);

		const editorPurchase = await apiRequest(
			`/api/items/${exactItemId}/purchases`,
			{
				body: {
					candidateId: candidate.id,
					offerId: offer.id,
					purchasedQuantity: 1,
					unitPriceMinor: 1_000,
					currency: "EUR",
					shippingMinor: 0,
					shippingBasis: "per_line",
					note: null,
				},
				method: "POST",
				userId: users.editor,
			},
		);
		expect(editorPurchase.status).toBe(403);

		const outsiderRead = await apiRequest(
			`/api/items/${exactItemId}/comparison`,
			{ userId: users.outsider },
		);
		expect(outsiderRead.status).toBe(404);
		const untrustedMutation = await apiRequest(
			`/api/items/${exactItemId}/candidates`,
			{
				body: {
					product: newProduct("Cross-site product"),
					plannedPurchaseQuantity: 1,
					notes: null,
					rank: null,
				},
				method: "POST",
				origin: "https://attacker.example",
				userId: users.owner,
			},
		);
		expect(untrustedMutation.status).toBe(403);
	});
});
