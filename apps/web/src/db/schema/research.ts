import {
  researchExtractionStatuses,
  researchResultStatuses,
  researchRunStatuses,
} from "@kharidyar/domain";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";
import { collections } from "./collaboration";
import { items } from "./planning";

export const researchRequests = sqliteTable(
  "research_requests",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    collectionId: text("collection_id").notNull(),
    itemId: text("item_id").references(() => items.id, {
      onDelete: "set null",
    }),
    query: text("query").notNull(),
    constraintsJson: text("constraints_json").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "research_requests_collection_workspace_fk",
      columns: [table.collectionId, table.workspaceId],
      foreignColumns: [collections.id, collections.workspaceId],
    }).onDelete("cascade"),
    check(
      "research_requests_query_check",
      sql`length(trim(${table.query})) between 1 and 1000`,
    ),
    check(
      "research_requests_constraints_check",
      sql`json_valid(${table.constraintsJson})`,
    ),
    uniqueIndex("research_requests_id_collection_workspace_uidx").on(
      table.id,
      table.collectionId,
      table.workspaceId,
    ),
    index("research_requests_collection_time_idx").on(
      table.collectionId,
      table.createdAt,
      table.id,
    ),
    index("research_requests_item_idx").on(table.itemId, table.createdAt),
  ],
);

export const researchRuns = sqliteTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    collectionId: text("collection_id").notNull(),
    status: text("status", { enum: researchRunStatuses })
      .default("queued")
      .notNull(),
    provider: text("provider").notNull(),
    providerQuery: text("provider_query").notNull(),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "research_runs_request_scope_fk",
      columns: [table.requestId, table.collectionId, table.workspaceId],
      foreignColumns: [
        researchRequests.id,
        researchRequests.collectionId,
        researchRequests.workspaceId,
      ],
    }).onDelete("cascade"),
    check(
      "research_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "research_runs_provider_check",
      sql`${table.provider} = 'tavily-basic-v1'`,
    ),
    check(
      "research_runs_query_check",
      sql`length(trim(${table.providerQuery})) between 1 and 2000`,
    ),
    check(
      "research_runs_error_pair_check",
      sql`(
				(${table.errorCode} is null and ${table.errorMessage} is null)
				or
				(${table.errorCode} is not null and length(trim(${table.errorCode})) between 1 and 80 and ${table.errorMessage} is not null and length(trim(${table.errorMessage})) between 1 and 1000)
			)`,
    ),
    check(
      "research_runs_lifecycle_check",
      sql`(
				(${table.status} = 'queued' and ${table.startedAt} is null and ${table.finishedAt} is null and ${table.errorCode} is null)
				or
				(${table.status} in ('running', 'partial') and ${table.startedAt} is not null and ${table.finishedAt} is null and ${table.errorCode} is null)
				or
				(${table.status} = 'completed' and ${table.startedAt} is not null and ${table.finishedAt} is not null and ${table.errorCode} is null)
				or
				(${table.status} = 'failed' and ${table.finishedAt} is not null and ${table.errorCode} is not null)
				or
				(${table.status} = 'cancelled' and ${table.finishedAt} is not null and ${table.errorCode} is null)
			)`,
    ),
    uniqueIndex("research_runs_id_request_scope_uidx").on(
      table.id,
      table.requestId,
      table.collectionId,
      table.workspaceId,
    ),
    uniqueIndex("research_runs_workflow_instance_uidx").on(
      table.workflowInstanceId,
    ),
    index("research_runs_request_time_idx").on(
      table.requestId,
      table.createdAt,
      table.id,
    ),
    index("research_runs_collection_status_idx").on(
      table.collectionId,
      table.status,
    ),
  ],
);

