import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAt } from "./columns";
import { collections } from "./collaboration";

export const contextSnapshots = sqliteTable(
	"context_snapshots",
	{
		id: text("id").primaryKey(),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		actorName: text("actor_name").notNull(),
		workspaceId: text("workspace_id").notNull(),
		collectionId: text("collection_id").notNull(),
		schemaVersion: integer("schema_version").notNull(),
		contentJson: text("content_json").notNull(),
		contentBytes: integer("content_bytes").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		foreignKey({
			name: "context_snapshots_collection_workspace_fk",
			columns: [table.collectionId, table.workspaceId],
			foreignColumns: [collections.id, collections.workspaceId],
		}).onDelete("cascade"),
		check(
			"context_snapshots_schema_version_check",
			sql`${table.schemaVersion} = 1`,
		),
		check(
			"context_snapshots_actor_name_check",
			sql`length(trim(${table.actorName})) between 1 and 200`,
		),
		check(
			"context_snapshots_content_check",
			sql`json_valid(${table.contentJson}) and typeof(${table.contentBytes}) = 'integer' and ${table.contentBytes} between 1 and 1500000 and length(cast(${table.contentJson} as blob)) = ${table.contentBytes}`,
		),
		index("context_snapshots_actor_time_idx").on(
			table.actorUserId,
			table.createdAt,
			table.id,
		),
		index("context_snapshots_collection_time_idx").on(
			table.collectionId,
			table.createdAt,
			table.id,
		),
	],
);
