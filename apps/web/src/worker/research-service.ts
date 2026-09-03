import {
  candidateCreateInputSchema,
  merchantInputSchema,
  offerInputSchema,
  priceCheckInputSchema,
  productInputSchema,
  researchConstraintsSchema,
  researchDeskResponseSchema,
  researchResultPromotionInputSchema,
  researchResultSuggestionSchema,
  type ResearchConstraints,
  type ResearchDeskResponse,
  type ResearchProviderSearchOutput,
  type ResearchRequestCreateInput,
  type ResearchResultPromotionInput,
  type ResearchResultSuggestion,
} from "@kharidyar/contracts";
import {
  hasCapability,
  isResearchRunTerminal,
  researchSnapshotExpiresAt,
  type Capability,
  type ResearchExtractionStatus,
  type ResearchResultStatus,
  type ResearchRunStatus,
} from "@kharidyar/domain";

import { conflict, notFound, resourceArchived } from "./api-errors";
import {
  loadCollectionAccess,
  requireCapability,
  type ResourceAccess,
} from "./authorization";
import {
  enforceCollaborationRateLimit,
  researchCreationRateLimit,
} from "./collaboration-rate-limit";
import { isResearchBrowserUrlAllowed } from "./research-browser";
import {
  buildResearchProviderQuery,
  researchProviderId,
} from "./research-provider";

interface CollectionStateRow {
  id: string;
  workspace_id: string;
  archived_at: number | null;
  workspace_archived_at: number | null;
}

interface ItemScopeRow {
  id: string;
  workspace_id: string;
  collection_id: string;
  archived_at: number | null;
}

interface RequestRow {
  id: string;
  workspace_id: string;
  collection_id: string;
  item_id: string | null;
  query: string;
  constraints_json: string;
  created_by_user_id: string;
  created_by_name: string;
  created_by_image: string | null;
  created_at: number;
  updated_at: number;
}

interface RunRow {
  id: string;
  request_id: string;
  status: ResearchRunStatus;
  provider: typeof researchProviderId;
  provider_query: string;
  workflow_instance_id: string;
  error_code: string | null;
  error_message: string | null;
  requested_by_user_id: string;
  requested_by_name: string;
  requested_by_image: string | null;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ResultRow {
  id: string;
  run_id: string;
  title: string;
  summary: string | null;
  score: number | null;
  status: ResearchResultStatus;
  suggestion_json: string | null;
  created_at: number;
  updated_at: number;
  source_id: string;
  source_url: string;
  source_title: string | null;
  source_provider: string;
  source_retrieved_at: number;
  extraction_status: ResearchExtractionStatus;
  extraction_method: "browser_run" | "search";
  extraction_metadata_json: string;
  snapshot_json: string | null;
  snapshot_expires_at: number;
  promotion_result_id: string | null;
  promotion_item_id: string | null;
  promotion_product_id: string | null;
  promotion_candidate_id: string | null;
  promotion_merchant_id: string | null;
  promotion_offer_id: string | null;
  promotion_price_check_id: string | null;
  promoted_by_user_id: string | null;
  promoted_at: number | null;
}

interface ExecutionRow {
  run_id: string;
  request_id: string;
  workspace_id: string;
  collection_id: string;
  status: ResearchRunStatus;
  query: string;
  constraints_json: string;
}

interface PromotionStateRow {
  result_id: string;
  result_status: ResearchResultStatus;
  workspace_id: string;
  collection_id: string;
  source_url: string;
  promotion_result_id: string | null;
}

export interface ResearchExecution {
  collectionId: string;
  constraints: ResearchConstraints;
  query: string;
  requestId: string;
  runId: string;
  workspaceId: string;
}

export interface StoredResearchResult {
  browserExtractionAllowed: boolean;
  resultId: string;
  sourceId: string;
  title: string;
  url: string;
}

export interface ResearchExtractionUpdate {
  metadata: Record<string, boolean | null | number | string>;
  resultId: string;
  sourceId: string;
  status: "completed" | "failed";
  suggestion?: ResearchResultSuggestion;
}

type ResearchWorkflowBinding = Env["RESEARCH_WORKFLOW"];

function timestamp(value: number): string {
  return new Date(value).toISOString();
}

function nullableTimestamp(value: number | null): string | null {
  return value === null ? null : timestamp(value);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000) || "Unknown error"
    : "Unknown error";
}

