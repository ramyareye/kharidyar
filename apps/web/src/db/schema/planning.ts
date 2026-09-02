import {
	availabilityStates,
	decisionEventKinds,
	itemPriorities,
	itemStatuses,
	itemStatusTransitionKinds,
	merchantSalesChannels,
	offerPriceKinds,
	shippingBases,
} from "@kharidyar/domain";
import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";
import { collections, workspaces } from "./collaboration";

export const items = sqliteTable(
	"items",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		requirements: text("requirements"),
		priority: text("priority", { enum: itemPriorities })
			.default("nice_to_have")
			.notNull(),
		status: text("status", { enum: itemStatuses }).default("idea").notNull(),
		quantityNeeded: integer("quantity_needed").default(1).notNull(),
		groupLabel: text("group_label"),
		budgetMinor: integer("budget_minor"),
		budgetCurrency: text("budget_currency"),
		deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		foreignKey({
			name: "items_collection_workspace_fk",
			columns: [table.collectionId, table.workspaceId],
			foreignColumns: [collections.id, collections.workspaceId],
		}).onDelete("cascade"),
		check(
			"items_title_length_check",
			sql`length(trim(${table.title})) between 1 and 200`,
		),
		check(
			"items_requirements_length_check",
			sql`${table.requirements} is null or length(trim(${table.requirements})) between 1 and 4000`,
		),
		check(
			"items_priority_check",
			sql`${table.priority} in ('essential', 'soon', 'nice_to_have')`,
		),
		check(
			"items_status_check",
			sql`${table.status} in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped')`,
		),
		check(
			"items_quantity_needed_check",
			sql`typeof(${table.quantityNeeded}) = 'integer' and ${table.quantityNeeded} between 1 and 9007199254740991`,
		),
		check(
			"items_group_label_check",
			sql`${table.groupLabel} is null or length(trim(${table.groupLabel})) between 1 and 80`,
		),
		check(
			"items_budget_pair_check",
			sql`(
				(${table.budgetMinor} is null and ${table.budgetCurrency} is null)
				or
				(${table.budgetMinor} is not null and typeof(${table.budgetMinor}) = 'integer' and ${table.budgetMinor} between 0 and 9007199254740991 and ${table.budgetCurrency} is not null and length(${table.budgetCurrency}) = 3 and ${table.budgetCurrency} glob '[A-Z][A-Z][A-Z]')
			)`,
		),
		uniqueIndex("items_id_workspace_uidx").on(table.id, table.workspaceId),
		index("items_collection_status_idx").on(table.collectionId, table.status),
		index("items_collection_group_idx").on(
			table.collectionId,
			table.groupLabel,
		),
	],
);

