import {
  researchConstraintsSchema,
  type LocalCodexCompletion,
  type ResearchRequestCreateInput,
} from "@kharidyar/contracts";
import { conflict, notFound } from "./api-errors";
import {
  localToken,
  localTokenHash,
  requireLocalPairing,
  type LocalCodexBindings,
  type LocalPairing,
} from "./local-codex-auth";
import {
  prepareResearchSearchResults,
  requireLocalResearchAccess,
} from "./research-service";

export async function expireLocalJobs(database: D1Database) {
  const now = Date.now();
  await database.batch([
    database
      .prepare(
        `update research_runs set status='failed', error_code='local_runner_unavailable', error_message='The local runner was offline, disconnected or timed out. Pair or start it, then retry explicitly.', finished_at=?1, updated_at=?1
      where status in ('queued','running','partial') and provider='local-codex-v1' and (
        not exists (select 1 from local_codex_jobs j join local_codex_pairings p on p.id=j.pairing_id join session s on s.id=p.session_id
          where j.run_id=research_runs.id and p.revoked_at is null and p.expires_at>?1 and s.expires_at>?1 and j.expires_at>?1 and (j.lease_expires_at is null or j.lease_expires_at>?1)))`,
      )
      .bind(now),
    database
      .prepare(
        `update local_codex_jobs set finished_at=?1 where finished_at is null and run_id in (select id from research_runs where status in ('failed','cancelled','completed'))`,
      )
      .bind(now),
  ]);
}
export async function prepareLocalRun(
  env: LocalCodexBindings,
  userId: string,
  value: Pick<ResearchRequestCreateInput, "provider" | "localPairingId">,
) {
  if (value.provider !== "local-codex-v1") {
    if (value.localPairingId)
      throw conflict("A runner can only be selected for local Codex research.");
    return;
  }
  if (!value.localPairingId)
    throw conflict("Choose a paired local Codex runner.");
  await requireLocalPairing(env, userId, value.localPairingId);
  await expireLocalJobs(env.DB);
  if (
    await env.DB.prepare(
      "select run_id from local_codex_jobs where pairing_id=? and finished_at is null",
    )
      .bind(value.localPairingId)
      .first()
  )
    throw conflict(
      "This runner already has a research job. Wait or cancel it first.",
    );
}
interface JobRow {
  run_id: string;
  request_id: string;
  collection_id: string;
  workspace_id: string;
  requested_by_user_id: string;
  query: string;
  constraints_json: string;
  item_id: string | null;
  lease_token_hash: string | null;
  lease_expires_at: number | null;
  expires_at: number;
  finished_at: number | null;
  completion_hash: string | null;
  status: string;
}
const jobQuery = `select j.*, r.request_id, r.collection_id, r.workspace_id, r.requested_by_user_id, r.status, q.query, q.constraints_json, q.item_id
  from local_codex_jobs j join research_runs r on r.id=j.run_id join research_requests q on q.id=r.request_id
  where j.pairing_id=?1 and r.requested_by_user_id=?2 and r.provider='local-codex-v1'`;