function can(access: ResourceAccess, capability: Capability): boolean {
  return hasCapability(access.grants, access.target, capability);
}

async function collectionState(
  database: D1Database,
  collectionId: string,
): Promise<CollectionStateRow | null> {
  return database
    .prepare(
      `select
				c.id,
				c.workspace_id,
				c.archived_at,
				w.archived_at as workspace_archived_at
			from collections c
			join workspaces w on w.id = c.workspace_id
			where c.id = ?1`,
    )
    .bind(collectionId)
    .first<CollectionStateRow>();
}

function requireMutableCollection(row: CollectionStateRow): void {
  if (row.workspace_archived_at !== null) throw resourceArchived("Workspace");
  if (row.archived_at !== null) throw resourceArchived("Collection");
}

async function researchAccess(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
}): Promise<{ access: ResourceAccess; collection: CollectionStateRow }> {
  const collection = await collectionState(input.database, input.collectionId);
  if (collection === null) throw notFound();
  const access = requireCapability(
    await loadCollectionAccess(
      input.database,
      input.userId,
      input.collectionId,
    ),
    "view",
  );
  return { access, collection };
}

async function itemInCollection(
  database: D1Database,
  collection: CollectionStateRow,
  itemId: string,
): Promise<ItemScopeRow> {
  const item = await database
    .prepare(
      `select id, workspace_id, collection_id, archived_at
			from items
			where id = ?1 and collection_id = ?2 and workspace_id = ?3`,
    )
    .bind(itemId, collection.id, collection.workspace_id)
    .first<ItemScopeRow>();
  if (item === null) throw notFound();
  if (item.archived_at !== null) throw resourceArchived("Item");
  return item;
}

async function purgeExpiredSnapshots(
  database: D1Database,
  now: number,
): Promise<void> {
  await database.batch([
    database
      .prepare(
        `update research_sources
				set snapshot_json = null, updated_at = ?1
				where snapshot_json is not null and snapshot_expires_at <= ?1`,
      )
      .bind(now),
    database
      .prepare(
        `update research_results
				set summary = null, suggestion_json = null, updated_at = ?1
				where snapshot_expires_at <= ?1 and (summary is not null or suggestion_json is not null)`,
      )
      .bind(now),
  ]);
}

function permissions(access: ResourceAccess, collection: CollectionStateRow) {
  const mutable =
    collection.archived_at === null &&
    collection.workspace_archived_at === null;
  return {
    canCreate: mutable && can(access, "research_manage"),
    canCancel: mutable && can(access, "research_manage"),
    canPromote:
      mutable &&
      [
        "research_result_promote",
        "candidate_manage",
        "product_manage",
        "offer_manage",
      ].every((capability) => can(access, capability as Capability)),
    canModerate: mutable && can(access, "research_result_moderate"),
  };
}

