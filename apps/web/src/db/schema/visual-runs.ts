import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { collections, concepts, conceptImages } from "./collaboration";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

export const visualRuns = sqliteTable(
	"visual_runs",
	{
		id: text("id").primaryKey().notNull(),
		collectionId: text("collection_id")
			.notNull()
			.references(() => collections.id, { onDelete: "cascade" }),
		conceptId: text("concept_id").references(() => concepts.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id").notNull(),
		accessTokenId: text("access_token_id").notNull(),
		selectionJson: text("selection_json").notNull(),
		sourcesJson: text("sources_json").notNull(),
		productsJson: text("products_json").notNull(),
		status: text("status", {
			enum: ["ready", "importing", "completed", "failed", "cancelled"],
		}).notNull(),
		expiresAt: integer("expires_at").notNull(),
		importOperationId: text("import_operation_id"),
		importHash: text("import_hash"),
		reportedModel: text("reported_model"),
		objectKey: text("object_key"),
		reservedBytes: integer("reserved_bytes").notNull().default(0),
		objectDeletedAt: integer("object_deleted_at"),
		outputImageId: text("output_image_id").references(() => conceptImages.id, {
			onDelete: "restrict",
		}),
		errorCode: text("error_code"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"visual_runs_status_check",
			sql`${table.status} in ('ready','importing','completed','failed','cancelled')`,
		),
		check(
			"visual_runs_reservation_check",
			sql`${table.reservedBytes} between 0 and 10485760`,
		),
		check(
			"visual_runs_json_check",
			sql`json_valid(${table.selectionJson}) and json_valid(${table.sourcesJson}) and json_valid(${table.productsJson})`,
		),
		check(
			"visual_runs_output_check",
			sql`${table.status} <> 'completed' or ${table.outputImageId} is not null`,
		),
		uniqueIndex("visual_runs_import_operation_uidx").on(
			table.userId,
			table.clientId,
			table.importOperationId,
		),
		uniqueIndex("visual_runs_output_uidx").on(table.outputImageId),
		uniqueIndex("visual_runs_object_uidx").on(table.objectKey),
		index("visual_runs_collection_status_idx").on(
			table.collectionId,
			table.status,
		),
	],
);
