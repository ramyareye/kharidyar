import {
  floorPlanDetailsSchema,
  floorPlanLimits,
  type FloorPlanDetails,
  type FloorPlanResource,
  type FloorPlansResponse,
} from "@kharidyar/contracts";
import { hasCapability } from "@kharidyar/domain";
import {
  ApiError,
  badRequest,
  conflict,
  notFound,
  resourceArchived,
} from "./api-errors";
import { loadCollectionAccess, requireCapability } from "./authorization";
import { enforceCollaborationRateLimit } from "./collaboration-rate-limit";
import { normalizePrivateImage } from "./private-image";

interface CollectionInput {
  database: D1Database;
  collectionId: string;
  userId: string;
}
interface PlanRow {
  id: string;
  collection_id: string;
  title: string;
  notes: string | null;
  object_key: string;
  content_type: "image/webp" | "application/pdf";
  byte_size: number;
  width: number | null;
  height: number | null;
  created_at: number;
  updated_at: number;
}

// Same roles as collection_brief_edit, rechecked in the committing statement.
// Every mutation binds collectionId and actor as parameters 1 and 2.
const mutableCollectionSql = `exists (
	select 1 from collections c join workspaces w on w.id=c.workspace_id
	where c.id=?1 and c.archived_at is null and w.archived_at is null and (
		exists (select 1 from workspace_memberships m where m.workspace_id=c.workspace_id and m.user_id=?2 and m.role in ('editor','owner'))
		or exists (select 1 from collection_memberships m where m.collection_id=c.id and m.user_id=?2 and m.role in ('editor','owner'))
	)
)`;