export const decisionEvents = sqliteTable(
	"decision_events",
	{
		id: text("id").primaryKey(),
		itemId: text("item_id")
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: decisionEventKinds }).notNull(),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		beforeSnapshotJson: text("before_snapshot_json"),
		afterSnapshotJson: text("after_snapshot_json"),
		fromStatus: text("from_status", { enum: itemStatuses }),
		toStatus: text("to_status", { enum: itemStatuses }),
		transitionKind: text("transition_kind", {
			enum: itemStatusTransitionKinds,
		}),
		note: text("note"),
		candidateId: text("candidate_id"),
		offerId: text("offer_id"),
		priceCheckId: text("price_check_id"),
		purchasedQuantity: integer("purchased_quantity"),
		purchaseSnapshotJson: text("purchase_snapshot_json"),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"decision_events_kind_check",
			sql`${table.kind} in ('item_details_updated', 'item_status_changed', 'planned_candidate_changed', 'purchase_recorded')`,
		),
		check(
			"decision_events_payload_check",
			sql`(
				(${table.kind} = 'item_details_updated'
					and ${table.beforeSnapshotJson} is not null
					and ${table.afterSnapshotJson} is not null
					and ${table.fromStatus} is null
					and ${table.toStatus} is null
					and ${table.transitionKind} is null
					and ${table.note} is null
					and ${table.candidateId} is null
					and ${table.offerId} is null
					and ${table.priceCheckId} is null
					and ${table.purchasedQuantity} is null
					and ${table.purchaseSnapshotJson} is null)
				or
				(${table.kind} = 'item_status_changed'
					and ${table.beforeSnapshotJson} is null
					and ${table.afterSnapshotJson} is null
					and ${table.fromStatus} is not null
					and ${table.toStatus} is not null
					and ${table.fromStatus} <> ${table.toStatus}
					and ${table.transitionKind} is not null
					and ${table.candidateId} is null
					and ${table.offerId} is null
					and ${table.priceCheckId} is null
					and ${table.purchasedQuantity} is null
					and ${table.purchaseSnapshotJson} is null)
				or
				(${table.kind} = 'planned_candidate_changed'
					and (${table.beforeSnapshotJson} is not null or ${table.afterSnapshotJson} is not null)
					and ${table.fromStatus} is null
					and ${table.toStatus} is null
					and ${table.transitionKind} is null
					and ${table.note} is null
					and ${table.candidateId} is null
					and ${table.offerId} is null
					and ${table.priceCheckId} is null
					and ${table.purchasedQuantity} is null
					and ${table.purchaseSnapshotJson} is null)
				or
				(${table.kind} = 'purchase_recorded'
					and ${table.beforeSnapshotJson} is null
					and ${table.afterSnapshotJson} is null
					and ${table.fromStatus} is null
					and ${table.toStatus} is null
					and ${table.transitionKind} is null
					and ${table.note} is null
					and ${table.candidateId} is not null
					and ${table.offerId} is not null
					and ${table.priceCheckId} is not null
					and ${table.purchasedQuantity} is not null
					and ${table.purchaseSnapshotJson} is not null)
			)`,
		),
		check(
			"decision_events_status_check",
			sql`(
				(${table.fromStatus} is null or ${table.fromStatus} in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped'))
				and
				(${table.toStatus} is null or ${table.toStatus} in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped'))
			)`,
		),
		check(
			"decision_events_transition_kind_check",
			sql`${table.transitionKind} is null or ${table.transitionKind} in ('progression', 'alternate', 'reversal')`,
		),
		check(
			"decision_events_note_check",
			sql`${table.note} is null or length(trim(${table.note})) between 1 and 1000`,
		),
		check(
			"decision_events_purchase_quantity_check",
			sql`${table.purchasedQuantity} is null or (typeof(${table.purchasedQuantity}) = 'integer' and ${table.purchasedQuantity} between 1 and 9007199254740991)`,
		),
		index("decision_events_item_time_idx").on(
			table.itemId,
			table.createdAt,
			table.id,
		),
		index("decision_events_actor_idx").on(table.actorUserId),
		index("decision_events_candidate_purchase_idx").on(
			table.candidateId,
			table.createdAt,
		),
		index("decision_events_offer_purchase_idx").on(
			table.offerId,
			table.createdAt,
		),
	],
);

export const merchants = sqliteTable(
	"merchants",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		salesChannel: text("sales_channel", { enum: merchantSalesChannels })
			.default("online")
			.notNull(),
		websiteUrl: text("website_url"),
		notes: text("notes"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"merchants_name_length_check",
			sql`length(trim(${table.name})) between 1 and 160`,
		),
		check(
			"merchants_sales_channel_check",
			sql`${table.salesChannel} in ('online', 'in_person', 'both')`,
		),
		check(
			"merchants_website_url_check",
			sql`${table.websiteUrl} is null or (length(${table.websiteUrl}) between 8 and 2048 and lower(${table.websiteUrl}) glob 'https://*')`,
		),
		check(
			"merchants_notes_length_check",
			sql`${table.notes} is null or length(trim(${table.notes})) between 1 and 2000`,
		),
		uniqueIndex("merchants_id_workspace_uidx").on(table.id, table.workspaceId),
		uniqueIndex("merchants_active_workspace_name_uidx")
			.on(table.workspaceId, table.name)
			.where(sql`${table.archivedAt} is null`),
		index("merchants_workspace_name_idx").on(table.workspaceId, table.name),
	],
);