export async function readResearchDesk(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  await purgeExpiredSnapshots(input.database, Date.now());
  const requests = await input.database
    .prepare(
      `select
				rr.*,
				u.name as created_by_name,
				u.image as created_by_image
			from research_requests rr
			join user u on u.id = rr.created_by_user_id
			where rr.collection_id = ?1
			order by rr.created_at desc, rr.id desc
			limit 20`,
    )
    .bind(collection.id)
    .all<RequestRow>();
  const requestIds = requests.results.map(({ id }) => id);
  const runs =
    requestIds.length === 0
      ? []
      : (
          await input.database
            .prepare(
              `select
								rr.*,
								u.name as requested_by_name,
								u.image as requested_by_image
							from research_runs rr
							join user u on u.id = rr.requested_by_user_id
							where rr.request_id in (select value from json_each(?1))
							order by rr.created_at desc, rr.id desc`,
            )
            .bind(JSON.stringify(requestIds))
            .all<RunRow>()
        ).results;
  const runIds = runs.map(({ id }) => id);
  const results =
    runIds.length === 0
      ? []
      : (
          await input.database
            .prepare(
              `select
								r.id,
								r.run_id,
								r.title,
								r.summary,
								r.score,
								r.status,
								r.suggestion_json,
								r.created_at,
								r.updated_at,
								s.id as source_id,
								s.url as source_url,
								s.title as source_title,
								s.provider as source_provider,
								s.retrieved_at as source_retrieved_at,
								s.extraction_status,
								s.extraction_method,
								s.extraction_metadata_json,
								s.snapshot_json,
								s.snapshot_expires_at,
								p.result_id as promotion_result_id,
								p.item_id as promotion_item_id,
								p.product_id as promotion_product_id,
								p.candidate_id as promotion_candidate_id,
								p.merchant_id as promotion_merchant_id,
								p.offer_id as promotion_offer_id,
								p.price_check_id as promotion_price_check_id,
								p.promoted_by_user_id,
								p.promoted_at
							from research_results r
							join research_sources s on s.id = r.source_id
							left join research_result_promotions p on p.result_id = r.id
							where r.run_id in (select value from json_each(?1))
							order by r.created_at, r.id`,
            )
            .bind(JSON.stringify(runIds))
            .all<ResultRow>()
        ).results;

  return researchDeskResponseSchema.parse({
    permissions: permissions(access, collection),
    requests: requests.results.map((request) => ({
      id: request.id,
      workspaceId: request.workspace_id,
      collectionId: request.collection_id,
      itemId: request.item_id,
      query: request.query,
      constraints: researchConstraintsSchema.parse(
        JSON.parse(request.constraints_json),
      ),
      createdBy: {
        id: request.created_by_user_id,
        name: request.created_by_name,
        image: request.created_by_image,
      },
      runs: runs
        .filter(({ request_id }) => request_id === request.id)
        .map((run) => ({
          id: run.id,
          status: run.status,
          provider: run.provider,
          providerQuery: run.provider_query,
          workflowInstanceId: run.workflow_instance_id,
          errorCode: run.error_code,
          errorMessage: run.error_message,
          startedAt: nullableTimestamp(run.started_at),
          finishedAt: nullableTimestamp(run.finished_at),
          requestedBy: {
            id: run.requested_by_user_id,
            name: run.requested_by_name,
            image: run.requested_by_image,
          },
          results: results
            .filter(({ run_id }) => run_id === run.id)
            .map((result) => ({
              id: result.id,
              title: result.title,
              summary: result.summary,
              score: result.score,
              status: result.status,
              suggestion:
                result.suggestion_json === null
                  ? null
                  : researchResultSuggestionSchema.parse(
                      JSON.parse(result.suggestion_json),
                    ),
              source: {
                id: result.source_id,
                url: result.source_url,
                title: result.source_title,
                provider: result.source_provider,
                retrievedAt: timestamp(result.source_retrieved_at),
                extractionStatus: result.extraction_status,
                extractionMethod: result.extraction_method,
                extractionMetadata: JSON.parse(result.extraction_metadata_json),
                snapshotAvailable: result.snapshot_json !== null,
                snapshotExpiresAt: timestamp(result.snapshot_expires_at),
              },
              promotion:
                result.promotion_result_id === null
                  ? null
                  : {
                      itemId: result.promotion_item_id!,
                      productId: result.promotion_product_id!,
                      candidateId: result.promotion_candidate_id!,
                      merchantId: result.promotion_merchant_id!,
                      offerId: result.promotion_offer_id!,
                      priceCheckId: result.promotion_price_check_id!,
                      promotedByUserId: result.promoted_by_user_id!,
                      promotedAt: timestamp(result.promoted_at!),
                    },
              createdAt: timestamp(result.created_at),
              updatedAt: timestamp(result.updated_at),
            })),
          createdAt: timestamp(run.created_at),
          updatedAt: timestamp(run.updated_at),
        })),
      createdAt: timestamp(request.created_at),
      updatedAt: timestamp(request.updated_at),
    })),
  });
}

