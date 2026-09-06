import { ApiError, conflict, forbidden, notFound } from "./api-errors";
import { enforceCollaborationRateLimit } from "./collaboration-rate-limit";

export type LocalCodexBindings = Pick<
  Env,
  "DB" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"
> & {
  LOCAL_CODEX_ENABLED?: string;
  LOCAL_CODEX_ALLOWED_USER_IDS?: string;
};
export interface LocalPairing {
  id: string;
  user_id: string;
  name: string;
  expires_at: number;
  last_seen_at: number | null;
}
export function localCodexAllowed(env: LocalCodexBindings, userId: string) {
  return (
    env.LOCAL_CODEX_ENABLED === "true" &&
    (env.LOCAL_CODEX_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .includes(userId)
  );
}
export async function localTokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function localToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
const livePairing = `select p.id, p.user_id, p.name, p.expires_at, p.last_seen_at
  from local_codex_pairings p join session s on s.id = p.session_id and s.user_id = p.user_id
  where p.revoked_at is null and p.expires_at > ?1 and s.expires_at > ?1`;
export function pairingResource(pairing: LocalPairing) {
  return {
    id: pairing.id,
    name: pairing.name,
    expiresAt: new Date(pairing.expires_at).toISOString(),
    online:
      pairing.last_seen_at !== null &&
      pairing.last_seen_at > Date.now() - 60_000,
  };
}
export async function localCodexStatus(
  env: LocalCodexBindings,
  userId: string,
) {
  const enabled = localCodexAllowed(env, userId);
  if (!enabled) return { enabled, pairings: [] };
  const rows = await env.DB.prepare(
    `${livePairing} and p.user_id = ?2 order by p.created_at desc limit 5`,
  )
    .bind(Date.now(), userId)
    .all<LocalPairing>();
  return { enabled, pairings: rows.results.map(pairingResource) };
}
export async function requireLocalPairing(
  env: LocalCodexBindings,
  userId: string,
  id: string,
) {
  if (!localCodexAllowed(env, userId))
    throw forbidden("Local Codex is not enabled for this account.");
  const pairing = await env.DB.prepare(
    `${livePairing} and p.user_id = ?2 and p.id = ?3`,
  )
    .bind(Date.now(), userId, id)
    .first<LocalPairing>();
  if (!pairing) throw notFound("Pair your local Codex runner again.");
  return pairing;
}
export async function createLocalPairing(
  env: LocalCodexBindings,
  userId: string,
  sessionId: string,
  name: string,
) {
  if (!localCodexAllowed(env, userId)) throw forbidden();
  await enforceCollaborationRateLimit({
    action: "local_codex_pairing",
    database: env.DB,
    identity: userId,
    secret: env.BETTER_AUTH_SECRET,
    now: Date.now(),
    limit: 5,
    windowMilliseconds: 60_000,
  });
  if ((await localCodexStatus(env, userId)).pairings.length >= 5)
    throw conflict("Disconnect an existing runner first.");
  const id = crypto.randomUUID(),
    token = localToken(),
    now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60_000;
  await env.DB.prepare(
    `insert into local_codex_pairings (id, user_id, session_id, name, token_hash, expires_at, created_at) values (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      sessionId,
      name,
      await localTokenHash(token),
      expiresAt,
      now,
    )
    .run();
  return {
    pairing: pairingResource({
      id,
      user_id: userId,
      name,
      expires_at: expiresAt,
      last_seen_at: null,
    }),
    token,
    origin: env.BETTER_AUTH_URL,
  };
}
export async function authenticateLocalRunner(
  env: LocalCodexBindings,
  request: Request,
) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token || env.LOCAL_CODEX_ENABLED !== "true")
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Pair your local runner to continue.",
    );
  const pairing = await env.DB.prepare(`${livePairing} and p.token_hash = ?2`)
    .bind(Date.now(), await localTokenHash(token))
    .first<LocalPairing>();
  if (!pairing || !localCodexAllowed(env, pairing.user_id))
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "The pairing expired or was disconnected. Pair again.",
    );
  await enforceCollaborationRateLimit({
    action: "local_codex_request",
    database: env.DB,
    identity: pairing.id,
    secret: env.BETTER_AUTH_SECRET,
    now: Date.now(),
    limit: 60,
    windowMilliseconds: 60_000,
  });
  await env.DB.prepare(
    "update local_codex_pairings set last_seen_at = ? where id = ?",
  )
    .bind(Date.now(), pairing.id)
    .run();
  return pairing;
}
export async function disconnectLocalPairing(
  env: LocalCodexBindings,
  userId: string,
  id: string,
) {
  const row = await env.DB.prepare(
    "select id from local_codex_pairings where id = ? and user_id = ?",
  )
    .bind(id, userId)
    .first();
  if (!row) throw notFound();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "update local_codex_pairings set revoked_at = ? where id = ? and user_id = ?",
    ).bind(now, id, userId),
    env.DB.prepare(
      "update research_runs set status = 'cancelled', finished_at = ?1, updated_at = ?1 where id in (select run_id from local_codex_jobs where pairing_id = ?2) and status in ('queued','running','partial')",
    ).bind(now, id),
    env.DB.prepare(
      "update local_codex_jobs set finished_at = ? where pairing_id = ? and finished_at is null",
    ).bind(now, id),
  ]);
}