export const products = sqliteTable(
	"products",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		brand: text("brand"),
		model: text("model"),
		category: text("category"),
		attributesJson: text("attributes_json"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"products_title_length_check",
			sql`length(trim(${table.title})) between 1 and 240`,
		),
		check(
			"products_brand_length_check",
			sql`${table.brand} is null or length(trim(${table.brand})) between 1 and 160`,
		),
		check(
			"products_model_length_check",
			sql`${table.model} is null or length(trim(${table.model})) between 1 and 160`,
		),
		check(
			"products_category_length_check",
			sql`${table.category} is null or length(trim(${table.category})) between 1 and 120`,
		),
		check(
			"products_attributes_json_check",
			sql`${table.attributesJson} is null or json_valid(${table.attributesJson})`,
		),
		uniqueIndex("products_id_workspace_uidx").on(table.id, table.workspaceId),
		index("products_workspace_category_idx").on(
			table.workspaceId,
			table.category,
		),
	],
);

export const offers = sqliteTable(
	"offers",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		productId: text("product_id").notNull(),
		merchantId: text("merchant_id").notNull(),
		sourceUrl: text("source_url").notNull(),
		priceKind: text("price_kind", { enum: offerPriceKinds }).notNull(),
		unitPriceMinor: integer("unit_price_minor"),
		currency: text("currency"),
		shippingMinor: integer("shipping_minor"),
		shippingBasis: text("shipping_basis", { enum: shippingBases }).notNull(),
		availabilityState: text("availability_state", {
			enum: availabilityStates,
		}).notNull(),
		availabilityChannel: text("availability_channel"),
		availabilityLocation: text("availability_location"),
		availabilityVariant: text("availability_variant"),
		availabilityNote: text("availability_note"),
		locale: text("locale"),
		lastCheckedAt: integer("last_checked_at", {
			mode: "timestamp_ms",
		}).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		foreignKey({
			name: "offers_product_workspace_fk",
			columns: [table.productId, table.workspaceId],
			foreignColumns: [products.id, products.workspaceId],
		}).onDelete("cascade"),
		foreignKey({
			name: "offers_merchant_workspace_fk",
			columns: [table.merchantId, table.workspaceId],
			foreignColumns: [merchants.id, merchants.workspaceId],
		}).onDelete("restrict"),
		check(
			"offers_source_url_check",
			sql`length(${table.sourceUrl}) between 8 and 2048 and lower(${table.sourceUrl}) glob 'https://*'`,
		),
		check(
			"offers_price_check",
			sql`(
				(${table.priceKind} = 'unknown' and ${table.unitPriceMinor} is null)
				or
				(${table.priceKind} in ('exact', 'starting_at') and ${table.unitPriceMinor} is not null and typeof(${table.unitPriceMinor}) = 'integer' and ${table.unitPriceMinor} between 0 and 9007199254740991 and ${table.currency} is not null and length(${table.currency}) = 3 and ${table.currency} glob '[A-Z][A-Z][A-Z]')
			)`,
		),
		check(
			"offers_currency_check",
			sql`${table.currency} is null or (length(${table.currency}) = 3 and ${table.currency} glob '[A-Z][A-Z][A-Z]')`,
		),
		check(
			"offers_shipping_amount_check",
			sql`${table.shippingMinor} is null or (typeof(${table.shippingMinor}) = 'integer' and ${table.shippingMinor} between 0 and 9007199254740991 and ${table.currency} is not null)`,
		),
		check(
			"offers_shipping_basis_check",
			sql`${table.shippingBasis} in ('per_line', 'per_unit', 'unknown')`,
		),
		check(
			"offers_availability_state_check",
			sql`${table.availabilityState} in ('available', 'unavailable', 'unknown')`,
		),
		check(
			"offers_availability_text_check",
			sql`(
				(${table.availabilityChannel} is null or length(trim(${table.availabilityChannel})) between 1 and 80)
				and (${table.availabilityLocation} is null or length(trim(${table.availabilityLocation})) between 1 and 160)
				and (${table.availabilityVariant} is null or length(trim(${table.availabilityVariant})) between 1 and 160)
				and (${table.availabilityNote} is null or length(trim(${table.availabilityNote})) between 1 and 1000)
			)`,
		),
		uniqueIndex("offers_id_product_workspace_uidx").on(
			table.id,
			table.productId,
			table.workspaceId,
		),
		index("offers_product_freshness_idx").on(
			table.productId,
			table.lastCheckedAt,
		),
		index("offers_merchant_freshness_idx").on(
			table.merchantId,
			table.lastCheckedAt,
		),
	],
);

