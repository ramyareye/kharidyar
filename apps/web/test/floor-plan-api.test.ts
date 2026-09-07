import { env, exports } from "cloudflare:workers";
import {
  collectionContextSchema,
  floorPlansResponseSchema,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  uploadFloorPlan,
  deleteFloorPlan,
  readFloorPlans,
  readFloorPlanContent,
} from "../src/worker/floor-plan-service";
import { readCurrentCollectionContext } from "../src/worker/context-service";
const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "floor-workspace";
const collectionId = "floor-collection";
const siblingCollectionId = "floor-sibling-collection";
const conceptId = "floor-concept";
const users = {
  collectionViewer: "floor-collection-viewer",
  contributor: "floor-contributor",
  editor: "floor-editor",
  owner: "floor-owner",
  viewer: "floor-viewer",
} as const;
type TestUserId = (typeof users)[keyof typeof users];
beforeEach(resetFixture);
const path = `/api/collections/${collectionId}/floor-plans`;
// Verifies opaque-file handling, not PDF interpretation.
const pdfBytes =
  "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n% original metadata retained\n%%EOF\n";
const pdfFile = () =>
  new File([pdfBytes], "home.pdf", { type: "application/pdf" });
function form(
  file = pdfFile(),
  title = "Ground floor",
  notes = "Living room 4 × 5 m; door 80 cm (estimated)",
) {
  const data = new FormData();
  data.set("file", file);
  data.set("title", title);
  data.set("notes", notes);
  return data;
}
const base = () => ({
  database: env.DB,
  bucket: env.CONCEPT_MEDIA,
  images: env.IMAGES,
  userId: users.owner,
  collectionId,
  rateLimitSecret: authSecret,
});
const upload = (data = form(), userId: TestUserId = users.owner) =>
  request(path, { method: "POST", body: data, userId });
async function added(data = form()) {
  const response = await upload(data);
  expect(response.status, await response.clone().text()).toBe(201);
  return floorPlansResponseSchema.parse(await response.json()).plans[0]!;
}
const edit = (
  id: string,
  userId: TestUserId = users.editor,
  value: unknown = { title: "Measured plan", notes: "Door 82 cm, measured" },
) =>
  request(`${path}/${id}`, {
    method: "PATCH",
    contentType: "application/json",
    body: JSON.stringify(value),
    userId,
  });

