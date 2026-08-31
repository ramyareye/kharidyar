import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const userId = "test-user";
const workspaceId = "test-workspace";
const collectionId = "test-collection";
const itemId = "test-item";
const firstProductId = "test-product-a";
const secondProductId = "test-product-b";
const firstOfferId = "test-offer-a";
const secondOfferId = "test-offer-b";

async function insertPlanningFixture(): Promise<void> {
	const now = Date.now();

	await env.DB.batch([
    env.DB.prepare("insert into user (id, name, email) values (?, ?, ?)").bind(
      userId,
      "Test User",
      "test@example.com",
    ),
		env.DB.prepare(
			"insert into workspaces (id, name, created_by_user_id) values (?, ?, ?)",
		).bind(workspaceId, "Test Workspace", userId),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id) values (?, ?, ?, ?)",
		).bind(collectionId, workspaceId, "Test Collection", userId),
		env.DB.prepare(
			"insert into items (id, workspace_id, collection_id, title, quantity_needed, created_by_user_id) values (?, ?, ?, ?, ?, ?)",
		).bind(itemId, workspaceId, collectionId, "Dining chairs", 4, userId),
		env.DB.prepare(
			"insert into products (id, workspace_id, title, created_by_user_id) values (?, ?, ?, ?)",
		).bind(firstProductId, workspaceId, "Chair A", userId),
		env.DB.prepare(
			"insert into products (id, workspace_id, title, created_by_user_id) values (?, ?, ?, ?)",
		).bind(secondProductId, workspaceId, "Chair B", userId),
		env.DB.prepare(
			"insert into offers (id, workspace_id, product_id, seller_name, source_url, price_kind, unit_price_minor, currency, shipping_minor, shipping_basis, availability_state, last_checked_at, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind(
			firstOfferId,
			workspaceId,
			firstProductId,
			"Seller A",
			"https://example.com/a",
			"exact",
			5_999,
			"EUR",
			500,
			"per_line",
			"available",
			now,
			userId,
		),
		env.DB.prepare(
			"insert into offers (id, workspace_id, product_id, seller_name, source_url, price_kind, unit_price_minor, currency, shipping_minor, shipping_basis, availability_state, last_checked_at, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind(
			secondOfferId,
			workspaceId,
			secondProductId,
			"Seller B",
			"https://example.com/b",
			"starting_at",
			4_999,
			"EUR",
			0,
			"per_unit",
			"unknown",
			now,
			userId,
		),
	]);
}

async function resetPlanningFixture(): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("delete from workspaces where id = ?").bind(workspaceId),
		env.DB.prepare("delete from user where id = ?").bind(userId),
	]);

	await insertPlanningFixture();
}

describe("D1 migration workflow", () => {
	it("is a no-op when the same migrations are applied twice", async () => {
		const before = await env.DB.prepare(
			"select count(*) as count from d1_migrations",
		).first<{ count: number }>();

		await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

		const after = await env.DB.prepare(
			"select count(*) as count from d1_migrations",
		).first<{ count: number }>();

		expect(before?.count).toBe(env.TEST_MIGRATIONS.length);
		expect(after?.count).toBe(before?.count);
	});
});