async function launchWorkflow(input: {
  database: D1Database;
  requestId: string;
  runId: string;
  workflow: ResearchWorkflowBinding;
}): Promise<void> {
  try {
    await input.workflow.create({
      id: input.runId,
      params: { requestId: input.requestId, runId: input.runId },
    });
  } catch (error) {
    const now = Date.now();
    await input.database
      .prepare(
        `update research_runs
				set status = 'failed', error_code = 'workflow_start_failed',
					error_message = ?1, finished_at = ?2, updated_at = ?2
				where id = ?3 and status = 'queued'`,
      )
      .bind(safeErrorMessage(error), now, input.runId)
      .run();
  }
}

async function insertRun(input: {
  collection: CollectionStateRow;
  database: D1Database;
  requestId: string;
  requestValue: ResearchRequestCreateInput;
  userId: string;
  workflow: ResearchWorkflowBinding;
}): Promise<string> {
  const runId = crypto.randomUUID();
  const now = Date.now();
  const query = buildResearchProviderQuery({
    constraints: input.requestValue.constraints,
    query: input.requestValue.query,
  });
  await input.database
    .prepare(
      `insert into research_runs (
				id, request_id, workspace_id, collection_id, status, provider,
				provider_query, workflow_instance_id, requested_by_user_id,
				created_at, updated_at
			) values (?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?1, ?7, ?8, ?8)`,
    )
    .bind(
      runId,
      input.requestId,
      input.collection.workspace_id,
      input.collection.id,
      researchProviderId,
      query,
      input.userId,
      now,
    )
    .run();
  await launchWorkflow({ ...input, runId });
  return runId;
}

