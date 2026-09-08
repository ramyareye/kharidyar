import { visualLimits } from "@kharidyar/contracts";

// vr is a visual_runs row. Sources are immutable private objects, not public URLs.
export const visualSourcesCurrentSql = `not exists (
  select 1 from json_each(vr.sources_json) source where
  (json_extract(source.value,'$.kind')='floor_plan' and not exists (
    select 1 from floor_plans fp where fp.id=json_extract(source.value,'$.id')
      and fp.collection_id=vr.collection_id and fp.status='ready'
      and fp.object_key=json_extract(source.value,'$.key')
  )) or (json_extract(source.value,'$.kind')='concept_image' and not exists (
    select 1 from concept_images ci join concepts co on co.id=ci.concept_id
      where ci.id=json_extract(source.value,'$.id') and co.collection_id=vr.collection_id
      and co.archived_at is null and ci.deleted_at is null
      and ci.object_key=json_extract(source.value,'$.key') and ci.contains_person=0
  ))
)`;

export const visualOutputReadableSql = `(ci.role <> 'edited' or exists (
  select 1 from visual_runs vr where vr.output_image_id=ci.id
    and vr.status='completed' and ${visualSourcesCurrentSql}
))`;

// Call only after Collection authorization. An interrupted import leaves its key
// here so later authorized visits can release quota and retry deletion.
export async function cleanupVisualRuns(
	database: D1Database,
	bucket: R2Bucket,
	collectionId: string,
) {
	const now = Date.now();
	await database.batch([
		database
			.prepare(
				`update visual_runs set status='failed',reserved_bytes=0,error_code='IMPORT_INTERRUPTED',updated_at=?
      where collection_id=? and status in ('importing','cancelled') and reserved_bytes>0 and updated_at<?`,
			)
			.bind(now, collectionId, now - visualLimits.abandonedImportMs),
		database
			.prepare(
				`update visual_runs as vr set status='cancelled',error_code='SOURCE_UNAVAILABLE',updated_at=?
      where collection_id=? and status in ('ready','importing','completed') and (
        not (${visualSourcesCurrentSql}) or exists (
          select 1 from concept_images ci where ci.id=vr.output_image_id and ci.deleted_at is not null
        ) or (vr.status='ready' and vr.expires_at<=?)
      )`,
			)
			.bind(now, collectionId, now),
		database
			.prepare(
				`update concept_images set deleted_at=?,deleted_by_user_id=uploaded_by_user_id,is_cover=0,caption=null,updated_at=?
      where deleted_at is null and id in (select output_image_id from visual_runs where collection_id=? and status='cancelled')`,
			)
			.bind(now, now, collectionId),
		database
			.prepare(
				`update visual_runs set selection_json='{}',sources_json='[]',products_json='[]',reported_model=null
      where collection_id=? and status in ('failed','cancelled')`,
			)
			.bind(collectionId),
	]);
	const rows = await database
		.prepare(
			`select id,object_key,output_image_id from visual_runs
    where collection_id=? and status in ('failed','cancelled') and object_key is not null
      and reserved_bytes=0 and object_deleted_at is null limit 20`,
		)
		.bind(collectionId)
		.all<{ id: string; object_key: string; output_image_id: string | null }>();
	for (const row of rows.results) {
		try {
			const object = await bucket.head(row.object_key);
			// Even a failed conditional PUT must never enqueue someone else's object.
			if (object && object.customMetadata?.visualRunId !== row.id) {
				await database
					.prepare(
						"update visual_runs set object_key=null,reserved_bytes=0,error_code='STORAGE_OWNERSHIP_MISMATCH' where id=?",
					)
					.bind(row.id)
					.run();
				continue;
			}
			await bucket.delete(row.object_key);
			await database.batch([
				database
					.prepare(
						"update visual_runs set object_deleted_at=?,reserved_bytes=0 where id=?",
					)
					.bind(now, row.id),
				database
					.prepare(
						"update concept_images set object_deleted_at=? where id=? and deleted_at is not null",
					)
					.bind(now, row.output_image_id),
			]);
		} catch {
			// No URLs, prompts or exception messages in logs.
			console.warn({ event: "visual_output_cleanup_deferred", runId: row.id });
		}
	}
}