export const itemCandidates = sqliteTable(
	"item_candidates",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		itemId: text("item_id").notNull(),
		productId: text("product_id").notNull(),
		plannedPurchaseQuantity: integer("planned_purchase_quantity")
			.default(1)
			.notNull(),
		isPlanned: integer("is_planned", { mode: "boolean" })
			.default(false)
			.notNull(),
		plannedOfferId: text("planned_offer_id"),
		notes: text("notes"),
		rank: integer("rank"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		foreignKey({
			name: "item_candidates_item_workspace_fk",
			columns: [table.itemId, table.workspaceId],
			foreignColumns: [items.id, items.workspaceId],
		}).onDelete("cascade"),
		foreignKey({
			name: "item_candidates_product_workspace_fk",
			columns: [table.productId, table.workspaceId],
			foreignColumns: [products.id, products.workspaceId],
		}).onDelete("cascade"),
		foreignKey({
			name: "item_candidates_planned_offer_product_fk",
			columns: [table.plannedOfferId, table.productId, table.workspaceId],
			foreignColumns: [offers.id, offers.productId, offers.workspaceId],
		}).onDelete("no action"),
		check(
			"item_candidates_planned_quantity_check",
			sql`typeof(${table.plannedPurchaseQuantity}) = 'integer' and ${table.plannedPurchaseQuantity} between 1 and 9007199254740991`,
		),
		check(
			"item_candidates_is_planned_check",
			sql`${table.isPlanned} in (0, 1)`,
		),
		check(
			"item_candidates_planned_offer_state_check",
			sql`${table.isPlanned} = 1 or ${table.plannedOfferId} is null`,
		),
		check(
			"item_candidates_notes_length_check",
			sql`${table.notes} is null or length(trim(${table.notes})) between 1 and 4000`,
		),
		check(
			"item_candidates_rank_check",
			sql`${table.rank} is null or (typeof(${table.rank}) = 'integer' and ${table.rank} between 0 and 1000)`,
		),
		uniqueIndex("item_candidates_active_item_product_uidx")
			.on(table.itemId, table.productId)
			.where(sql`${table.archivedAt} is null`),
		uniqueIndex("item_candidates_one_planned_per_item_uidx")
			.on(table.itemId)
			.where(sql`${table.isPlanned} = 1 and ${table.archivedAt} is null`),
		uniqueIndex("item_candidates_id_item_workspace_uidx").on(
			table.id,
			table.itemId,
			table.workspaceId,
		),
		index("item_candidates_product_idx").on(table.productId),
	],
);

export const comments = sqliteTable(
	"comments",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		itemId: text("item_id").notNull(),
		candidateId: text("candidate_id"),
		body: text("body"),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
		resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		removedAt: integer("removed_at", { mode: "timestamp_ms" }),
		removedByUserId: text("removed_by_user_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		foreignKey({
			name: "comments_item_workspace_fk",
			columns: [table.itemId, table.workspaceId],
			foreignColumns: [items.id, items.workspaceId],
		}).onDelete("cascade"),
		foreignKey({
			name: "comments_candidate_item_workspace_fk",
			columns: [table.candidateId, table.itemId, table.workspaceId],
			foreignColumns: [
				itemCandidates.id,
				itemCandidates.itemId,
				itemCandidates.workspaceId,
			],
		}).onDelete("cascade"),
		check(
			"comments_target_check",
			sql`${table.candidateId} is null or length(${table.candidateId}) > 0`,
		),
		check(
			"comments_body_state_check",
			sql`(
				(${table.removedAt} is null and ${table.removedByUserId} is null and ${table.body} is not null and length(trim(${table.body})) between 1 and 2000)
				or
				(${table.removedAt} is not null and ${table.removedByUserId} is not null and ${table.body} is null)
			)`,
		),
		check(
			"comments_resolution_pair_check",
			sql`(
				(${table.resolvedAt} is null and ${table.resolvedByUserId} is null)
				or
				(${table.resolvedAt} is not null and ${table.resolvedByUserId} is not null)
			)`,
		),
		index("comments_item_time_idx").on(table.itemId, table.createdAt, table.id),
		index("comments_candidate_time_idx").on(
			table.candidateId,
			table.createdAt,
			table.id,
		),
		index("comments_author_idx").on(table.authorUserId),
	],
);