describe("planning schema constraints", () => {
	beforeEach(resetPlanningFixture);

	it("stores Item need and Candidate purchase quantities independently", async () => {
		await env.DB.prepare(
			"insert into item_candidates (id, workspace_id, item_id, product_id, planned_purchase_quantity, is_planned, planned_offer_id, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"candidate-a",
				workspaceId,
				itemId,
				firstProductId,
				2,
				1,
				firstOfferId,
				userId,
			)
			.run();

		const result = await env.DB.prepare(
			"select items.quantity_needed as needed, item_candidates.planned_purchase_quantity as planned from items join item_candidates on item_candidates.item_id = items.id where items.id = ?",
		)
			.bind(itemId)
			.first<{ needed: number; planned: number }>();

		expect(result).toEqual({ needed: 4, planned: 2 });
	});

	it("rejects non-positive or fractional Item and Candidate quantities", async () => {
		await expect(
      env.DB.prepare("update items set quantity_needed = 0 where id = ?")
				.bind(itemId)
				.run(),
		).rejects.toThrow(/items_quantity_needed_check/);

		await expect(
      env.DB.prepare("update items set quantity_needed = 1.5 where id = ?")
				.bind(itemId)
				.run(),
		).rejects.toThrow(/items_quantity_needed_check/);

		await expect(
			env.DB.prepare(
				"insert into item_candidates (id, workspace_id, item_id, product_id, planned_purchase_quantity, created_by_user_id) values (?, ?, ?, ?, ?, ?)",
			)
        .bind("candidate-zero", workspaceId, itemId, firstProductId, 0, userId)
				.run(),
		).rejects.toThrow(/item_candidates_planned_quantity_check/);

		await expect(
			env.DB.prepare(
				"insert into item_candidates (id, workspace_id, item_id, product_id, planned_purchase_quantity, created_by_user_id) values (?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"candidate-fractional",
					workspaceId,
					itemId,
					firstProductId,
					1.5,
					userId,
				)
				.run(),
		).rejects.toThrow(/item_candidates_planned_quantity_check/);
	});

	it("enforces Item requirements and Decision Event payload shapes", async () => {
		await expect(
			env.DB.prepare("update items set requirements = '   ' where id = ?")
				.bind(itemId)
				.run(),
		).rejects.toThrow(/items_requirements_length_check/);

		await expect(
			env.DB.prepare(
				"insert into decision_events (id, item_id, kind, actor_user_id) values (?, ?, ?, ?)",
			)
				.bind("invalid-details", itemId, "item_details_updated", userId)
				.run(),
		).rejects.toThrow(/decision_events_payload_check/);

		await expect(
			env.DB.prepare(
				"insert into decision_events (id, item_id, kind, actor_user_id, from_status, to_status, transition_kind) values (?, ?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"invalid-status",
					itemId,
					"item_status_changed",
					userId,
					"idea",
					"idea",
					"progression",
				)
				.run(),
		).rejects.toThrow(/decision_events_payload_check/);

		await expect(
			env.DB.prepare(
				"insert into decision_events (id, item_id, kind, actor_user_id, from_status, to_status, transition_kind, note) values (?, ?, ?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"blank-note",
					itemId,
					"item_status_changed",
					userId,
					"idea",
					"skipped",
					"alternate",
					"   ",
				)
				.run(),
		).rejects.toThrow(/decision_events_note_check/);

		await env.DB.prepare(
			"insert into decision_events (id, item_id, kind, actor_user_id, from_status, to_status, transition_kind, note) values (?, ?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"valid-status",
				itemId,
				"item_status_changed",
				userId,
				"idea",
				"researching",
				"progression",
				"Explicit human decision",
			)
			.run();
		await expect(
			env.DB.prepare("update decision_events set note = ? where id = ?")
				.bind("Rewritten", "valid-status")
				.run(),
		).rejects.toThrow(/decision_events are immutable/);
	});

	it("requires a planned Offer to belong to the Candidate Product", async () => {
		await expect(
			env.DB.prepare(
				"insert into item_candidates (id, workspace_id, item_id, product_id, is_planned, planned_offer_id, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"candidate-wrong-offer",
					workspaceId,
					itemId,
					firstProductId,
					1,
					secondOfferId,
					userId,
				)
				.run(),
		).rejects.toThrow(/FOREIGN KEY constraint failed/);
	});

	it("allows only one active planned Candidate per Item", async () => {
		await env.DB.prepare(
			"insert into item_candidates (id, workspace_id, item_id, product_id, is_planned, planned_offer_id, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"candidate-planned-a",
				workspaceId,
				itemId,
				firstProductId,
				1,
				firstOfferId,
				userId,
			)
			.run();

		await expect(
			env.DB.prepare(
				"insert into item_candidates (id, workspace_id, item_id, product_id, is_planned, planned_offer_id, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"candidate-planned-b",
					workspaceId,
					itemId,
					secondProductId,
					1,
					secondOfferId,
					userId,
				)
				.run(),
		).rejects.toThrow(/UNIQUE constraint failed/);
	});

	it("rejects inconsistent Offer price semantics", async () => {
		await expect(
			env.DB.prepare(
				"insert into offers (id, workspace_id, product_id, seller_name, source_url, price_kind, shipping_basis, availability_state, last_checked_at, created_by_user_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
				.bind(
					"offer-without-price",
					workspaceId,
					firstProductId,
					"Seller",
					"https://example.com/missing-price",
					"exact",
					"unknown",
					"unknown",
					Date.now(),
					userId,
				)
				.run(),
		).rejects.toThrow(/offers_price_check/);
	});

	it("enforces budget currency and the six-plus-six color palette", async () => {
		await expect(
			env.DB.prepare(
				"insert into collection_briefs (id, collection_id, budget_minor, budget_currency) values (?, ?, ?, ?)",
			)
				.bind("invalid-brief", collectionId, 10_000, "EURO")
				.run(),
		).rejects.toThrow(/collection_briefs_budget_pair_check/);

		await env.DB.prepare(
			"insert into collection_briefs (id, collection_id, budget_minor, budget_currency) values (?, ?, ?, ?)",
		)
			.bind("brief", collectionId, 10_000, "EUR")
			.run();

		await expect(
			env.DB.prepare(
				"insert into collection_brief_colors (id, collection_brief_id, kind, position, hex) values (?, ?, ?, ?, ?)",
			)
				.bind("seventh-core", "brief", "core", 6, "#ABCDEF")
				.run(),
		).rejects.toThrow(/collection_brief_colors_position_check/);

    await env.DB.prepare(
      "insert into collection_brief_colors (id, collection_brief_id, kind, position, hex) values (?, ?, ?, ?, ?)",
    )
      .bind("first-color", "brief", "core", 0, "#ABCDEF")
      .run();
    await expect(
      env.DB.prepare(
        "insert into collection_brief_colors (id, collection_brief_id, kind, position, hex) values (?, ?, ?, ?, ?)",
      )
        .bind("duplicate-color", "brief", "supporting", 0, "#ABCDEF")
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("allows only one active Concept per Collection", async () => {
    await env.DB.prepare(
      "insert into concepts (id, collection_id, title, narrative, created_by_user_id, updated_by_user_id) values (?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "concept-a",
        collectionId,
        "Japanese modern",
        "Warm wood and quiet lines.",
        userId,
        userId,
      )
      .run();

    await expect(
      env.DB.prepare(
        "insert into concepts (id, collection_id, title, narrative, created_by_user_id, updated_by_user_id) values (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "concept-b",
          collectionId,
          "Competing direction",
          "This second active Concept must be rejected.",
          userId,
          userId,
        )
        .run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    await env.DB.prepare("update concepts set archived_at = ? where id = ?")
      .bind(Date.now(), "concept-a")
      .run();
    await expect(
      env.DB.prepare(
        "insert into concepts (id, collection_id, title, narrative, created_by_user_id, updated_by_user_id) values (?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "concept-b",
          collectionId,
          "New direction",
          "A replacement after explicit removal is allowed.",
          userId,
          userId,
        )
        .run(),
    ).resolves.toBeDefined();
	});
});