export async function createResearchRequest(input: {
  collectionId: string;
  database: D1Database;
  rateLimitSecret: string;
  userId: string;
  value: ResearchRequestCreateInput;
  workflow: ResearchWorkflowBinding;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  requireCapability(access, "research_manage");
  requireMutableCollection(collection);
  if (input.value.itemId !== null) {
    await itemInCollection(input.database, collection, input.value.itemId);
  }
  await enforceCollaborationRateLimit({
    action: "research_creation",
    database: input.database,
    identity: `${input.userId}:${collection.id}`,
    limit: researchCreationRateLimit.limit,
    now: Date.now(),
    secret: input.rateLimitSecret,
    windowMilliseconds: researchCreationRateLimit.windowMilliseconds,
  });
  const requestId = crypto.randomUUID();
  const now = Date.now();
  await input.database
    .prepare(
      `insert into research_requests (
				id, workspace_id, collection_id, item_id, query,
				constraints_json, created_by_user_id, created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    )
    .bind(
      requestId,
      collection.workspace_id,
      collection.id,
      input.value.itemId,
      input.value.query,
      JSON.stringify(input.value.constraints),
      input.userId,
      now,
    )
    .run();
  await insertRun({
    collection,
    database: input.database,
    requestId,
    requestValue: input.value,
    userId: input.userId,
    workflow: input.workflow,
  });
  return readResearchDesk(input);
}

export async function retryResearchRequest(input: {
  collectionId: string;
  database: D1Database;
  rateLimitSecret: string;
  requestId: string;
  userId: string;
  workflow: ResearchWorkflowBinding;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  requireCapability(access, "research_manage");
  requireMutableCollection(collection);
  const request = await input.database
    .prepare(
      `select id, item_id, query, constraints_json
			from research_requests
			where id = ?1 and collection_id = ?2 and workspace_id = ?3`,
    )
    .bind(input.requestId, collection.id, collection.workspace_id)
    .first<{
      id: string;
      item_id: string | null;
      query: string;
      constraints_json: string;
    }>();
  if (request === null) throw notFound();
  const active = await input.database
    .prepare(
      `select id from research_runs
			where request_id = ?1 and status in ('queued', 'running', 'partial')
			limit 1`,
    )
    .bind(request.id)
    .first();
  if (active !== null)
    throw conflict("This Research Request is already running.");
  if (request.item_id !== null) {
    await itemInCollection(input.database, collection, request.item_id);
  }
  await enforceCollaborationRateLimit({
    action: "research_creation",
    database: input.database,
    identity: `${input.userId}:${collection.id}`,
    limit: researchCreationRateLimit.limit,
    now: Date.now(),
    secret: input.rateLimitSecret,
    windowMilliseconds: researchCreationRateLimit.windowMilliseconds,
  });
  await insertRun({
    collection,
    database: input.database,
    requestId: request.id,
    requestValue: {
      query: request.query,
      itemId: request.item_id,
      constraints: researchConstraintsSchema.parse(
        JSON.parse(request.constraints_json),
      ),
    },
    userId: input.userId,
    workflow: input.workflow,
  });
  return readResearchDesk(input);
}

export async function cancelResearchRun(input: {
  collectionId: string;
  database: D1Database;
  runId: string;
  userId: string;
  workflow: ResearchWorkflowBinding;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  requireCapability(access, "research_manage");
  requireMutableCollection(collection);
  const run = await input.database
    .prepare(
      `select id, status, workflow_instance_id
			from research_runs
			where id = ?1 and collection_id = ?2 and workspace_id = ?3`,
    )
    .bind(input.runId, collection.id, collection.workspace_id)
    .first<{
      id: string;
      status: ResearchRunStatus;
      workflow_instance_id: string;
    }>();
  if (run === null) throw notFound();
  if (isResearchRunTerminal(run.status)) {
    throw conflict("Only an active Research Run can be cancelled.");
  }
  const now = Date.now();
  await input.database
    .prepare(
      `update research_runs
			set status = 'cancelled', finished_at = ?1, updated_at = ?1
			where id = ?2 and status in ('queued', 'running', 'partial')`,
    )
    .bind(now, run.id)
    .run();
  try {
    const instance = await input.workflow.get(run.workflow_instance_id);
    await instance.terminate();
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "research_workflow_termination_failed",
        runId: run.id,
        error: safeErrorMessage(error),
      }),
    );
  }
  return readResearchDesk(input);
}

export async function moderateResearchResult(input: {
  collectionId: string;
  database: D1Database;
  dismissed: boolean;
  resultId: string;
  userId: string;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  requireCapability(access, "research_result_moderate");
  requireMutableCollection(collection);
  const updated = await input.database
    .prepare(
      `update research_results
			set status = ?1, updated_at = ?2
			where id = ?3 and run_id in (
				select id from research_runs where collection_id = ?4 and workspace_id = ?5
			)
			returning id`,
    )
    .bind(
      input.dismissed ? "dismissed" : "active",
      Date.now(),
      input.resultId,
      collection.id,
      collection.workspace_id,
    )
    .first();
  if (updated === null) throw notFound();
  return readResearchDesk(input);
}

async function promotionState(
  database: D1Database,
  collection: CollectionStateRow,
  resultId: string,
): Promise<PromotionStateRow | null> {
  return database
    .prepare(
      `select
				r.id as result_id,
				r.status as result_status,
				run.workspace_id,
				run.collection_id,
				s.url as source_url,
				p.result_id as promotion_result_id
			from research_results r
			join research_sources s on s.id = r.source_id
			join research_runs run on run.id = r.run_id
			left join research_result_promotions p on p.result_id = r.id
			where r.id = ?1 and run.collection_id = ?2 and run.workspace_id = ?3`,
    )
    .bind(resultId, collection.id, collection.workspace_id)
    .first<PromotionStateRow>();
}

export async function promoteResearchResult(input: {
  collectionId: string;
  database: D1Database;
  resultId: string;
  userId: string;
  value: ResearchResultPromotionInput;
}): Promise<ResearchDeskResponse> {
  const { access, collection } = await researchAccess(input);
  for (const capability of [
    "research_result_promote",
    "candidate_manage",
    "product_manage",
    "offer_manage",
  ] as const) {
    requireCapability(access, capability);
  }
  requireMutableCollection(collection);
  const parsed = researchResultPromotionInputSchema.parse(input.value);
  const state = await promotionState(
    input.database,
    collection,
    input.resultId,
  );
  if (state === null) throw notFound();
  if (state.promotion_result_id !== null) return readResearchDesk(input);
  if (state.result_status !== "active") {
    throw conflict("Restore this Research Result before promoting it.");
  }
  await itemInCollection(input.database, collection, parsed.itemId);
  const product = productInputSchema.parse(parsed.product);
  const candidate = candidateCreateInputSchema.parse({
    product: { kind: "new", value: product },
    plannedPurchaseQuantity: parsed.plannedPurchaseQuantity,
    notes: parsed.candidateNotes,
    rank: null,
  });
  const merchant = merchantInputSchema.parse(parsed.merchant);
  const existingMerchant = await input.database
    .prepare(
      `select id from merchants
			where workspace_id = ?1 and name = ?2 and archived_at is null
			limit 1`,
    )
    .bind(collection.workspace_id, merchant.name)
    .first<{ id: string }>();
  const prefix = `research-${state.result_id}`;
  const ids = {
    candidate: `${prefix}-candidate`,
    merchant: existingMerchant?.id ?? `${prefix}-merchant`,
    offer: `${prefix}-offer`,
    priceCheck: `${prefix}-price-check`,
    product: `${prefix}-product`,
  };
  const observedAt = Date.now();
  const offer = offerInputSchema.parse({
    merchantId: ids.merchant,
    sourceUrl: state.source_url,
    locale: parsed.offer.locale,
    facts: parsed.offer.facts,
    observedAt: new Date(observedAt).toISOString(),
  });
  priceCheckInputSchema.parse({
    facts: offer.facts,
    observedAt: offer.observedAt,
  });
  const statements: D1PreparedStatement[] = [];
  if (existingMerchant === null) {
    statements.push(
      input.database
        .prepare(
          `insert into merchants (
						id, workspace_id, name, sales_channel, website_url, notes,
						created_by_user_id, created_at, updated_at
					) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
        )
        .bind(
          ids.merchant,
          collection.workspace_id,
          merchant.name,
          merchant.salesChannel,
          merchant.websiteUrl,
          merchant.notes,
          input.userId,
          observedAt,
        ),
    );
  }
  statements.push(
    input.database
      .prepare(
        `insert into products (
					id, workspace_id, title, brand, model, category, attributes_json,
					created_by_user_id, created_at, updated_at
				) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      )
      .bind(
        ids.product,
        collection.workspace_id,
        product.title,
        product.brand,
        product.model,
        product.category,
        JSON.stringify(product.attributes),
        input.userId,
        observedAt,
      ),
    input.database
      .prepare(
        `insert into item_candidates (
					id, workspace_id, item_id, product_id, planned_purchase_quantity,
					is_planned, planned_offer_id, notes, rank, created_by_user_id,
					created_at, updated_at
				) values (?1, ?2, ?3, ?4, ?5, 0, null, ?6, ?7, ?8, ?9, ?9)`,
      )
      .bind(
        ids.candidate,
        collection.workspace_id,
        parsed.itemId,
        ids.product,
        candidate.plannedPurchaseQuantity,
        candidate.notes,
        candidate.rank,
        input.userId,
        observedAt,
      ),
    input.database
      .prepare(
        `insert into offers (
					id, workspace_id, product_id, merchant_id, source_url,
					price_kind, unit_price_minor, currency, shipping_minor,
					shipping_basis, availability_state, availability_channel,
					availability_location, availability_variant, availability_note,
					locale, last_checked_at, created_by_user_id, created_at, updated_at
				) values (
					?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
					?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19
				)`,
      )
      .bind(
        ids.offer,
        collection.workspace_id,
        ids.product,
        ids.merchant,
        offer.sourceUrl,
        offer.facts.priceKind,
        offer.facts.unitPriceMinor,
        offer.facts.currency,
        offer.facts.shippingMinor,
        offer.facts.shippingBasis,
        offer.facts.availabilityState,
        offer.facts.availabilityChannel,
        offer.facts.availabilityLocation,
        offer.facts.availabilityVariant,
        offer.facts.availabilityNote,
        offer.locale,
        observedAt,
        input.userId,
        observedAt,
      ),
    input.database
      .prepare(
        `insert into price_checks (
					id, offer_id, price_kind, unit_price_minor, currency,
					shipping_minor, shipping_basis, availability_state,
					availability_channel, availability_location,
					availability_variant, availability_note, observed_at,
					observed_by_user_id, created_at
				) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?13)`,
      )
      .bind(
        ids.priceCheck,
        ids.offer,
        offer.facts.priceKind,
        offer.facts.unitPriceMinor,
        offer.facts.currency,
        offer.facts.shippingMinor,
        offer.facts.shippingBasis,
        offer.facts.availabilityState,
        offer.facts.availabilityChannel,
        offer.facts.availabilityLocation,
        offer.facts.availabilityVariant,
        offer.facts.availabilityNote,
        observedAt,
        input.userId,
      ),
    input.database
      .prepare(
        `insert into research_result_promotions (
					result_id, workspace_id, collection_id, item_id, product_id,
					candidate_id, merchant_id, offer_id, price_check_id,
					promoted_by_user_id, promoted_at
				) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
        state.result_id,
        collection.workspace_id,
        collection.id,
        parsed.itemId,
        ids.product,
        ids.candidate,
        ids.merchant,
        ids.offer,
        ids.priceCheck,
        input.userId,
        observedAt,
      ),
  );
  try {
    await input.database.batch(statements);
  } catch (error) {
    const raced = await promotionState(
      input.database,
      collection,
      input.resultId,
    );
    if (raced?.promotion_result_id == null) throw error;
  }
  return readResearchDesk(input);
}