export const candidateVotes = sqliteTable(
	"candidate_votes",
	{
		workspaceId: text("workspace_id").notNull(),
		itemId: text("item_id").notNull(),
		candidateId: text("candidate_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		primaryKey({
			columns: [table.candidateId, table.userId],
			name: "candidate_votes_pk",
		}),
		foreignKey({
			name: "candidate_votes_candidate_item_workspace_fk",
			columns: [table.candidateId, table.itemId, table.workspaceId],
			foreignColumns: [
				itemCandidates.id,
				itemCandidates.itemId,
				itemCandidates.workspaceId,
			],
		}).onDelete("cascade"),
		index("candidate_votes_item_idx").on(table.itemId, table.candidateId),
		index("candidate_votes_user_idx").on(table.userId),
	],
);

export const priceChecks = sqliteTable(
	"price_checks",
	{
		id: text("id").primaryKey(),
		offerId: text("offer_id")
			.notNull()
			.references(() => offers.id, { onDelete: "cascade" }),
		priceKind: text("price_kind", { enum: offerPriceKinds }).notNull(),
		unitPriceMinor: integer("unit_price_minor"),
		currency: text("currency"),
		shippingMinor: integer("shipping_minor"),
		shippingBasis: text("shipping_basis", { enum: shippingBases }).notNull(),
		availabilityState: text("availability_state", {
			enum: availabilityStates,
		}).notNull(),
		availabilityChannel: text("availability_channel"),
		availabilityLocation: text("availability_location"),
		availabilityVariant: text("availability_variant"),
		availabilityNote: text("availability_note"),
		observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
		observedByUserId: text("observed_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		createdAt: createdAt(),
	},
	(table) => [
		check(
			"price_checks_price_check",
			sql`(
				(${table.priceKind} = 'unknown' and ${table.unitPriceMinor} is null)
				or
				(${table.priceKind} in ('exact', 'starting_at') and ${table.unitPriceMinor} is not null and typeof(${table.unitPriceMinor}) = 'integer' and ${table.unitPriceMinor} between 0 and 9007199254740991 and ${table.currency} is not null and length(${table.currency}) = 3 and ${table.currency} glob '[A-Z][A-Z][A-Z]')
			)`,
		),
		check(
			"price_checks_currency_check",
			sql`${table.currency} is null or (length(${table.currency}) = 3 and ${table.currency} glob '[A-Z][A-Z][A-Z]')`,
		),
		check(
			"price_checks_shipping_amount_check",
			sql`${table.shippingMinor} is null or (typeof(${table.shippingMinor}) = 'integer' and ${table.shippingMinor} between 0 and 9007199254740991 and ${table.currency} is not null)`,
		),
		check(
			"price_checks_shipping_basis_check",
			sql`${table.shippingBasis} in ('per_line', 'per_unit', 'unknown')`,
		),
		check(
			"price_checks_availability_state_check",
			sql`${table.availabilityState} in ('available', 'unavailable', 'unknown')`,
		),
		check(
			"price_checks_availability_text_check",
			sql`(
				(${table.availabilityChannel} is null or length(trim(${table.availabilityChannel})) between 1 and 80)
				and (${table.availabilityLocation} is null or length(trim(${table.availabilityLocation})) between 1 and 160)
				and (${table.availabilityVariant} is null or length(trim(${table.availabilityVariant})) between 1 and 160)
				and (${table.availabilityNote} is null or length(trim(${table.availabilityNote})) between 1 and 1000)
			)`,
		),
		index("price_checks_offer_observed_idx").on(
			table.offerId,
			table.observedAt,
		),
	],
);

export const importDrafts = sqliteTable(
	"import_drafts",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		format: text("format", { enum: ["markdown", "json"] }).notNull(),
		parserVersion: text("parser_version").notNull(),
		proposalJson: text("proposal_json").notNull(),
		warningsJson: text("warnings_json").notNull(),
		status: text("status", {
			enum: ["draft", "applied", "discarded"],
		})
			.default("draft")
			.notNull(),
		rawInput: text("raw_input"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		appliedByUserId: text("applied_by_user_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
		discardedByUserId: text("discarded_by_user_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		discardedAt: integer("discarded_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		foreignKey({
			name: "import_drafts_collection_workspace_fk",
			columns: [table.collectionId, table.workspaceId],
			foreignColumns: [collections.id, collections.workspaceId],
		}).onDelete("cascade"),
		check(
			"import_drafts_format_check",
			sql`${table.format} in ('markdown', 'json')`,
		),
		check(
			"import_drafts_parser_version_check",
			sql`length(trim(${table.parserVersion})) between 1 and 40`,
		),
		check(
			"import_drafts_payload_check",
			sql`json_valid(${table.proposalJson}) and json_valid(${table.warningsJson})`,
		),
		check(
			"import_drafts_raw_input_check",
			sql`${table.rawInput} is null or length(${table.rawInput}) between 1 and 100000`,
		),
		check(
			"import_drafts_lifecycle_check",
			sql`(
				(${table.status} = 'draft'
					and ${table.rawInput} is not null
					and ${table.appliedByUserId} is null
					and ${table.appliedAt} is null
					and ${table.discardedByUserId} is null
					and ${table.discardedAt} is null)
				or
				(${table.status} = 'applied'
					and ${table.rawInput} is null
					and ${table.appliedByUserId} is not null
					and ${table.appliedAt} is not null
					and ${table.discardedByUserId} is null
					and ${table.discardedAt} is null)
				or
				(${table.status} = 'discarded'
					and ${table.rawInput} is null
					and ${table.appliedByUserId} is null
					and ${table.appliedAt} is null
					and ${table.discardedByUserId} is not null
					and ${table.discardedAt} is not null)
			)`,
		),
		uniqueIndex("import_drafts_id_collection_workspace_uidx").on(
			table.id,
			table.collectionId,
			table.workspaceId,
		),
		index("import_drafts_collection_time_idx").on(
			table.collectionId,
			table.createdAt,
			table.id,
		),
	],
);

export const importDraftApplications = sqliteTable(
	"import_draft_applications",
	{
		draftId: text("draft_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		proposalKey: text("proposal_key").notNull(),
		recordType: text("record_type", {
			enum: [
				"item",
				"product",
				"candidate",
				"merchant",
				"offer",
				"price_check",
			],
		}).notNull(),
		recordId: text("record_id").notNull(),
		action: text("action", { enum: ["created", "reused"] }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({
			columns: [table.draftId, table.proposalKey, table.recordType],
			name: "import_draft_applications_pk",
		}),
		foreignKey({
			name: "import_draft_applications_draft_scope_fk",
			columns: [table.draftId, table.collectionId, table.workspaceId],
			foreignColumns: [
				importDrafts.id,
				importDrafts.collectionId,
				importDrafts.workspaceId,
			],
		}).onDelete("cascade"),
		check(
			"import_draft_applications_record_type_check",
			sql`${table.recordType} in ('item', 'product', 'candidate', 'merchant', 'offer', 'price_check')`,
		),
		check(
			"import_draft_applications_action_check",
			sql`${table.action} in ('created', 'reused')`,
		),
		check(
			"import_draft_applications_identifier_check",
			sql`length(trim(${table.proposalKey})) between 1 and 80 and length(trim(${table.recordId})) between 1 and 200`,
		),
		index("import_draft_applications_record_idx").on(
			table.recordType,
			table.recordId,
		),
	],
);
