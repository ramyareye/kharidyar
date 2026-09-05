import type {
  CollectionBriefInput,
  CollectionBriefResource,
  ConceptInput,
  ConceptResource,
} from "@kharidyar/contracts";
import { hasCapability, type Capability } from "@kharidyar/domain";

import { conflict, notFound, resourceArchived } from "./api-errors";
import {
  loadCollectionAccess,
  requireCapability,
  type ResourceAccess,
} from "./authorization";

interface CollectionStateRow {
  archived_at: number | null;
  workspace_archived_at: number | null;
}

interface BriefRow {
  id: string;
  collection_id: string;
  title: string | null;
  description: string | null;
  keywords_json: string;
  materials_json: string;
  preferred_brands_json: string;
  intended_use: string | null;
  requirements: string | null;
  things_to_avoid: string | null;
  reference_urls_json: string;
  budget_minor: number | null;
  budget_currency: string | null;
  created_at: number;
  updated_at: number;
}

interface BriefColorRow {
  kind: "core" | "supporting";
  position: number;
  hex: string;
  label: string | null;
  usage_note: string | null;
}

interface ConceptRow {
  id: string;
  collection_id: string;
  title: string;
  narrative: string;
  created_at: number;
  updated_at: number;
}

function timestamp(value: number): string {
  return new Date(value).toISOString();
}

