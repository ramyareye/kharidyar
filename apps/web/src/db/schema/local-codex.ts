import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { session, user } from "./auth";
import { researchRuns } from "./research";

export const localCodexPairings = sqliteTable(
  "local_codex_pairings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    lastSeenAt: integer("last_seen_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("local_codex_pairings_user_idx").on(table.userId)],
);

export const localCodexJobs = sqliteTable(
  "local_codex_jobs",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => researchRuns.id, { onDelete: "cascade" }),
    pairingId: text("pairing_id")
      .notNull()
      .references(() => localCodexPairings.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: integer("lease_expires_at"),
    finishedAt: integer("finished_at"),
    completionHash: text("completion_hash"),
  },
  (table) => [
    uniqueIndex("local_codex_jobs_one_active_idx")
      .on(table.pairingId)
      .where(sql`${table.finishedAt} is null`),
  ],
);
