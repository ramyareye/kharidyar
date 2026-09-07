import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { collections } from "./collaboration";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

export const floorPlans = sqliteTable(
  "floor_plans",
  {
    id: text("id").primaryKey().notNull(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    notes: text("notes"),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type", {
      enum: ["image/webp", "application/pdf"],
    }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["pending", "ready", "deleted"] }).notNull(),
    objectDeletedAt: integer("object_deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "floor_plans_title_check",
      sql`length(trim(${table.title})) between 1 and 200`,
    ),
    check(
      "floor_plans_notes_check",
      sql`${table.notes} is null or length(${table.notes}) <= 4000`,
    ),
    check(
      "floor_plans_type_check",
      sql`${table.contentType} in ('image/webp', 'application/pdf')`,
    ),
    check(
      "floor_plans_status_check",
      sql`${table.status} in ('pending', 'ready', 'deleted')`,
    ),
    check(
      "floor_plans_bytes_check",
      sql`typeof(${table.byteSize}) = 'integer' and ${table.byteSize} between 1 and 10485760`,
    ),
    check(
      "floor_plans_dimensions_check",
      sql`(${table.contentType} = 'application/pdf' and ${table.width} is null and ${table.height} is null) or (${table.contentType} = 'image/webp' and ${table.width} is not null and ${table.height} is not null and ${table.width} between 1 and 10000 and ${table.height} between 1 and 10000 and ${table.width} * ${table.height} <= 40000000)`,
    ),
    index("floor_plans_collection_status_idx").on(
      table.collectionId,
      table.status,
    ),
  ],
);