export const researchSources = sqliteTable(
  "research_sources",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    requestId: text("request_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    collectionId: text("collection_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    provider: text("provider").notNull(),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
    extractionStatus: text("extraction_status", {
      enum: researchExtractionStatuses,
    }).notNull(),
    extractionMethod: text("extraction_method", {
      enum: ["search", "browser_run"],
    }).notNull(),
    extractionMetadataJson: text("extraction_metadata_json").notNull(),
    snapshotJson: text("snapshot_json"),
    snapshotExpiresAt: integer("snapshot_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "research_sources_run_scope_fk",
      columns: [
        table.runId,
        table.requestId,
        table.collectionId,
        table.workspaceId,
      ],
      foreignColumns: [
        researchRuns.id,
        researchRuns.requestId,
        researchRuns.collectionId,
        researchRuns.workspaceId,
      ],
    }).onDelete("cascade"),
    check(
      "research_sources_url_check",
      sql`length(${table.url}) between 8 and 2048 and lower(${table.url}) glob 'https://*'`,
    ),
    check(
      "research_sources_title_check",
      sql`${table.title} is null or length(trim(${table.title})) between 1 and 240`,
    ),
    check(
      "research_sources_provider_check",
      sql`length(trim(${table.provider})) between 1 and 80`,
    ),
    check(
      "research_sources_extraction_check",
      sql`${table.extractionStatus} in ('not_requested', 'not_allowed', 'completed', 'failed') and ${table.extractionMethod} in ('search', 'browser_run')`,
    ),
    check(
      "research_sources_json_check",
      sql`json_valid(${table.extractionMetadataJson}) and (${table.snapshotJson} is null or json_valid(${table.snapshotJson}))`,
    ),
    check(
      "research_sources_expiry_check",
      sql`${table.snapshotExpiresAt} > ${table.retrievedAt}`,
    ),
    uniqueIndex("research_sources_id_run_uidx").on(table.id, table.runId),
    uniqueIndex("research_sources_run_url_uidx").on(table.runId, table.url),
    index("research_sources_snapshot_expiry_idx").on(table.snapshotExpiresAt),
  ],
);

export const researchResults = sqliteTable(
  "research_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    score: real("score"),
    status: text("status", { enum: researchResultStatuses })
      .default("active")
      .notNull(),
    suggestionJson: text("suggestion_json"),
    snapshotExpiresAt: integer("snapshot_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "research_results_source_run_fk",
      columns: [table.sourceId, table.runId],
      foreignColumns: [researchSources.id, researchSources.runId],
    }).onDelete("cascade"),
    check(
      "research_results_title_check",
      sql`length(trim(${table.title})) between 1 and 240`,
    ),
    check(
      "research_results_summary_check",
      sql`${table.summary} is null or length(trim(${table.summary})) between 1 and 4000`,
    ),
    check(
      "research_results_score_check",
      sql`${table.score} is null or (${table.score} >= 0 and ${table.score} <= 1)`,
    ),
    check(
      "research_results_status_check",
      sql`${table.status} in ('active', 'dismissed')`,
    ),
    check(
      "research_results_suggestion_check",
      sql`${table.suggestionJson} is null or json_valid(${table.suggestionJson})`,
    ),
    uniqueIndex("research_results_source_uidx").on(table.sourceId),
    index("research_results_run_status_idx").on(table.runId, table.status),
    index("research_results_snapshot_expiry_idx").on(table.snapshotExpiresAt),
  ],
);

export const researchResultPromotions = sqliteTable(
  "research_result_promotions",
  {
    resultId: text("result_id")
      .primaryKey()
      .references(() => researchResults.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    collectionId: text("collection_id").notNull(),
    itemId: text("item_id").notNull(),
    productId: text("product_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    offerId: text("offer_id").notNull(),
    priceCheckId: text("price_check_id").notNull(),
    promotedByUserId: text("promoted_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    promotedAt: integer("promoted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "research_result_promotions_collection_workspace_fk",
      columns: [table.collectionId, table.workspaceId],
      foreignColumns: [collections.id, collections.workspaceId],
    }).onDelete("cascade"),
    check(
      "research_result_promotions_identifier_check",
      sql`
				length(trim(${table.itemId})) between 1 and 200
				and length(trim(${table.productId})) between 1 and 200
				and length(trim(${table.candidateId})) between 1 and 200
				and length(trim(${table.merchantId})) between 1 and 200
				and length(trim(${table.offerId})) between 1 and 200
				and length(trim(${table.priceCheckId})) between 1 and 200
			`,
    ),
    uniqueIndex("research_result_promotions_candidate_uidx").on(
      table.candidateId,
    ),
    index("research_result_promotions_item_idx").on(table.itemId),
  ],
);