async function checkJobAccess(
  env: LocalCodexBindings,
  pairing: LocalPairing,
  row: JobRow,
) {
  await requireLocalResearchAccess({
    database: env.DB,
    userId: pairing.user_id,
    collectionId: row.collection_id,
    itemId: row.item_id,
  });
}
export async function claimLocalJob(
  env: LocalCodexBindings,
  pairing: LocalPairing,
) {
  await expireLocalJobs(env.DB);
  const row = await env.DB.prepare(
    `${jobQuery} and r.status='queued' and j.lease_token_hash is null and j.finished_at is null order by r.created_at limit 1`,
  )
    .bind(pairing.id, pairing.user_id)
    .first<JobRow>();
  if (!row) return { job: null };
  try {
    await checkJobAccess(env, pairing, row);
  } catch (error) {
    await env.DB.batch([
      env.DB.prepare(
        "update research_runs set status='failed',error_code='access_lost',error_message='Collection access changed. Research was stopped.',finished_at=?1,updated_at=?1 where id=?2 and status='queued'",
      ).bind(Date.now(), row.run_id),
      env.DB.prepare(
        "update local_codex_jobs set finished_at=? where run_id=? and finished_at is null",
      ).bind(Date.now(), row.run_id),
    ]);
    throw error;
  }
  const token = localToken(),
    hash = await localTokenHash(token),
    now = Date.now(),
    until = now + 240_000;
  const changed = await env.DB.prepare(
    `update local_codex_jobs set lease_token_hash=?1, lease_expires_at=?2
    where run_id=?3 and pairing_id=?4 and lease_token_hash is null and finished_at is null and expires_at>?5
    and exists(select 1 from research_runs where id=?3 and status='queued')
    and exists(select 1 from local_codex_pairings p join session s on s.id=p.session_id where p.id=?4 and p.revoked_at is null and p.expires_at>?5 and s.expires_at>?5)
    returning run_id`,
  )
    .bind(hash, until, row.run_id, pairing.id, now)
    .first();
  if (!changed) return { job: null };
  await env.DB.prepare(
    "update research_runs set status='running',started_at=?1,updated_at=?1 where id=?2 and status='queued'",
  )
    .bind(now, row.run_id)
    .run();
  await requireLocalPairing(env, pairing.user_id, pairing.id);
  await checkLocalLease(env, pairing, row.run_id, token);
  return {
    job: {
      runId: row.run_id,
      query: row.query,
      constraints: researchConstraintsSchema.parse(
        JSON.parse(row.constraints_json),
      ),
      leaseToken: token,
      expiresAt: new Date(Math.min(until, row.expires_at)).toISOString(),
    },
  };
}
async function ownedJob(
  env: LocalCodexBindings,
  pairing: LocalPairing,
  runId: string,
) {
  const row = await env.DB.prepare(`${jobQuery} and j.run_id=?3`)
    .bind(pairing.id, pairing.user_id, runId)
    .first<JobRow>();
  if (!row) throw notFound();
  await checkJobAccess(env, pairing, row);
  return row;
}
export async function checkLocalLease(
  env: LocalCodexBindings,
  pairing: LocalPairing,
  runId: string,
  token: string,
) {
  await requireLocalPairing(env, pairing.user_id, pairing.id);
  const row = await ownedJob(env, pairing, runId);
  if (
    row.finished_at !== null ||
    !["running", "partial"].includes(row.status) ||
    row.expires_at <= Date.now() ||
    (row.lease_expires_at ?? 0) <= Date.now() ||
    row.lease_token_hash !== (await localTokenHash(token))
  )
    throw conflict("The research job was cancelled or its lease expired.");
  return row;
}
export async function completeLocalJob(
  env: LocalCodexBindings,
  pairing: LocalPairing,
  runId: string,
  value: LocalCodexCompletion,
) {
  const digest = await localTokenHash(JSON.stringify(value));
  const previous = await ownedJob(env, pairing, runId);
  if (previous.completion_hash === digest && previous.finished_at !== null)
    return { accepted: true };
  const row = await checkLocalLease(env, pairing, runId, value.leaseToken);
  const now = Date.now();
  const statements = [
    env.DB.prepare(
      `update local_codex_jobs set completion_hash=?1,finished_at=?2 where run_id=?3 and pairing_id=?4 and lease_token_hash=?5 and finished_at is null and expires_at>?2 and lease_expires_at>?2
    and exists(select 1 from research_runs where id=?3 and status in ('running','partial'))
    and exists(select 1 from local_codex_pairings p join session s on s.id=p.session_id where p.id=?4 and p.revoked_at is null and p.expires_at>?2 and s.expires_at>?2)`,
    ).bind(
      digest,
      now,
      runId,
      pairing.id,
      await localTokenHash(value.leaseToken),
    ),
  ];
  if (value.status === "completed") {
    const output = value.result.output;
    // No local/internal links or URL credentials enter saved suggestions.
    const urls = new Set<string>();
    for (const result of output.results) {
      const url = new URL(result.url);
      if (
        url.username ||
        url.password ||
        url.port ||
        !url.hostname.includes(".") ||
        /(?:^\d+\.|:|\.(?:local|internal|localhost)$)/i.test(url.hostname) ||
        urls.has(url.href)
      )
        throw conflict(
          "The local runner returned invalid or duplicate source URLs.",
        );
      urls.add(url.href);
    }
    statements.push(
      ...prepareResearchSearchResults({
        database: env.DB,
        allowedOrigin: "",
        provider: "local-codex-v1",
        output,
        execution: {
          actorId: pairing.user_id,
          collectionId: row.collection_id,
          workspaceId: row.workspace_id,
          runId,
          requestId: row.request_id,
          query: row.query,
          constraints: researchConstraintsSchema.parse(
            JSON.parse(row.constraints_json),
          ),
        },
        metadata: {
          model: value.result.model,
          cliVersion: value.result.cliVersion,
          searchMode: value.result.searchMode,
          reportedByLocalRunner: true,
          independentlyVerified: false,
        },
        commitGuard: { hash: digest, at: now },
      }).statements,
    );
  }
  const failure = value.status === "failed" ? value.reason : null;
  statements.push(
    env.DB.prepare(
      `update research_runs set status=?1,error_code=?2,error_message=?3,finished_at=?4,updated_at=?4 where id=?5 and status in ('running','partial') and exists(select 1 from local_codex_jobs where run_id=?5 and completion_hash=?6 and finished_at=?4)`,
    ).bind(
      failure ? "failed" : "completed",
      failure,
      failure
        ? `Local Codex could not complete research (${failure}). Check the runner, then retry explicitly.`
        : null,
      now,
      runId,
      digest,
    ),
  );
  const result = await env.DB.batch(statements);
  if (!result[0].meta.changes)
    throw conflict("The research job is no longer active.");
  return { accepted: true };
}