function parseStringList(value: string, field: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Stored ${field} is not valid JSON`);
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((entry) => typeof entry === "string")
  ) {
    throw new Error(`Stored ${field} is not a string list`);
  }
  return parsed;
}

function briefResource(
  row: BriefRow,
  colors: readonly BriefColorRow[],
): CollectionBriefResource {
  if ((row.budget_minor === null) !== (row.budget_currency === null)) {
    throw new Error("Stored Collection Brief budget is inconsistent");
  }
  if (row.budget_currency !== null && row.budget_currency !== "EUR") {
    throw new Error("Stored Collection Brief budget currency is unsupported");
  }

  const colorPreference: CollectionBriefResource["colorPreference"] = {
    core: [],
    supporting: [],
  };
  for (const color of colors) {
    colorPreference[color.kind].push({
      hex: color.hex,
      label: color.label,
      usageNote: color.usage_note,
    });
  }

  return {
    id: row.id,
    collectionId: row.collection_id,
    title: row.title,
    description: row.description,
    keywords: parseStringList(row.keywords_json, "Brief keywords"),
    materials: parseStringList(row.materials_json, "Brief materials"),
    preferredBrands: parseStringList(
      row.preferred_brands_json,
      "Brief preferred brands",
    ),
    intendedUse: row.intended_use,
    requirements: row.requirements,
    thingsToAvoid: row.things_to_avoid,
    referenceUrls: parseStringList(
      row.reference_urls_json,
      "Brief reference URLs",
    ),
    budget:
      row.budget_minor === null || row.budget_currency === null
        ? null
        : { minor: row.budget_minor, currency: "EUR" },
    colorPreference,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function conceptResource(row: ConceptRow): ConceptResource {
  return {
    id: row.id,
    collectionId: row.collection_id,
    title: row.title,
    narrative: row.narrative,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

async function collectionAccess(
  database: D1Database,
  userId: string,
  collectionId: string,
  capability: Capability,
): Promise<ResourceAccess> {
  return requireCapability(
    await loadCollectionAccess(database, userId, collectionId),
    capability,
  );
}

async function requireMutableCollection(
  database: D1Database,
  userId: string,
  collectionId: string,
  capability: Capability,
): Promise<ResourceAccess> {
  const access = await collectionAccess(
    database,
    userId,
    collectionId,
    capability,
  );
  const state = await database
    .prepare(
      `select
				c.archived_at,
				w.archived_at as workspace_archived_at
			from collections c
			join workspaces w on w.id = c.workspace_id
			where c.id = ?1`,
    )
    .bind(collectionId)
    .first<CollectionStateRow>();
  if (state === null) {
    throw notFound();
  }
  if (state.workspace_archived_at !== null) {
    throw resourceArchived("Workspace");
  }
  if (state.archived_at !== null) {
    throw resourceArchived("Collection");
  }
  return access;
}

async function activeBriefRow(
  database: D1Database,
  collectionId: string,
): Promise<BriefRow | null> {
  return database
    .prepare(
      `select
				id, collection_id, title, description, keywords_json,
				materials_json, preferred_brands_json, intended_use,
				requirements, things_to_avoid, reference_urls_json,
				budget_minor, budget_currency, created_at, updated_at
			from collection_briefs
			where collection_id = ?1`,
    )
    .bind(collectionId)
    .first<BriefRow>();
}

async function briefColors(
  database: D1Database,
  briefId: string,
): Promise<BriefColorRow[]> {
  const result = await database
    .prepare(
      `select kind, position, hex, label, usage_note
			from collection_brief_colors
			where collection_brief_id = ?1
			order by case kind when 'core' then 0 else 1 end, position`,
    )
    .bind(briefId)
    .all<BriefColorRow>();
  return result.results;
}

async function activeConceptRow(
  database: D1Database,
  collectionId: string,
): Promise<ConceptRow | null> {
  return database
    .prepare(
      `select id, collection_id, title, narrative, created_at, updated_at
			from concepts
			where collection_id = ?1 and archived_at is null`,
    )
    .bind(collectionId)
    .first<ConceptRow>();
}

export async function readCollectionBrief(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
}): Promise<{ brief: CollectionBriefResource | null; canEdit: boolean }> {
  const access = await collectionAccess(
    input.database,
    input.userId,
    input.collectionId,
    "view",
  );
  const row = await activeBriefRow(input.database, input.collectionId);
  return {
    brief:
      row === null
        ? null
        : briefResource(row, await briefColors(input.database, row.id)),
    canEdit: hasCapability(
      access.grants,
      access.target,
      "collection_brief_edit",
    ),
  };
}

export async function saveCollectionBrief(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
  value: CollectionBriefInput;
}): Promise<CollectionBriefResource> {
  await requireMutableCollection(
    input.database,
    input.userId,
    input.collectionId,
    "collection_brief_edit",
  );
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    input.database
      .prepare(
        `insert into collection_briefs (
					id, collection_id, title, description, keywords_json,
					materials_json, preferred_brands_json, intended_use,
					requirements, things_to_avoid, reference_urls_json,
					budget_minor, budget_currency, created_at, updated_at
				)
				select
					?1, c.id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
					?11, ?12, ?13, ?13
				from collections c
				join workspaces w on w.id = c.workspace_id
				where c.id = ?14
					and c.archived_at is null
					and w.archived_at is null
					and (
						exists (
							select 1 from workspace_memberships wm
							where wm.workspace_id = c.workspace_id
								and wm.user_id = ?15
								and wm.role in ('editor', 'owner')
						)
						or exists (
							select 1 from collection_memberships cm
							where cm.collection_id = c.id
								and cm.user_id = ?15
								and cm.role in ('editor', 'owner')
						)
					)
				on conflict(collection_id) do update set
					title = excluded.title,
					description = excluded.description,
					keywords_json = excluded.keywords_json,
					materials_json = excluded.materials_json,
					preferred_brands_json = excluded.preferred_brands_json,
					intended_use = excluded.intended_use,
					requirements = excluded.requirements,
					things_to_avoid = excluded.things_to_avoid,
					reference_urls_json = excluded.reference_urls_json,
					budget_minor = excluded.budget_minor,
					budget_currency = excluded.budget_currency,
					updated_at = excluded.updated_at
				where exists (
					select 1
					from collections c
					join workspaces w on w.id = c.workspace_id
					where c.id = collection_briefs.collection_id
						and c.archived_at is null
						and w.archived_at is null
						and (
							exists (
								select 1 from workspace_memberships wm
								where wm.workspace_id = c.workspace_id
									and wm.user_id = ?15
									and wm.role in ('editor', 'owner')
							)
							or exists (
								select 1 from collection_memberships cm
								where cm.collection_id = c.id
									and cm.user_id = ?15
									and cm.role in ('editor', 'owner')
							)
						)
				)
				returning
					id, collection_id, title, description, keywords_json,
					materials_json, preferred_brands_json, intended_use,
					requirements, things_to_avoid, reference_urls_json,
					budget_minor, budget_currency, created_at, updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        input.value.title,
        input.value.description,
        JSON.stringify(input.value.keywords),
        JSON.stringify(input.value.materials),
        JSON.stringify(input.value.preferredBrands),
        input.value.intendedUse,
        input.value.requirements,
        input.value.thingsToAvoid,
        JSON.stringify(input.value.referenceUrls),
        input.value.budget?.minor ?? null,
        input.value.budget?.currency ?? null,
        now,
        input.collectionId,
        input.userId,
      ),
    input.database
      .prepare(
        `delete from collection_brief_colors
				where collection_brief_id in (
					select b.id
					from collection_briefs b
					join collections c on c.id = b.collection_id
					join workspaces w on w.id = c.workspace_id
					where c.id = ?1
						and c.archived_at is null
						and w.archived_at is null
						and (
							exists (
								select 1 from workspace_memberships wm
								where wm.workspace_id = c.workspace_id
									and wm.user_id = ?2
									and wm.role in ('editor', 'owner')
							)
							or exists (
								select 1 from collection_memberships cm
								where cm.collection_id = c.id
									and cm.user_id = ?2
									and cm.role in ('editor', 'owner')
							)
						)
				)`,
      )
      .bind(input.collectionId, input.userId),
  ];

  for (const [kind, colors] of [
    ["core", input.value.colorPreference.core],
    ["supporting", input.value.colorPreference.supporting],
  ] as const) {
    for (const [position, color] of colors.entries()) {
      statements.push(
        input.database
          .prepare(
            `insert into collection_brief_colors (
							id, collection_brief_id, kind, position, hex, label,
							usage_note, created_at, updated_at
						)
						select ?1, b.id, ?2, ?3, ?4, ?5, ?6, ?7, ?7
						from collection_briefs b
						join collections c on c.id = b.collection_id
						join workspaces w on w.id = c.workspace_id
						where c.id = ?8
							and c.archived_at is null
							and w.archived_at is null
							and (
								exists (
									select 1 from workspace_memberships wm
									where wm.workspace_id = c.workspace_id
										and wm.user_id = ?9
										and wm.role in ('editor', 'owner')
								)
								or exists (
									select 1 from collection_memberships cm
									where cm.collection_id = c.id
										and cm.user_id = ?9
										and cm.role in ('editor', 'owner')
								)
							)`,
          )
          .bind(
            crypto.randomUUID(),
            kind,
            position,
            color.hex,
            color.label,
            color.usageNote,
            now,
            input.collectionId,
            input.userId,
          ),
      );
    }
  }

  const results = await input.database.batch<BriefRow>(statements);
  if (!results[0]?.results[0]) {
    await requireMutableCollection(
      input.database,
      input.userId,
      input.collectionId,
      "collection_brief_edit",
    );
    throw conflict("The Collection changed. Please retry.");
  }

  const saved = await readCollectionBrief(input);
  if (saved.brief === null) {
    throw conflict("The Collection Brief changed. Please retry.");
  }
  return saved.brief;
}