describe("private floor plans", () => {
  it("serves unchanged PDFs as private authenticated attachments", async () => {
    const plan = await added();
    expect(plan).toMatchObject({
      width: null,
      height: null,
      contentType: "application/pdf",
    });
    expect(JSON.stringify(plan)).not.toContain("object_key");
    const response = await request(plan.contentUrl, { userId: users.viewer });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(pdfBytes);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await request(plan.contentUrl)).status).toBe(401);
    expect(
      (await request(plan.contentUrl, { userId: users.collectionViewer }))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          plan.contentUrl.replace(collectionId, siblingCollectionId),
          { userId: users.owner },
        )
      ).status,
    ).toBe(404);
  });
  it("normalizes images and rejects spoofed, active or unsupported media", async () => {
    const plan = await added(form(pngFile()));
    expect(plan).toMatchObject({
      contentType: "image/webp",
      width: 1,
      height: 1,
    });
    const response = await request(plan.contentUrl, { userId: users.owner });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WEBP");
    for (const file of [
      new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }),
      new File(["<script>bad</script>"], "x.pdf", { type: "application/pdf" }),
      new File(["%PDF-1.7\ntruncated"], "x.pdf", { type: "application/pdf" }),
      pngFile("x.pdf", "application/pdf"),
      new File(["not an image"], "x.png", { type: "image/png" }),
    ])
      expect((await upload(form(file))).status).toBe(400);
    expect((await readFloorPlans(base())).plans).toHaveLength(1);
  });
  it("enforces current edit permissions, origin, parent and metadata limits", async () => {
    const plan = await added();
    for (const user of [users.viewer, users.contributor]) {
      expect((await upload(form(), user)).status).toBe(403);
      expect((await edit(plan.id, user)).status).toBe(403);
      expect(
        (
          await request(`${path}/${plan.id}`, {
            method: "DELETE",
            userId: user,
          })
        ).status,
      ).toBe(403);
    }
    expect((await edit(plan.id, users.collectionViewer)).status).toBe(404);
    expect(
      (
        await request(path, {
          method: "POST",
          body: form(),
          origin: "https://evil.example",
          userId: users.owner,
        })
      ).status,
    ).toBe(403);
    expect((await upload(form(pdfFile(), "", ""))).status).toBe(400);
    expect(
      (
        await edit(plan.id, users.owner, {
          title: "Name",
          notes: "x".repeat(4001),
        })
      ).status,
    ).toBe(400);
    const extras = form();
    extras.append("title", "duplicate");
    expect((await upload(extras)).status).toBe(400);
    expect((await edit(plan.id)).status).toBe(200);
    await env.DB.prepare("delete from workspace_memberships where user_id=?")
      .bind(users.editor)
      .run();
    expect((await edit(plan.id)).status).toBe(404);
    await env.DB.prepare("update collections set archived_at=? where id=?")
      .bind(Date.now(), collectionId)
      .run();
    expect((await edit(plan.id, users.owner)).status).toBe(409);
    expect((await readFloorPlans(base())).permissions.canManage).toBe(false);
  });
  it("reserves quota atomically for concurrent uploads and releases it on deletion", async () => {
    const responses = await Promise.all(
      Array.from({ length: 7 }, () => upload()),
    );
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(6);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    const data = await readFloorPlans(base());
    expect(data.plans).toHaveLength(6);
    await deleteFloorPlan({ ...base(), planId: data.plans[0]!.id });
    expect((await upload()).status).toBe(201);
  });
  it("enforces file size and workspace storage across sibling collections", async () => {
    const oversized = form(
      new File([new Uint8Array(10 * 1024 * 1024 + 30_000)], "large.pdf", {
        type: "application/pdf",
      }),
    );
    expect((await upload(oversized)).status).toBe(413);
    // Existing reservations model storage without allocating 100 MiB of fixtures.
    for (let index = 0; index < 10; index++)
      await env.DB.prepare(
        "insert into floor_plans(id,collection_id,title,object_key,content_type,byte_size,uploaded_by_user_id,status) values(?,?,'Reserved',?,'application/pdf',10485760,?,'pending')",
      )
        .bind(
          `quota-${index}`,
          siblingCollectionId,
          `floor-plans/quota-${index}`,
          users.owner,
        )
        .run();
    expect((await upload()).status).toBe(409);
    expect((await readFloorPlans(base())).plans).toHaveLength(0);
  });
  it("cleans failed and abandoned reservations without publishing partial files", async () => {
    const bucket = new Proxy(env.CONCEPT_MEDIA, {
      get(target, key) {
        if (key === "put")
          return () => {
            throw new Error("simulated storage failure");
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      uploadFloorPlan({
        ...base(),
        bucket,
        request: new Request("http://example.com", {
          method: "POST",
          body: form(),
        }),
      }),
    ).rejects.toThrow("simulated storage failure");
    expect((await readFloorPlans(base())).plans).toHaveLength(0);
    await env.DB.prepare(
      "insert into floor_plans(id,collection_id,title,notes,object_key,content_type,byte_size,uploaded_by_user_id,status,created_at) values('abandoned',?,'Secret','Private notes','floor-plans/abandoned','application/pdf',1,?,'pending',?)",
    )
      .bind(collectionId, users.owner, Date.now() - 3_600_001)
      .run();
    await env.CONCEPT_MEDIA.put("floor-plans/abandoned", "x");
    await readFloorPlans(base());
    expect(await env.CONCEPT_MEDIA.get("floor-plans/abandoned")).toBeNull();
    expect(
      await env.DB.prepare(
        "select status,notes from floor_plans where id='abandoned'",
      ).first(),
    ).toEqual({ status: "deleted", notes: null });
  });
  it("rechecks permission after object upload and download", async () => {
    const plan = await added();
    const bucket = new Proxy(env.CONCEPT_MEDIA, {
      get(target, key) {
        if (key === "get")
          return async (objectKey: string) => {
            const object = await target.get(objectKey);
            await env.DB.prepare(
              "delete from workspace_memberships where user_id=?",
            )
              .bind(users.viewer)
              .run();
            return object;
          };
        if (key === "put")
          return async (...args: Parameters<R2Bucket["put"]>) => {
            const object = await target.put(...args);
            await env.DB.prepare(
              "delete from workspace_memberships where user_id=?",
            )
              .bind(users.editor)
              .run();
            return object;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      readFloorPlanContent({
        ...base(),
        bucket,
        planId: plan.id,
        userId: users.viewer,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      uploadFloorPlan({
        ...base(),
        bucket,
        userId: users.editor,
        request: new Request("http://example.com", {
          method: "POST",
          body: form(),
        }),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readFloorPlans(base())).plans).toHaveLength(1);
    expect(
      (await env.CONCEPT_MEDIA.list({ prefix: "floor-plans/" })).objects,
    ).toHaveLength(1);
  });
  it("revokes downloads before storage deletion and retries cleanup on an authorized visit", async () => {
    const plan = await added();
    const bucket = new Proxy(env.CONCEPT_MEDIA, {
      get(target, key) {
        if (key === "delete")
          return () => {
            throw new Error("delete unavailable");
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      deleteFloorPlan({ ...base(), bucket, planId: plan.id }),
    ).rejects.toThrow("delete unavailable");
    expect(
      (await request(plan.contentUrl, { userId: users.owner })).status,
    ).toBe(404);
    expect(
      (await env.CONCEPT_MEDIA.list({ prefix: "floor-plans/" })).objects,
    ).toHaveLength(1);
    expect((await readFloorPlans(base())).plans).toHaveLength(0);
    expect(
      (await env.CONCEPT_MEDIA.list({ prefix: "floor-plans/" })).objects,
    ).toHaveLength(0);
    expect(await deleteFloorPlan({ ...base(), planId: plan.id })).toEqual({
      deleted: true,
    });
  });
  it("includes only saved notes in context and accepts older immutable snapshots", async () => {
    const plan = await added();
    const context = await readCurrentCollectionContext(base());
    expect(context.floorPlans).toEqual([
      {
        id: plan.id,
        title: plan.title,
        notes: plan.notes,
        contentType: plan.contentType,
        updatedAt: plan.updatedAt,
      },
    ]);
    const text = JSON.stringify(context.floorPlans);
    for (const secret of [
      "object_key",
      "floor-plans/",
      "contentUrl",
      "%PDF",
      users.owner,
    ])
      expect(text).not.toContain(secret);
    const { floorPlans: plans, ...legacy } = context;
    expect(plans).toHaveLength(1);
    expect(collectionContextSchema.parse(legacy)).not.toHaveProperty(
      "floorPlans",
    );
    await expect(
      readCurrentCollectionContext({
        ...base(),
        userId: users.collectionViewer,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await deleteFloorPlan({ ...base(), planId: plan.id });
    expect((await readCurrentCollectionContext(base())).floorPlans).toEqual([]);
    expect(context.floorPlans).toHaveLength(1);
  });
});
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

async function request(
  path: string,
  options: {
    body?: BodyInit;
    contentType?: string;
    method?: string;
    origin?: string | null;
    userId?: TestUserId;
  } = {},
): Promise<Response> {
  const headers = new Headers();
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? "http://example.com");
  }
  if (options.userId) {
    headers.set("cookie", await signedSessionCookie(options.userId));
  }
  return exports.default.fetch(
    new Request(`http://example.com${path}`, {
      body: options.body,
      headers,
      method: options.method ?? "GET",
    }),
  );
}

function pngFile(name = "room.png", type = "image/png"): File {
  const encoded =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes], name, { type });
}

async function resetFixture(): Promise<void> {
  const objects = await env.CONCEPT_MEDIA.list({ prefix: "floor-plans/" });
  if (objects.objects.length)
    await env.CONCEPT_MEDIA.delete(objects.objects.map((object) => object.key));
  await env.DB.batch([
    env.DB.prepare(
      "delete from floor_plans where collection_id in (?, ?)",
    ).bind(collectionId, siblingCollectionId),
    env.DB.prepare("delete from workspaces where id = ?1").bind(workspaceId),
    env.DB.prepare("delete from user where id like 'floor-%'"),
    env.DB.prepare("delete from collaboration_rate_limits"),
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
      ).bind(
        `session-${id}`,
        now + 60 * 60_000,
        `session-token-${id}`,
        now,
        id,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      "insert into workspaces (id, name, created_by_user_id, created_at, updated_at) values (?1, 'Media home', ?2, ?3, ?3)",
    ).bind(workspaceId, users.owner, now),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
    ).bind("floor-owner-membership", workspaceId, users.owner, "owner", now),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
    ).bind("floor-editor-membership", workspaceId, users.editor, "editor", now),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
    ).bind(
      "floor-contributor-membership",
      workspaceId,
      users.contributor,
      "contributor",
      now,
    ),
    env.DB.prepare(
      "insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
    ).bind("floor-viewer-membership", workspaceId, users.viewer, "viewer", now),
    env.DB.prepare(
      "insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Bedroom', ?3, ?4, ?4)",
    ).bind(collectionId, workspaceId, users.owner, now),
    env.DB.prepare(
      "insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Sibling', ?3, ?4, ?4)",
    ).bind(siblingCollectionId, workspaceId, users.owner, now),
    env.DB.prepare(
      "insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'viewer', ?4, ?4)",
    ).bind(
      "floor-sibling-viewer-membership",
      siblingCollectionId,
      users.collectionViewer,
      now,
    ),
    env.DB.prepare(
      "insert into concepts (id, collection_id, title, narrative, created_by_user_id, updated_by_user_id, created_at, updated_at) values (?1, ?2, 'Quiet room', 'Warm wood and paper light.', ?3, ?3, ?4, ?4)",
    ).bind(conceptId, collectionId, users.owner, now),
  );
  await env.DB.batch(statements);
}
