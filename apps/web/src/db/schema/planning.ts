import { itemPriorities, itemStatuses } from "@kharidyar/domain";
import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";
import { collections, workspaces } from "./collaboration";

export const offerPriceKinds = ["exact", "starting_at", "unknown"] as const;
export const shippingBases = ["per_line", "per_unit", "unknown"] as const;
export const availabilityStates = [
	"available",
	"unavailable",
	"unknown",
] as const;

export const items = sqliteTable(
	"items",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		title: text("title").notNull(),
		description: text("description"),
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
		index("items_collection_status_idx").on(
			table.collectionId,
			table.status,
		),
		index("items_collection_group_idx").on(
			table.collectionId,
			table.groupLabel,
		),
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
		uniqueIndex("products_id_workspace_uidx").on(
			table.id,
			table.workspaceId,
		),
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
		sellerName: text("seller_name").notNull(),
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
		check(
			"offers_seller_name_check",
			sql`length(trim(${table.sellerName})) between 1 and 160`,
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
		uniqueIndex("offers_id_product_workspace_uidx").on(
			table.id,
			table.productId,
			table.workspaceId,
		),
		index("offers_product_freshness_idx").on(
			table.productId,
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
		uniqueIndex("item_candidates_active_item_product_uidx")
			.on(table.itemId, table.productId)
			.where(sql`${table.archivedAt} is null`),
		uniqueIndex("item_candidates_one_planned_per_item_uidx")
			.on(table.itemId)
			.where(sql`${table.isPlanned} = 1 and ${table.archivedAt} is null`),
		index("item_candidates_product_idx").on(table.productId),
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
		availabilityQualifier: text("availability_qualifier"),
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
		index("price_checks_offer_observed_idx").on(
			table.offerId,
			table.observedAt,
		),
	],
);