export async function loadResearchExecution(input: {
  database: D1Database;
  requestId: string;
  runId: string;
}): Promise<ResearchExecution | null> {
  const row = await input.database
    .prepare(
      `select
				r.id as run_id,
				r.request_id,
				r.workspace_id,
				r.collection_id,
				r.status,
				rq.query,
				rq.constraints_json
			from research_runs r
			join research_requests rq on rq.id = r.request_id
			where r.id = ?1 and r.request_id = ?2`,
    )
    .bind(input.runId, input.requestId)
    .first<ExecutionRow>();
  if (row === null || isResearchRunTerminal(row.status)) return null;
  if (row.status === "queued") {
    const now = Date.now();
    await input.database
      .prepare(
        `update research_runs
				set status = 'running', started_at = ?1, updated_at = ?1
				where id = ?2 and status = 'queued'`,
      )
      .bind(now, row.run_id)
      .run();
  }
  return {
    collectionId: row.collection_id,
    constraints: researchConstraintsSchema.parse(
      JSON.parse(row.constraints_json),
    ),
    query: row.query,
    requestId: row.request_id,
    runId: row.run_id,
    workspaceId: row.workspace_id,
  };
}

function inferredSuggestion(input: {
  title: string;
  url: string;
}): ResearchResultSuggestion {
  const url = new URL(input.url);
  return researchResultSuggestionSchema.parse({
    product: {
      attributes: [],
      brand: null,
      category: null,
      model: null,
      title: input.title,
    },
    merchant: {
      name: url.hostname.replace(/^www\./u, "").slice(0, 160),
      notes: "Merchant name inferred from the Research Source hostname.",
      salesChannel: "online",
      websiteUrl: url.origin,
    },
    offer: {
      facts: {
        availabilityChannel: null,
        availabilityLocation: null,
        availabilityNote: null,
        availabilityState: "unknown",
        availabilityVariant: null,
        currency: null,
        priceKind: "unknown",
        shippingBasis: "unknown",
        shippingMinor: null,
        unitPriceMinor: null,
      },
      locale: null,
    },
  });
}

