import { env, exports } from "cloudflare:workers";
import {
  apiErrorResponseSchema,
  researchDeskResponseSchema,
} from "@kharidyar/contracts";
import { introspectWorkflow } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "research-workspace";
const collectionId = "research-collection";
const itemId = "research-item";
const users = {
  contributor: "research-contributor",
  owner: "research-owner",
  outsider: "research-outsider",
  viewer: "research-viewer",
} as const;

type TestUserId = (typeof users)[keyof typeof users];

async function signedSessionCookie(userId: TestUserId): Promise<string> {
  const token = `session-token-${userId}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  return `better-auth.session_token=${token}.${btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  )}`;
}

async function apiRequest(
  path: string,
  options?: { body?: unknown; method?: string; userId?: TestUserId },
): Promise<Response> {
  const headers = new Headers({ origin: "http://example.com" });
  if (options?.body !== undefined)
    headers.set("content-type", "application/json");
  if (options?.userId) {
    headers.set("cookie", await signedSessionCookie(options.userId));
  }
  return exports.default.fetch(
    new Request(`http://example.com${path}`, {
      body:
        options?.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      method: options?.method ?? "GET",
    }),
  );
}

async function resetFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "delete from research_result_promotions where workspace_id = ?1",
    ).bind(workspaceId),
    env.DB.prepare("delete from workspaces where id = ?1").bind(workspaceId),
    env.DB.prepare("delete from user where id like 'research-%'"),
  ]);
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const [name, id] of Object.entries(users)) {
    statements.push(
      env.DB.prepare(
        "insert into user (id, name, email, email_verified) values (?1, ?2, ?3, 1)",
      ).bind(id, name, `${name}@example.com`),
      env.DB.prepare(
        "insert into session (id, expires_at, token, updated_at, user_id) values (?1, ?2, ?3, ?4, ?5)",
      ).bind(`session-${id}`, now + 3_600_000, `session-token-${id}`, now, id),
    );
  }
  statements.push(
    env.DB.prepare(
      "insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, 'Research home', ?2, ?3, ?3)",
    ).bind(workspaceId, users.owner, now),
    env.DB.prepare(
      "insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Japanese-modern home', ?3, ?4, ?4)",
    ).bind(collectionId, workspaceId, users.owner, now),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
    ).bind("research-owner-membership", workspaceId, users.owner, "owner", now),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'contributor', ?4, ?4)",
    ).bind(
      "research-contributor-membership",
      workspaceId,
      users.contributor,
      now,
    ),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'viewer', ?4, ?4)",
    ).bind("research-viewer-membership", workspaceId, users.viewer, now),
    env.DB.prepare(
      "insert into items (id, workspace_id, collection_id, title, created_by_user_id, created_at, updated_at) values (?1, ?2, ?3, 'Floor lamp', ?4, ?5, ?5)",
    ).bind(itemId, workspaceId, collectionId, users.owner, now),
  );
  await env.DB.batch(statements);
}

const requestInput = {
  constraints: {
    currency: "EUR" as const,
    excludedTerms: ["plastic"],
    maxUnitPriceMinor: 15_000,
    preferredDomains: ["jysk.nl"],
    requiredTerms: ["paper shade"],
  },
  itemId,
  query: "Japandi floor lamp",
};

