import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// Receipt keys survive disconnect/logout so a retried operation is never rerun.
// Only the owning user's deletion removes the audit rows.
export const mcpActions = sqliteTable(
	"mcp_actions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id").notNull(),
		accessTokenId: text("access_token_id").notNull(),
		operationId: text("operation_id").notNull(),
		operation: text("operation").notNull(),
		inputHash: text("input_hash").notNull(),
		argumentsJson: text("arguments_json"),
		targetJson: text("target_json"),
		status: text("status", {
			enum: [
				"pending",
				"running",
				"succeeded",
				"failed",
				"denied",
				"expired",
				"unknown",
			],
		}).notNull(),
		resultJson: text("result_json"),
		errorCode: text("error_code"),
		createdAt: integer("created_at").notNull(),
		expiresAt: integer("expires_at").notNull(),
		startedAt: integer("started_at"),
		finishedAt: integer("finished_at"),
	},
	(table) => [
		uniqueIndex("mcp_actions_operation_idx").on(
			table.userId,
			table.clientId,
			table.operationId,
		),
		index("mcp_actions_user_created_idx").on(table.userId, table.createdAt),
	],
);