export async function persistResearchSearchResults(input: {
  allowedOrigin: string;
  database: D1Database;
  execution: ResearchExecution;
  output: ResearchProviderSearchOutput;
}): Promise<StoredResearchResult[]> {
  const active = await input.database
    .prepare(
      `select id from research_runs
			where id = ?1 and status in ('running', 'partial')`,
    )
    .bind(input.execution.runId)
    .first();
  if (active === null) return [];
  const retrievedAt = Date.now();
  const expiresAt = researchSnapshotExpiresAt(retrievedAt);
  const stored: StoredResearchResult[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const [index, result] of input.output.results.entries()) {
    const position = String(index + 1).padStart(2, "0");
    const sourceId = `${input.execution.runId}-source-${position}`;
    const resultId = `${input.execution.runId}-result-${position}`;
    const allowed = isResearchBrowserUrlAllowed(
      result.url,
      input.allowedOrigin,
    );
    const suggestion = inferredSuggestion(result);
    statements.push(
      input.database
        .prepare(
          `insert or ignore into research_sources (
						id, run_id, request_id, workspace_id, collection_id, url,
						title, provider, retrieved_at, extraction_status,
						extraction_method, extraction_metadata_json, snapshot_json,
						snapshot_expires_at, created_at, updated_at
					) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'search', ?11, ?12, ?13, ?9, ?9)`,
        )
        .bind(
          sourceId,
          input.execution.runId,
          input.execution.requestId,
          input.execution.workspaceId,
          input.execution.collectionId,
          result.url,
          result.title,
          researchProviderId,
          retrievedAt,
          allowed ? "not_requested" : "not_allowed",
          JSON.stringify({
            providerRequestId: input.output.providerRequestId,
            rank: index + 1,
          }),
          JSON.stringify({ search: result }),
          expiresAt,
        ),
      input.database
        .prepare(
          `insert or ignore into research_results (
						id, run_id, source_id, title, summary, score, status,
						suggestion_json, snapshot_expires_at, created_at, updated_at
					) values (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?8, ?9, ?9)`,
        )
        .bind(
          resultId,
          input.execution.runId,
          sourceId,
          result.title,
          result.content,
          result.score,
          JSON.stringify(suggestion),
          expiresAt,
          retrievedAt,
        ),
    );
    stored.push({
      browserExtractionAllowed: allowed,
      resultId,
      sourceId,
      title: result.title,
      url: result.url,
    });
  }
  statements.push(
    input.database
      .prepare(
        `update research_runs
				set status = 'partial', updated_at = ?1
				where id = ?2 and status = 'running'`,
      )
      .bind(retrievedAt, input.execution.runId),
  );
  await input.database.batch(statements);
  return stored;
}