function resource(row: PlanRow): FloorPlanResource {
  return {
    id: row.id,
    collectionId: row.collection_id,
    title: row.title,
    notes: row.notes,
    contentType: row.content_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    contentUrl: `/api/collections/${encodeURIComponent(row.collection_id)}/floor-plans/${encodeURIComponent(row.id)}/content`,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function collectionAccess(input: CollectionInput, mutate = false) {
  const access = requireCapability(
    await loadCollectionAccess(
      input.database,
      input.userId,
      input.collectionId,
    ),
    mutate ? "collection_brief_edit" : "view",
  );
  const state = await input.database
    .prepare(
      `select c.archived_at, w.archived_at as workspace_archived_at
		from collections c join workspaces w on w.id=c.workspace_id where c.id=?`,
    )
    .bind(input.collectionId)
    .first<{
      archived_at: number | null;
      workspace_archived_at: number | null;
    }>();
  if (!state) throw notFound();
  const archived =
    state.archived_at !== null || state.workspace_archived_at !== null;
  if (mutate && archived) throw resourceArchived("Collection");
  return {
    canManage:
      !archived &&
      hasCapability(access.grants, access.target, "collection_brief_edit"),
  };
}

async function readyPlan(
  input: CollectionInput & { planId: string },
  mutate = false,
) {
  await collectionAccess(input, mutate);
  const row = await input.database
    .prepare(
      `select * from floor_plans where id=? and collection_id=? and status='ready'`,
    )
    .bind(input.planId, input.collectionId)
    .first<PlanRow>();
  if (!row) throw notFound();
  return row;
}

async function eraseObject(
  database: D1Database,
  bucket: R2Bucket,
  row: Pick<PlanRow, "id" | "object_key">,
) {
  await bucket.delete(row.object_key);
  await database
    .prepare(
      `update floor_plans set object_deleted_at=? where id=? and status='deleted'`,
    )
    .bind(Date.now(), row.id)
    .run();
}

async function cleanup(input: CollectionInput & { bucket: R2Bucket }) {
  // Abandoned reservations remain private and are reclaimed on an authorized visit.
  await input.database
    .prepare(
      `update floor_plans set status='deleted', title='Deleted floor plan', notes=null, updated_at=?
		where collection_id=? and status='pending' and created_at < ?`,
    )
    .bind(Date.now(), input.collectionId, Date.now() - 60 * 60_000)
    .run();
  const rows = await input.database
    .prepare(
      `select id,object_key from floor_plans
		where collection_id=? and status='deleted' and object_deleted_at is null limit 20`,
    )
    .bind(input.collectionId)
    .all<Pick<PlanRow, "id" | "object_key">>();
  for (const row of rows.results) {
    try {
      await eraseObject(input.database, input.bucket, row);
    } catch {
      console.warn({ event: "floor_plan_cleanup_failed", planId: row.id });
    }
  }
}

export async function readFloorPlans(
  input: CollectionInput & { bucket?: R2Bucket },
): Promise<FloorPlansResponse> {
  const permissions = await collectionAccess(input);
  if (input.bucket) await cleanup({ ...input, bucket: input.bucket });
  const rows = await input.database
    .prepare(
      `select * from floor_plans
		where collection_id=? and status='ready' order by created_at,id`,
    )
    .bind(input.collectionId)
    .all<PlanRow>();
  return { plans: rows.results.map(resource), permissions };
}

export async function readFloorPlan(
  input: CollectionInput & { planId: string },
) {
  return resource(await readyPlan(input));
}

export async function readFloorPlanContext(input: CollectionInput) {
  const { plans } = await readFloorPlans(input);
  return plans.map(({ id, title, notes, contentType, updatedAt }) => ({
    id,
    title,
    notes,
    contentType,
    updatedAt,
  }));
}

function uploadParts(form: FormData) {
  for (const key of form.keys()) {
    if (
      !["file", "title", "notes"].includes(key) ||
      form.getAll(key).length !== 1
    )
      throw badRequest("Invalid floor-plan upload fields.");
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw badRequest("Choose a floor-plan image or PDF.");
  const parsed = floorPlanDetailsSchema.safeParse({
    title: form.get("title"),
    notes: form.get("notes"),
  });
  if (!parsed.success)
    throw badRequest("Enter a title and up to 4000 characters of room notes.");
  if (file.size <= 0 || file.size > floorPlanLimits.maxFileBytes)
    throw new ApiError(
      409,
      "MEDIA_LIMIT_EXCEEDED",
      "Floor plans must be no larger than 10 MiB.",
    );
  return { file, details: parsed.data };
}

async function fileContent(file: File, images: ImagesBinding) {
  if (file.type === "application/pdf") {
    const bytes = await file.arrayBuffer();
    const header = new TextDecoder().decode(bytes.slice(0, 16));
    const tail = new TextDecoder().decode(bytes.slice(-1024));
    if (
      !/^%PDF-(1\.[0-7]|2\.0)(?:\s|$)/.test(header) ||
      !/%%EOF\s*$/.test(tail)
    )
      throw new ApiError(
        400,
        "INVALID_MEDIA",
        "The file does not have a supported PDF header and end marker.",
      );
    // Opaque, untrusted PDF: never parsed/executed here or embedded in our origin.
    // It is served only as an authenticated attachment, with its original bytes.
    return {
      bytes,
      contentType: "application/pdf" as const,
      width: null,
      height: null,
    };
  }
  const image = await normalizePrivateImage({
    file,
    images,
    limits: floorPlanLimits,
  });
  return { ...image, contentType: "image/webp" as const };
}

export async function uploadFloorPlan(
  input: CollectionInput & {
    bucket: R2Bucket;
    images: ImagesBinding;
    rateLimitSecret: string;
    request: Request;
  },
): Promise<FloorPlansResponse> {
  await collectionAccess(input, true);
  await enforceCollaborationRateLimit({
    database: input.database,
    secret: input.rateLimitSecret,
    action: "floor_plan_upload",
    identity: `${input.userId}:${input.collectionId}`,
    limit: 10,
    windowMilliseconds: 60_000,
    now: Date.now(),
  });
  await cleanup(input);
  let form: FormData;
  try {
    form = await input.request.formData();
  } catch {
    throw badRequest("Use multipart form data for the upload.");
  }
  const { file, details } = uploadParts(form);
  const content = await fileContent(file, input.images);
  const id = crypto.randomUUID();
  const key = `floor-plans/${crypto.randomUUID()}`;
  const now = Date.now();
  // A pending row reserves quota and records the key before R2 is touched.
  const reserved = await input.database
    .prepare(
      `insert into floor_plans
		(id,collection_id,title,notes,object_key,content_type,byte_size,width,height,uploaded_by_user_id,status,created_at,updated_at)
		select ?3,?1,?4,?5,?6,?7,?8,?9,?10,?2,'pending',?11,?11
		where ${mutableCollectionSql}
		and (select count(*) from floor_plans where collection_id=?1 and status!='deleted') < ?12
		and (select coalesce(sum(p.byte_size),0) from floor_plans p join collections c on c.id=p.collection_id
			where c.workspace_id=(select workspace_id from collections where id=?1) and p.status!='deleted') + ?8 <= ?13`,
    )
    .bind(
      input.collectionId,
      input.userId,
      id,
      details.title,
      details.notes,
      key,
      content.contentType,
      content.bytes.byteLength,
      content.width,
      content.height,
      now,
      floorPlanLimits.maxFiles,
      floorPlanLimits.maxWorkspaceBytes,
    )
    .run();
  if (reserved.meta.changes !== 1) {
    await collectionAccess(input, true);
    throw new ApiError(
      409,
      "MEDIA_LIMIT_EXCEEDED",
      "The collection or workspace has reached its floor-plan storage limit.",
    );
  }
  let collision = false;
  try {
    const stored = await input.bucket.put(key, content.bytes, {
      onlyIf: new Headers({ "if-none-match": "*" }),
      httpMetadata: {
        contentType: content.contentType,
        cacheControl: "private, no-store",
      },
    });
    if (!stored) {
      collision = true;
      throw conflict("The generated file key already exists.");
    }
    const ready = await input.database
      .prepare(
        `update floor_plans set status='ready',updated_at=?4
			where collection_id=?1 and id=?3 and status='pending' and ${mutableCollectionSql}`,
      )
      .bind(input.collectionId, input.userId, id, Date.now())
      .run();
    if (ready.meta.changes !== 1)
      throw conflict(
        "Collection access changed during upload. The file was not added.",
      );
  } catch (error) {
    await input.database
      .prepare(
        `update floor_plans set status='deleted',title='Deleted floor plan',notes=null,updated_at=? where id=?`,
      )
      .bind(Date.now(), id)
      .run();
    try {
      if (collision)
        await input.database
          .prepare("update floor_plans set object_deleted_at=? where id=?")
          .bind(Date.now(), id)
          .run();
      else
        await eraseObject(input.database, input.bucket, {
          id,
          object_key: key,
        });
    } catch {
      console.warn({ event: "floor_plan_cleanup_failed", planId: id });
    }
    throw error;
  }
  return readFloorPlans(input);
}

export async function updateFloorPlan(
  input: CollectionInput & { planId: string; value: FloorPlanDetails },
) {
  await readyPlan(input, true);
  const result = await input.database
    .prepare(
      `update floor_plans set title=?4,notes=?5,updated_at=?6
		where collection_id=?1 and id=?3 and status='ready' and ${mutableCollectionSql}`,
    )
    .bind(
      input.collectionId,
      input.userId,
      input.planId,
      input.value.title,
      input.value.notes,
      Date.now(),
    )
    .run();
  if (result.meta.changes !== 1)
    throw conflict("The floor plan or your access changed.");
  return readFloorPlan(input);
}

export async function deleteFloorPlan(
  input: CollectionInput & { planId: string; bucket: R2Bucket },
) {
  await collectionAccess(input, true);
  const row = await input.database
    .prepare(
      `select * from floor_plans where id=? and collection_id=? and status in ('ready','deleted')`,
    )
    .bind(input.planId, input.collectionId)
    .first<PlanRow>();
  if (!row) throw notFound();
  const result = await input.database
    .prepare(
      `update floor_plans set status='deleted',title='Deleted floor plan',notes=null,updated_at=?4
		where collection_id=?1 and id=?3 and status in ('ready','deleted') and ${mutableCollectionSql}`,
    )
    .bind(input.collectionId, input.userId, input.planId, Date.now())
    .run();
  if (result.meta.changes !== 1)
    throw conflict("The floor plan or your access changed.");
  // Tombstone first: a failed R2 delete cannot leave a downloadable record.
  await eraseObject(input.database, input.bucket, row);
  return { deleted: true };
}

export async function readFloorPlanContent(
  input: CollectionInput & { planId: string; bucket: R2Bucket },
) {
  const row = await readyPlan(input);
  const object = await input.bucket.get(row.object_key);
  if (!object) throw notFound();
  // Recheck after object I/O so a revocation/deletion during fetch fails closed.
  await readyPlan(input);
  const pdf = row.content_type === "application/pdf";
  return new Response(object.body, {
    headers: {
      "content-type": row.content_type,
      "content-length": String(object.size),
      "content-disposition": pdf
        ? `attachment; filename="floor-plan-${row.id}.pdf"`
        : "inline",
      "cache-control": "private, no-store",
      "content-security-policy":
        "default-src 'none'; sandbox; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
