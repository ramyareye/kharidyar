import { membershipRoles } from "@kharidyar/domain";
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

export const invitationScopeTypes = ["workspace", "collections"] as const;

export const invitations = sqliteTable(
	"invitations",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		scopeType: text("scope_type", { enum: invitationScopeTypes }).notNull(),
		role: text("role", { enum: membershipRoles }).notNull(),
		tokenHash: text("token_hash").notNull(),
		invitedEmailNormalized: text("invited_email_normalized"),
		emailRestrictionEnabled: integer("email_restriction_enabled", {
			mode: "boolean",
		})
			.default(false)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
		revokedByUserId: text("revoked_by_user_id").references(() => user.id, {
			onDelete: "restrict",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"invitations_scope_type_check",
			sql`${table.scopeType} in ('workspace', 'collections')`,
		),
		check(
			"invitations_role_check",
			sql`${table.role} in ('viewer', 'commenter', 'contributor', 'editor', 'owner')`,
		),
		check(
			"invitations_token_hash_check",
			sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} = lower(${table.tokenHash}) and ${table.tokenHash} not glob '*[^0-9a-f]*'`,
		),
		check(
			"invitations_email_restriction_check",
			sql`(
				(${table.emailRestrictionEnabled} = 0 and ${table.invitedEmailNormalized} is null)
				or
				(${table.emailRestrictionEnabled} = 1 and ${table.invitedEmailNormalized} is not null and ${table.invitedEmailNormalized} = lower(trim(${table.invitedEmailNormalized})) and length(${table.invitedEmailNormalized}) between 3 and 320)
			)`,
		),
		check(
			"invitations_expiry_check",
			sql`${table.expiresAt} > ${table.createdAt}`,
		),
		check(
			"invitations_revocation_check",
			sql`(
				(${table.revokedAt} is null and ${table.revokedByUserId} is null)
				or
				(${table.revokedAt} is not null and ${table.revokedByUserId} is not null)
			)`,
		),
		uniqueIndex("invitations_token_hash_uidx").on(table.tokenHash),
		uniqueIndex("invitations_id_workspace_uidx").on(
			table.id,
			table.workspaceId,
		),
		index("invitations_workspace_state_idx").on(
			table.workspaceId,
			table.revokedAt,
			table.expiresAt,
		),
	],
);

export const invitationCollections = sqliteTable(
	"invitation_collections",
	{
		invitationId: text("invitation_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({
			columns: [table.invitationId, table.collectionId],
			name: "invitation_collections_pk",
		}),
		foreignKey({
			columns: [table.invitationId, table.workspaceId],
			foreignColumns: [invitations.id, invitations.workspaceId],
			name: "invitation_collections_invitation_workspace_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.collectionId, table.workspaceId],
			foreignColumns: [collections.id, collections.workspaceId],
			name: "invitation_collections_collection_workspace_fk",
		}).onDelete("cascade"),
		index("invitation_collections_collection_idx").on(table.collectionId),
	],
);

export const invitationAcceptances = sqliteTable(
	"invitation_acceptances",
	{
		invitationId: text("invitation_id")
			.primaryKey()
			.references(() => invitations.id, { onDelete: "cascade" }),
		acceptedByUserId: text("accepted_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("invitation_acceptances_user_idx").on(table.acceptedByUserId),
	],
);

export const collaborationRateLimits = sqliteTable(
	"collaboration_rate_limits",
	{
		key: text("key").primaryKey(),
		count: integer("count").notNull(),
		windowStartedAt: integer("window_started_at", {
			mode: "timestamp_ms",
		}).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		check(
			"collaboration_rate_limits_count_check",
			sql`typeof(${table.count}) = 'integer' and ${table.count} > 0`,
		),
		index("collaboration_rate_limits_updated_idx").on(table.updatedAt),
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
		uniqueIndex("collection_briefs_collection_uidx").on(table.collectionId),
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