export async function persistResearchExtractions(input: {
  database: D1Database;
  runId: string;
  updates: ResearchExtractionUpdate[];
}): Promise<void> {
  if (input.updates.length === 0) return;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const update of input.updates) {
    statements.push(
      input.database
        .prepare(
          `update research_sources
					set extraction_status = ?1,
						extraction_method = 'browser_run',
						extraction_metadata_json = ?2,
						snapshot_json = json_patch(coalesce(snapshot_json, '{}'), ?3),
						updated_at = ?4
					where id = ?5 and run_id = ?6`,
        )
        .bind(
          update.status,
          JSON.stringify(update.metadata),
          JSON.stringify({ browserRun: update.metadata }),
          now,
          update.sourceId,
          input.runId,
        ),
    );
    if (update.status === "completed" && update.suggestion !== undefined) {
      statements.push(
        input.database
          .prepare(
            `update research_results
						set suggestion_json = ?1, updated_at = ?2
						where id = ?3 and run_id = ?4`,
          )
          .bind(
            JSON.stringify(update.suggestion),
            now,
            update.resultId,
            input.runId,
          ),
      );
    }
  }
  await input.database.batch(statements);
}

export async function completeResearchRun(
  database: D1Database,
  runId: string,
): Promise<void> {
  const now = Date.now();
  await database
    .prepare(
      `update research_runs
			set status = 'completed', finished_at = ?1, updated_at = ?1
			where id = ?2 and status in ('running', 'partial')`,
    )
    .bind(now, runId)
    .run();
}

export async function failResearchRun(input: {
  code: string;
  database: D1Database;
  message: string;
  runId: string;
}): Promise<void> {
  const now = Date.now();
  await input.database
    .prepare(
      `update research_runs
			set status = 'failed', error_code = ?1, error_message = ?2,
				finished_at = ?3, updated_at = ?3
			where id = ?4 and status in ('queued', 'running', 'partial')`,
    )
    .bind(
      input.code.slice(0, 80),
      input.message.slice(0, 1_000),
      now,
      input.runId,
    )
    .run();
}