export async function readConcept(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
}): Promise<{ concept: ConceptResource | null; canEdit: boolean }> {
  const access = await collectionAccess(
    input.database,
    input.userId,
    input.collectionId,
    "view",
  );
  const row = await activeConceptRow(input.database, input.collectionId);
  return {
    concept: row === null ? null : conceptResource(row),
    canEdit: hasCapability(access.grants, access.target, "concept_edit"),
  };
}

export async function saveConcept(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
  value: ConceptInput;
}): Promise<ConceptResource> {
  await requireMutableCollection(
    input.database,
    input.userId,
    input.collectionId,
    "concept_edit",
  );
  const current = await activeConceptRow(input.database, input.collectionId);
  const now = Date.now();
  const statement =
    current === null
      ? input.database
          .prepare(
            `insert into concepts (
							id, collection_id, title, narrative, created_by_user_id,
							updated_by_user_id, created_at, updated_at
						)
						select ?1, c.id, ?2, ?3, ?4, ?4, ?5, ?5
						from collections c
						join workspaces w on w.id = c.workspace_id
						where c.id = ?6
							and c.archived_at is null
							and w.archived_at is null
							and (
								exists (
									select 1 from workspace_memberships wm
									where wm.workspace_id = c.workspace_id
										and wm.user_id = ?4
										and wm.role in ('editor', 'owner')
								)
								or exists (
									select 1 from collection_memberships cm
									where cm.collection_id = c.id
										and cm.user_id = ?4
										and cm.role in ('editor', 'owner')
								)
							)
						returning id, collection_id, title, narrative, created_at, updated_at`,
          )
          .bind(
            crypto.randomUUID(),
            input.value.title,
            input.value.narrative,
            input.userId,
            now,
            input.collectionId,
          )
      : input.database
          .prepare(
            `update concepts
						set title = ?1, narrative = ?2, updated_by_user_id = ?3,
							updated_at = ?4
						where id = ?5
							and archived_at is null
							and exists (
								select 1
								from collections c
								join workspaces w on w.id = c.workspace_id
								where c.id = concepts.collection_id
									and c.archived_at is null
									and w.archived_at is null
									and (
										exists (
											select 1 from workspace_memberships wm
											where wm.workspace_id = c.workspace_id
												and wm.user_id = ?3
												and wm.role in ('editor', 'owner')
										)
										or exists (
											select 1 from collection_memberships cm
											where cm.collection_id = c.id
												and cm.user_id = ?3
												and cm.role in ('editor', 'owner')
										)
									)
							)
						returning id, collection_id, title, narrative, created_at, updated_at`,
          )
          .bind(
            input.value.title,
            input.value.narrative,
            input.userId,
            now,
            current.id,
          );

  let saved: ConceptRow | null;
  try {
    saved = await statement.first<ConceptRow>();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      throw conflict("The Concept changed. Please retry.");
    }
    throw error;
  }
  if (saved === null) {
    await requireMutableCollection(
      input.database,
      input.userId,
      input.collectionId,
      "concept_edit",
    );
    throw conflict("The Concept changed. Please retry.");
  }
  return conceptResource(saved);
}

