import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

export const membershipRoles = [
	"viewer",
	"commenter",
	"contributor",
	"editor",
	"owner",
] as const;

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"workspaces_name_length_check",
			sql`length(trim(${table.name})) between 1 and 120`,
		),
		index("workspaces_created_by_user_idx").on(table.createdByUserId),
	],
);

export const workspaceMemberships = sqliteTable(
	"workspace_memberships",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: membershipRoles }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"workspace_memberships_role_check",
			sql`${table.role} in ('viewer', 'commenter', 'contributor', 'editor', 'owner')`,
		),
		uniqueIndex("workspace_memberships_workspace_user_uidx").on(
			table.workspaceId,
			table.userId,
		),
		index("workspace_memberships_user_idx").on(table.userId),
		index("workspace_memberships_workspace_role_idx").on(
			table.workspaceId,
			table.role,
		),
	],
);

export const collections = sqliteTable(
	"collections",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"collections_name_length_check",
			sql`length(trim(${table.name})) between 1 and 120`,
		),
		uniqueIndex("collections_id_workspace_uidx").on(
			table.id,
			table.workspaceId,
		),
		index("collections_workspace_archived_idx").on(
			table.workspaceId,
			table.archivedAt,
		),
	],
);

export const collectionMemberships = sqliteTable(
	"collection_memberships",
	{
		id: text("id").primaryKey(),
		collectionId: text("collection_id")
			.notNull()
			.references(() => collections.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: membershipRoles }).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"collection_memberships_role_check",
			sql`${table.role} in ('viewer', 'commenter', 'contributor', 'editor', 'owner')`,
		),
		uniqueIndex("collection_memberships_collection_user_uidx").on(
			table.collectionId,
			table.userId,
		),
		index("collection_memberships_user_idx").on(table.userId),
		index("collection_memberships_collection_role_idx").on(
			table.collectionId,
			table.role,
		),
	],
);

export const collectionBriefs = sqliteTable(
	"collection_briefs",
	{
		id: text("id").primaryKey(),
		collectionId: text("collection_id")
			.notNull()
			.references(() => collections.id, { onDelete: "cascade" }),
		title: text("title"),
		description: text("description"),
		budgetMinor: integer("budget_minor"),
		budgetCurrency: text("budget_currency"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("collection_briefs_collection_uidx").on(
			table.collectionId,
		),
		check(
			"collection_briefs_budget_pair_check",
			sql`(
				(${table.budgetMinor} is null and ${table.budgetCurrency} is null)
				or
				(${table.budgetMinor} is not null and typeof(${table.budgetMinor}) = 'integer' and ${table.budgetMinor} between 0 and 9007199254740991 and ${table.budgetCurrency} is not null and length(${table.budgetCurrency}) = 3 and ${table.budgetCurrency} glob '[A-Z][A-Z][A-Z]')
			)`,
		),
	],
);

export const collectionBriefColors = sqliteTable(
	"collection_brief_colors",
	{
		id: text("id").primaryKey(),
		collectionBriefId: text("collection_brief_id")
			.notNull()
			.references(() => collectionBriefs.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: ["core", "supporting"] }).notNull(),
		position: integer("position").notNull(),
		hex: text("hex").notNull(),
		label: text("label"),
		usageNote: text("usage_note"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"collection_brief_colors_kind_check",
			sql`${table.kind} in ('core', 'supporting')`,
		),
		check(
			"collection_brief_colors_position_check",
			sql`typeof(${table.position}) = 'integer' and ${table.position} between 0 and 5`,
		),
		check(
			"collection_brief_colors_hex_check",
			sql`length(${table.hex}) = 7 and ${table.hex} glob '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'`,
		),
		uniqueIndex("collection_brief_colors_kind_position_uidx").on(
			table.collectionBriefId,
			table.kind,
			table.position,
		),
		uniqueIndex("collection_brief_colors_hex_uidx").on(
			table.collectionBriefId,
			table.hex,
		),
	],
);
