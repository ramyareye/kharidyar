import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  localCodexCredentialsSchema,
  localCodexJobSchema,
  localCodexStatusSchema,
  researchDeskResponseSchema,
  type LocalCodexJob,
} from "@kharidyar/contracts";
import app from "../src/worker";
const origin = "http://example.com",
  owner = "local-owner",
  other = "local-other",
  viewer = "local-viewer";
const workspace = "local-workspace",
  collection = "local-collection",
  item = "local-item";
const pilot = () => ({
  ...env,
  LOCAL_CODEX_ENABLED: "true",
  LOCAL_CODEX_ALLOWED_USER_IDS: `${owner},${other},${viewer}`,
});
async function cookie(user: string) {
  const token = `token-${user}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  return `better-auth.session_token=${token}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
async function request(
  path: string,
  {
    user,
    token,
    body,
    method = "GET",
    bindings = pilot(),
    requestOrigin = origin,
  }: {
    user?: string;
    token?: string;
    body?: unknown;
    method?: string;
    bindings?: Env;
    requestOrigin?: string;
  } = {},
) {
  const headers = new Headers({ origin: requestOrigin });
  if (user) headers.set("cookie", await cookie(user));
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.fetch(
    new Request(origin + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    bindings,
  );
}
async function pair(user = owner) {
  const response = await request("/api/local-codex/pairings", {
    user,
    method: "POST",
    body: { name: "My laptop" },
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return localCodexCredentialsSchema.parse(await response.json());
}
const constraints = {
  currency: "EUR",
  maxUnitPriceMinor: null,
  preferredDomains: [],
  requiredTerms: [],
  excludedTerms: [],
};
const queueResponse = (id: string, user = owner) =>
  request(`/api/collections/${collection}/research-requests`, {
    user,
    method: "POST",
    body: {
      query: "Paper lamp",
      itemId: item,
      constraints,
      provider: "local-codex-v1",
      localPairingId: id,
    },
  });
async function queue(id: string, user = owner) {
  const response = await queueResponse(id, user);
  expect(response.status, await response.clone().text()).toBe(201);
  const saved = researchDeskResponseSchema.parse(await response.json())
    .requests[0]!;
  return { ...saved.runs[0]!, requestId: saved.id };
}
async function claim(token: string) {
  const response = await request("/api/local-codex/claim", {
    token,
    method: "POST",
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return localCodexJobSchema.parse(
    ((await response.json()) as { job: unknown }).job,
  );
}
function completion(job: LocalCodexJob, url = "https://example.com/lamp") {
  return {
    status: "completed",
    leaseToken: job.leaseToken,
    result: {
      model: "test-model",
      cliVersion: "codex-cli test",
      searchMode: "live",
      output: {
        providerRequestId: null,
        results: [
          {
            title: "Paper lamp",
            url,
            content: "Price and stock need checking.",
            score: null,
          },
        ],
      },
    },
  };
}
const submit = (
  token: string,
  job: LocalCodexJob,
  body: unknown = completion(job),
) =>
  request(`/api/local-codex/jobs/${job.runId}/complete`, {
    token,
    method: "POST",
    body,
  });
const lease = (token: string, job: LocalCodexJob) =>
  request(`/api/local-codex/jobs/${job.runId}/lease`, {
    token,
    method: "POST",
    body: { leaseToken: job.leaseToken },
  });
async function count(table: string) {
  return (await env.DB.prepare(`select count(*) as count from ${table}`).first<{
    count: number;
  }>())!.count;
}
async function fixture() {
  await env.DB.batch([
    env.DB.prepare(
      "delete from research_result_promotions where workspace_id=?",
    ).bind(workspace),
    env.DB.prepare("delete from workspaces where id=?").bind(workspace),
    env.DB.prepare("delete from user where id like 'local-%'"),
    env.DB.prepare("delete from collaboration_rate_limits"),
  ]);
  const now = Date.now(),
    statements = [];
  for (const user of [owner, other, viewer])
    statements.push(
      env.DB.prepare(
        "insert into user(id,name,email,email_verified) values(?,?,?,1)",
      ).bind(user, user, `${user}@example.com`),
      env.DB.prepare(
        "insert into session(id,expires_at,token,updated_at,user_id) values(?,?,?,?,?)",
      ).bind(`session-${user}`, now + 3600000, `token-${user}`, now, user),
    );
  statements.push(
    env.DB.prepare(
      "insert into workspaces(id,name,created_by_user_id) values(?,?,?)",
    ).bind(workspace, "Private home", owner),
    env.DB.prepare(
      "insert into collections(id,workspace_id,name,created_by_user_id) values(?,?,?,?)",
    ).bind(collection, workspace, "Lighting", owner),
    env.DB.prepare(
      "insert into items(id,workspace_id,collection_id,title,created_by_user_id) values(?,?,?,?,?)",
    ).bind(item, workspace, collection, "Paper lamp", owner),
  );
  for (const [user, role] of [
    [owner, "owner"],
    [other, "contributor"],
    [viewer, "viewer"],
  ])
    statements.push(
      env.DB.prepare(
        "insert into workspace_memberships(id,workspace_id,user_id,role) values(?,?,?,?)",
      ).bind(`membership-${user}`, workspace, user, role),
    );
  await env.DB.batch(statements);
}
describe("Private local Codex research", () => {
  beforeEach(fixture);
  it("defaults off, reveals token once, and enforces account and Origin boundaries", async () => {
    expect(
      (
        await request("/api/local-codex/pairings", {
          user: owner,
          method: "POST",
          body: { name: "Laptop" },
          bindings: { ...pilot(), LOCAL_CODEX_ENABLED: "false" },
        })
      ).status,
    ).toBe(403);
    const pairing = await pair(),
      stored = await env.DB.prepare(
        "select token_hash from local_codex_pairings where id=?",
      )
        .bind(pairing.pairing.id)
        .first<{ token_hash: string }>();
    expect(stored!.token_hash).not.toBe(pairing.token);
    expect(stored!.token_hash).toHaveLength(64);
    const text = await (
      await request("/api/local-codex/pairings", { user: owner })
    ).text();
    expect(text).not.toContain(pairing.token);
    expect(text).not.toContain(stored!.token_hash);
    expect(
      localCodexStatusSchema.parse(JSON.parse(text)).pairings,
    ).toHaveLength(1);
    expect(
      localCodexStatusSchema.parse(
        await (
          await request("/api/local-codex/pairings", { user: other })
        ).json(),
      ).pairings,
    ).toEqual([]);
    expect(
      (
        await request(`/api/local-codex/pairings/${pairing.pairing.id}`, {
          user: other,
          method: "DELETE",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("/api/local-codex/check", {
          token: pairing.token,
          method: "POST",
          requestOrigin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/api/local-codex/claim", {
          token: "b".repeat(64),
          method: "POST",
        })
      ).status,
    ).toBe(401);
    expect((await queueResponse(pairing.pairing.id, other)).status).toBe(404);
  });
  it("claims once, saves unverified provenance, and accepts an identical result replay once", async () => {
    const pairing = await pair(),
      run = await queue(pairing.pairing.id);
    expect(run.provider).toBe("local-codex-v1");
    expect(run.status).toBe("queued");
    const responses = await Promise.all([
      request("/api/local-codex/claim", {
        token: pairing.token,
        method: "POST",
      }),
      request("/api/local-codex/claim", {
        token: pairing.token,
        method: "POST",
      }),
    ]);
    const jobs = await Promise.all(
      responses.map(
        async (response) => ((await response.json()) as { job: unknown }).job,
      ),
    );
    expect(jobs.filter(Boolean)).toHaveLength(1);
    const job = localCodexJobSchema.parse(jobs.find(Boolean));
    expect(Object.keys(job).sort()).toEqual([
      "constraints",
      "expiresAt",
      "leaseToken",
      "query",
      "runId",
    ]);
    expect(job.query).toBe("Paper lamp");
    expect((await lease(pairing.token, job)).status).toBe(200);
    expect((await submit(pairing.token, job)).status).toBe(200);
    expect((await submit(pairing.token, job)).status).toBe(200);
    expect(
      (
        await submit(
          pairing.token,
          job,
          completion(job, "https://example.com/changed"),
        )
      ).status,
    ).toBe(409);
    const desk = researchDeskResponseSchema.parse(
        await (
          await request(`/api/collections/${collection}/research`, {
            user: viewer,
          })
        ).json(),
      ),
      saved = desk.requests[0]!.runs[0]!;
    expect(saved.status).toBe("completed");
    expect(saved.results).toHaveLength(1);
    expect(saved.results[0]!.source).toMatchObject({
      provider: "local-codex-v1",
      extractionMetadata: {
        model: "test-model",
        searchMode: "live",
        reportedByLocalRunner: true,
        independentlyVerified: false,
      },
    });
    expect(saved.results[0]!.suggestion?.offer.facts.priceKind).toBe("unknown");
    expect(await count("item_candidates")).toBe(0);
    expect(await count("research_result_promotions")).toBe(0);
  });
  it("rejects concurrent queueing atomically and prevents another user claiming or completing jobs", async () => {
    const pairing = await pair(),
      second = await pair(other);
    const responses = await Promise.all([
      queueResponse(pairing.pairing.id),
      queueResponse(pairing.pairing.id),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await count("research_requests")).toBe(1);
    expect(
      await (
        await request("/api/local-codex/claim", {
          token: second.token,
          method: "POST",
        })
      ).json(),
    ).toEqual({ job: null });
    const job = await claim(pairing.token);
    expect((await submit(second.token, job)).status).toBe(404);
    expect((await lease(second.token, job)).status).toBe(404);
  });
  it("rejects malformed output and private or duplicate links without saving sources", async () => {
    const pairing = await pair();
    await queue(pairing.pairing.id);
    const job = await claim(pairing.token);
    for (const url of [
      "https://127.0.0.1/lamp",
      "https://host.internal/lamp",
      "https://user:secret@example.com/lamp",
      "https://[::1]/lamp",
    ])
      expect(
        (await submit(pairing.token, job, completion(job, url))).status,
      ).toBe(409);
    const value = completion(job);
    value.result.output.results.push(value.result.output.results[0]!);
    expect((await submit(pairing.token, job, value)).status).toBe(409);
    expect(
      (
        await submit(pairing.token, job, {
          status: "completed",
          leaseToken: job.leaseToken,
          result: {},
        })
      ).status,
    ).toBe(400);
    expect(await count("research_sources")).toBe(0);
  });
  it("cancels late results and requires explicit pairing for retries", async () => {
    const pairing = await pair(),
      run = await queue(pairing.pairing.id),
      job = await claim(pairing.token);
    expect(
      (
        await request(
          `/api/collections/${collection}/research-runs/${run.id}/cancel`,
          { user: owner, method: "POST" },
        )
      ).status,
    ).toBe(200);
    expect((await lease(pairing.token, job)).status).toBe(409);
    expect((await submit(pairing.token, job)).status).toBe(409);
    expect(await count("research_results")).toBe(0);
    const retry = `/api/collections/${collection}/research-requests/${run.requestId}/runs`;
    expect((await request(retry, { user: owner, method: "POST" })).status).toBe(
      409,
    );
    expect(
      (
        await request(retry + "?provider=invalid", {
          user: owner,
          method: "POST",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          retry +
            `?provider=local-codex-v1&localPairingId=${pairing.pairing.id}`,
          { user: owner, method: "POST" },
        )
      ).status,
    ).toBe(201);
  });
  it.each([
    "disconnect",
    "logout",
    "allowlist",
    "expired-session",
    "expired-pairing",
  ] as const)("stops claims and results after %s", async (cause) => {
    const pairing = await pair();
    await queue(pairing.pairing.id);
    const job = await claim(pairing.token);
    let bindings = pilot();
    if (cause === "disconnect")
      expect(
        (
          await request(`/api/local-codex/pairings/${pairing.pairing.id}`, {
            user: owner,
            method: "DELETE",
          })
        ).status,
      ).toBe(204);
    if (cause === "logout")
      await env.DB.prepare("delete from session where user_id=?")
        .bind(owner)
        .run();
    if (cause === "allowlist")
      bindings = { ...bindings, LOCAL_CODEX_ALLOWED_USER_IDS: other };
    if (cause === "expired-session")
      await env.DB.prepare("update session set expires_at=1 where user_id=?")
        .bind(owner)
        .run();
    if (cause === "expired-pairing")
      await env.DB.prepare(
        "update local_codex_pairings set expires_at=1 where id=?",
      )
        .bind(pairing.pairing.id)
        .run();
    for (const path of [
      "/api/local-codex/claim",
      `/api/local-codex/jobs/${job.runId}/complete`,
    ])
      expect(
        (
          await request(path, {
            token: pairing.token,
            method: "POST",
            body: completion(job),
            bindings,
          })
        ).status,
      ).toBe(401);
    expect(await count("research_results")).toBe(0);
  });
  it.each(["permission", "archive"] as const)(
    "checks %s before returning prompts",
    async (cause) => {
      const pairing = await pair(other);
      await queue(pairing.pairing.id, other);
      if (cause === "permission")
        await env.DB.prepare(
          "delete from workspace_memberships where user_id=?",
        )
          .bind(other)
          .run();
      else
        await env.DB.prepare("update items set archived_at=1 where id=?")
          .bind(item)
          .run();
      const response = await request("/api/local-codex/claim", {
        token: pairing.token,
        method: "POST",
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await response.text()).not.toContain("Paper lamp");
      expect(
        (await env.DB.prepare("select status from research_runs").first<{
          status: string;
        }>())!.status,
      ).toBe("failed");
    },
  );
  it("checks access on lease and completion, then expires leases without automatic reclaim", async () => {
    const pairing = await pair(other);
    await queue(pairing.pairing.id, other);
    const job = await claim(pairing.token);
    await env.DB.prepare(
      "update workspace_memberships set role='viewer' where user_id=?",
    )
      .bind(other)
      .run();
    expect((await submit(pairing.token, job)).status).toBe(403);
    expect((await lease(pairing.token, job)).status).toBe(403);
    await env.DB.prepare(
      "update workspace_memberships set role='contributor' where user_id=?",
    )
      .bind(other)
      .run();
    await env.DB.prepare(
      "update local_codex_jobs set lease_expires_at=1 where run_id=?",
    )
      .bind(job.runId)
      .run();
    expect((await submit(pairing.token, job)).status).toBe(409);
    expect(
      await (
        await request("/api/local-codex/claim", {
          token: pairing.token,
          method: "POST",
        })
      ).json(),
    ).toEqual({ job: null });
    expect(
      (await env.DB.prepare("select status from research_runs where id=?")
        .bind(job.runId)
        .first<{ status: string }>())!.status,
    ).toBe("failed");
    expect(await count("research_results")).toBe(0);
  });
});