export async function removeConcept(input: {
  collectionId: string;
  database: D1Database;
  userId: string;
}): Promise<string | null> {
  await requireMutableCollection(
    input.database,
    input.userId,
    input.collectionId,
    "concept_edit",
  );
  const current = await activeConceptRow(input.database, input.collectionId);
  if (current === null) {
    return null;
  }
  const now = Date.now();
  const result = await input.database
    .prepare(
      `update concepts
			set archived_at = ?1, updated_by_user_id = ?2, updated_at = ?1
			where id = ?3
				and archived_at is null
				and exists (
					select 1
					from collections c
					join workspaces w on w.id = c.workspace_id
					where c.id = concepts.collection_id
						and c.archived_at is null
						and w.archived_at is null
						and (
							exists (
								select 1 from workspace_memberships wm
								where wm.workspace_id = c.workspace_id
									and wm.user_id = ?2
									and wm.role in ('editor', 'owner')
							)
							or exists (
								select 1 from collection_memberships cm
								where cm.collection_id = c.id
									and cm.user_id = ?2
									and cm.role in ('editor', 'owner')
							)
						)
				)`,
    )
    .bind(now, input.userId, current.id)
    .run();
  if (result.meta.changes !== 1) {
    await requireMutableCollection(
      input.database,
      input.userId,
      input.collectionId,
      "concept_edit",
    );
    if ((await activeConceptRow(input.database, input.collectionId)) === null) {
      return current.id;
    }
    throw conflict("The Concept changed. Please retry.");
  }
  return current.id;
}