describe("Provider Research API", () => {
  beforeEach(resetFixture);

  it("runs asynchronously, preserves provenance, and promotes exactly once", async () => {
    const workflow = await introspectWorkflow(env.RESEARCH_WORKFLOW);
    try {
      await workflow.modifyAll(async (modifier) => {
        await modifier.mockStepResult(
          { name: "search-provider" },
          {
            ok: true,
            output: {
              providerRequestId: "tavily-request-1",
              results: [
                {
                  content: "A low floor lamp with a paper shade.",
                  score: 0.91,
                  title: "Paper floor lamp",
                  url: "https://jysk.nl/verlichting/paper-floor-lamp",
                },
              ],
            },
          },
        );
      });

      const created = await apiRequest(
        `/api/collections/${collectionId}/research-requests`,
        { body: requestInput, method: "POST", userId: users.contributor },
      );
      expect(created.status).toBe(201);
      researchDeskResponseSchema.parse(await created.json());

      const instances = await workflow.get();
      expect(instances).toHaveLength(1);
      await instances[0]!.waitForStatus("complete");
      expect(await instances[0]!.getOutput()).toMatchObject({
        resultCount: 1,
        status: "completed",
      });

      const read = await apiRequest(
        `/api/collections/${collectionId}/research`,
        { userId: users.viewer },
      );
      expect(read.status).toBe(200);
      let desk = researchDeskResponseSchema.parse(await read.json());
      const run = desk.requests[0]?.runs[0];
      expect(run?.status).toBe("completed");
      expect(run?.providerQuery).toContain('"paper shade"');
      expect(run?.providerQuery).toContain("-plastic");
      const result = run?.results[0];
      expect(result?.source).toMatchObject({
        extractionMethod: "search",
        extractionStatus: "not_allowed",
        provider: "tavily-basic-v1",
      });
      expect(
        new Date(result!.source.snapshotExpiresAt).getTime() -
          new Date(result!.source.retrievedAt).getTime(),
      ).toBe(30 * 24 * 60 * 60 * 1_000);

      const suggestion = result!.suggestion!;
      const promotion = {
        candidateNotes: result!.summary,
        confirmedDirectProductUrl: true as const,
        itemId,
        merchant: suggestion.merchant,
        offer: suggestion.offer,
        plannedPurchaseQuantity: 1,
        product: suggestion.product,
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const promoted = await apiRequest(
          `/api/collections/${collectionId}/research-results/${result!.id}/promote`,
          { body: promotion, method: "POST", userId: users.contributor },
        );
        expect(promoted.status).toBe(200);
        desk = researchDeskResponseSchema.parse(await promoted.json());
        expect(desk.requests[0]?.runs[0]?.results[0]?.promotion).not.toBeNull();
      }

      const promotedResource =
        desk.requests[0]?.runs[0]?.results[0]?.promotion;
      const blockedRefresh = await apiRequest(
        `/api/items/${itemId}/candidates/${promotedResource!.candidateId}/offers/${promotedResource!.offerId}/refresh`,
        { method: "POST", userId: users.contributor },
      );
      expect(blockedRefresh.status).toBe(400);
      expect(
        apiErrorResponseSchema.parse(await blockedRefresh.json()).error.code,
      ).toBe("BAD_REQUEST");

      const counts = await env.DB.prepare(
        `select
					(select count(*) from products where workspace_id = ?1) as products,
					(select count(*) from item_candidates where item_id = ?2) as candidates,
					(select count(*) from offers where workspace_id = ?1) as offers,
					(select count(*) from price_checks pc join offers o on o.id = pc.offer_id where o.workspace_id = ?1) as checks,
					(select count(*) from decision_events where item_id = ?2) as decisions`,
      )
        .bind(workspaceId, itemId)
        .first<
          Record<
            "candidates" | "checks" | "decisions" | "offers" | "products",
            number
          >
        >();
      expect(counts).toEqual({
        candidates: 1,
        checks: 1,
        decisions: 0,
        offers: 1,
        products: 1,
      });
    } finally {
      await workflow.dispose();
    }
  });

  it("exposes failures safely and rejects viewers and outsiders", async () => {
    const denied = await apiRequest(
      `/api/collections/${collectionId}/research-requests`,
      { body: requestInput, method: "POST", userId: users.viewer },
    );
    expect(denied.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await denied.json()).error.code).toBe(
      "FORBIDDEN",
    );

    const hidden = await apiRequest(
      `/api/collections/${collectionId}/research`,
      { userId: users.outsider },
    );
    expect(hidden.status).toBe(404);

    const workflow = await introspectWorkflow(env.RESEARCH_WORKFLOW);
    try {
      await workflow.modifyAll(async (modifier) => {
        await modifier.mockStepResult(
          { name: "search-provider" },
          {
            code: "provider_not_configured",
            message: "Live research is not configured yet.",
            ok: false,
          },
        );
      });
      const created = await apiRequest(
        `/api/collections/${collectionId}/research-requests`,
        { body: requestInput, method: "POST", userId: users.owner },
      );
      expect(created.status).toBe(201);
      const [instance] = await workflow.get();
      await instance!.waitForStatus("complete");

      const read = await apiRequest(
        `/api/collections/${collectionId}/research`,
        { userId: users.owner },
      );
      const desk = researchDeskResponseSchema.parse(await read.json());
      expect(desk.requests[0]?.runs[0]).toMatchObject({
        errorCode: "provider_not_configured",
        errorMessage: "Live research is not configured yet.",
        status: "failed",
      });
    } finally {
      await workflow.dispose();
    }
  });
});
