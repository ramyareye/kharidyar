import { env, exports } from "cloudflare:workers";
import {
	apiErrorResponseSchema,
	conceptMediaResponseSchema,
} from "@kharidyar/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import {
	conceptMediaLimits,
	uploadConceptImage,
} from "../src/worker/concept-media-service";

const authSecret = "task-3-test-secret-with-at-least-32-characters";
const workspaceId = "media-workspace";
const collectionId = "media-collection";
const siblingCollectionId = "media-sibling-collection";
const conceptId = "media-concept";

const users = {
	collectionViewer: "media-collection-viewer",
	contributor: "media-contributor",
	editor: "media-editor",
	owner: "media-owner",
	viewer: "media-viewer",
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

function uploadForm(
	overrides: Partial<{
		caption: string;
		containsPerson: boolean;
		file: File;
		personRightsConfirmed: boolean;
		role: "base" | "reference";
		subjectKind: "person" | "space" | null;
	}> = {},
): FormData {
	const value = {
		caption: "Original room",
		containsPerson: false,
		file: pngFile(),
		personRightsConfirmed: false,
		role: "base" as const,
		subjectKind: "space" as "person" | "space" | null,
		...overrides,
	};
	const form = new FormData();
	form.set("file", value.file);
	form.set("caption", value.caption);
	form.set("containsPerson", String(value.containsPerson));
	form.set("personRightsConfirmed", String(value.personRightsConfirmed));
	form.set("role", value.role);
	if (value.subjectKind !== null) form.set("subjectKind", value.subjectKind);
	return form;
}

function uploadRequest(form = uploadForm()): Request {
	return new Request("http://example.com/api/concept-media", {
		body: form,
		method: "POST",
	});
}

async function upload(
	form: FormData,
	userId: TestUserId = users.owner,
): Promise<Response> {
	return request(`/api/collections/${collectionId}/concept/images`, {
		body: form,
		method: "POST",
		userId,
	});
}

async function clearBucket(): Promise<void> {
	let cursor: string | undefined;
	do {
		const page = await env.CONCEPT_MEDIA.list({
			cursor,
			prefix: "concept-images/",
		});
		if (page.objects.length > 0) {
			await env.CONCEPT_MEDIA.delete(page.objects.map(({ key }) => key));
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

async function resetFixture(): Promise<void> {
	await clearBucket();
	await env.DB.batch([
		env.DB.prepare("delete from workspaces where id = ?1").bind(workspaceId),
		env.DB.prepare("delete from user where id like 'media-%'"),
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
		).bind("media-owner-membership", workspaceId, users.owner, "owner", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("media-editor-membership", workspaceId, users.editor, "editor", now),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind(
			"media-contributor-membership",
			workspaceId,
			users.contributor,
			"contributor",
			now,
		),
		env.DB.prepare(
			"insert into workspace_memberships (id, workspace_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?5)",
		).bind("media-viewer-membership", workspaceId, users.viewer, "viewer", now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Bedroom', ?3, ?4, ?4)",
		).bind(collectionId, workspaceId, users.owner, now),
		env.DB.prepare(
			"insert into collections (id, workspace_id, name, created_by_user_id, created_at, updated_at) values (?1, ?2, 'Sibling', ?3, ?4, ?4)",
		).bind(siblingCollectionId, workspaceId, users.owner, now),
		env.DB.prepare(
			"insert into collection_memberships (id, collection_id, user_id, role, created_at, updated_at) values (?1, ?2, ?3, 'viewer', ?4, ?4)",
		).bind(
			"media-sibling-viewer-membership",
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

beforeEach(resetFixture);

describe("private Concept media", () => {
	it("normalizes an authorized base upload and serves it only through Collection access", async () => {
		const uploaded = await upload(uploadForm());
		expect(uploaded.status).toBe(201);
		const media = conceptMediaResponseSchema.parse(await uploaded.json());
		expect(media.conceptId).toBe(conceptId);
		expect(media.images).toHaveLength(1);
		expect(media.images[0]).toMatchObject({
			caption: "Original room",
			containsPerson: false,
			contentType: "image/webp",
			isCover: true,
			role: "base",
			subjectKind: "space",
		});
		expect(JSON.stringify(media)).not.toContain("object_key");

		const contentPath = media.images[0]?.contentUrl;
		expect(contentPath).toBeTruthy();
		const content = await request(contentPath ?? "", { userId: users.viewer });
		expect(content.status).toBe(200);
		expect(content.headers.get("content-type")).toBe("image/webp");
		expect(content.headers.get("cache-control")).toBe("private, no-store");
		expect((await content.arrayBuffer()).byteLength).toBeGreaterThan(0);

		expect((await request(contentPath ?? "")).status).toBe(401);
		expect(
			(
				await request(contentPath ?? "", {
					userId: users.collectionViewer,
				})
			).status,
		).toBe(404);
	});

	it("enforces edit permission, decoded media type, and person-photo consent", async () => {
		expect((await upload(uploadForm(), users.contributor)).status).toBe(403);
		expect(
			(
				await request(`/api/collections/${collectionId}/concept/images`, {
					body: "not multipart",
					contentType: "text/plain",
					method: "POST",
					userId: users.contributor,
				})
			).status,
		).toBe(403);

		const missingConsent = await upload(
			uploadForm({
				containsPerson: true,
				personRightsConfirmed: false,
				subjectKind: "person",
			}),
			users.editor,
		);
		expect(missingConsent.status).toBe(400);
		expect(
			apiErrorResponseSchema.parse(await missingConsent.json()).error.code,
		).toBe("INVALID_MEDIA");

		const disguised = await upload(
			uploadForm({ file: pngFile("fake.jpg", "image/jpeg") }),
		);
		expect(disguised.status).toBe(400);
		expect(
			apiErrorResponseSchema.parse(await disguised.json()).error.code,
		).toBe("INVALID_MEDIA");

		const confirmed = await upload(
			uploadForm({
				containsPerson: true,
				personRightsConfirmed: true,
				subjectKind: "person",
			}),
			users.editor,
		);
		expect(confirmed.status).toBe(201);
		expect(
			conceptMediaResponseSchema.parse(await confirmed.json()).images[0],
		).toMatchObject({ containsPerson: true, subjectKind: "person" });
	});

	it("replaces the immutable base, orders references, selects a cover, and hard-deletes bytes", async () => {
		const first = conceptMediaResponseSchema.parse(
			await (await upload(uploadForm({ caption: "First base" }))).json(),
		);
		const firstId = first.images[0]?.id ?? "";
		const firstObject = await env.DB.prepare(
			"select object_key from concept_images where id = ?1",
		)
			.bind(firstId)
			.first<{ object_key: string }>();

		const second = conceptMediaResponseSchema.parse(
			await (await upload(uploadForm({ caption: "Replacement base" }))).json(),
		);
		expect(second.images).toHaveLength(1);
		expect(second.images[0]?.caption).toBe("Replacement base");
		const firstTombstone = await env.DB.prepare(
			"select deleted_at, object_deleted_at from concept_images where id = ?1",
		)
			.bind(firstId)
			.first<{ deleted_at: number | null; object_deleted_at: number | null }>();
		expect(firstTombstone?.deleted_at).not.toBeNull();
		expect(firstTombstone?.object_deleted_at).not.toBeNull();
		expect(
			await env.CONCEPT_MEDIA.head(firstObject?.object_key ?? "missing"),
		).toBeNull();

		const referenceOne = conceptMediaResponseSchema.parse(
			await (
				await upload(
					uploadForm({
						caption: "Paper light",
						role: "reference",
						subjectKind: null,
					}),
				)
			).json(),
		);
		const referenceTwo = conceptMediaResponseSchema.parse(
			await (
				await upload(
					uploadForm({
						caption: "Oak texture",
						role: "reference",
						subjectKind: null,
					}),
				)
			).json(),
		);
		const references = referenceTwo.images.filter(
			({ role }) => role === "reference",
		);
		const reorderedResponse = await request(
			`/api/collections/${collectionId}/concept/images/order`,
			{
				body: JSON.stringify({
					imageIds: [references[1]?.id, references[0]?.id],
				}),
				contentType: "application/json",
				method: "PUT",
				userId: users.editor,
			},
		);
		expect(reorderedResponse.status).toBe(200);
		const reordered = conceptMediaResponseSchema.parse(
			await reorderedResponse.json(),
		);
		expect(
			reordered.images
				.filter(({ role }) => role === "reference")
				.map(({ caption }) => caption),
		).toEqual(["Oak texture", "Paper light"]);

		const selectedReferenceId = referenceOne.images.find(
			({ caption }) => caption === "Paper light",
		)?.id;
		const coverResponse = await request(
			`/api/concept-images/${selectedReferenceId ?? "missing"}`,
			{
				body: JSON.stringify({ isCover: true }),
				contentType: "application/json",
				method: "PATCH",
				userId: users.editor,
			},
		);
		const covered = conceptMediaResponseSchema.parse(
			await coverResponse.json(),
		);
		expect(covered.images.filter(({ isCover }) => isCover)).toHaveLength(1);
		expect(covered.images.find(({ isCover }) => isCover)?.id).toBe(
			selectedReferenceId,
		);

		const referenceObject = await env.DB.prepare(
			"select object_key from concept_images where id = ?1",
		)
			.bind(selectedReferenceId)
			.first<{ object_key: string }>();
		const deletedResponse = await request(
			`/api/concept-images/${selectedReferenceId ?? "missing"}`,
			{ method: "DELETE", userId: users.editor },
		);
		expect(deletedResponse.status).toBe(200);
		expect(
			conceptMediaResponseSchema
				.parse(await deletedResponse.json())
				.images.some(({ id }) => id === selectedReferenceId),
		).toBe(false);
		expect(
			await env.CONCEPT_MEDIA.head(referenceObject?.object_key ?? "missing"),
		).toBeNull();

		const activeObjects = await env.CONCEPT_MEDIA.list({
			prefix: "concept-images/",
		});
		expect(activeObjects.objects.length).toBeGreaterThan(0);
		const removedConcept = await request(
			`/api/collections/${collectionId}/concept`,
			{ method: "DELETE", userId: users.owner },
		);
		expect(removedConcept.status).toBe(200);
		for (const object of activeObjects.objects) {
			expect(await env.CONCEPT_MEDIA.head(object.key)).toBeNull();
		}
	});

	it("enforces configurable Concept count and Workspace byte quotas", async () => {
		const defaults = conceptMediaLimits(env);
		await expect(
			uploadConceptImage({
				bucket: env.CONCEPT_MEDIA,
				collectionId,
				database: env.DB,
				images: env.IMAGES,
				limits: { ...defaults, maxWorkspaceBytes: 1 },
				rateLimitSecret: env.BETTER_AUTH_SECRET,
				request: uploadRequest(),
				userId: users.owner,
			}),
		).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" });
		expect(
			(await env.CONCEPT_MEDIA.list({ prefix: "concept-images/" })).objects,
		).toHaveLength(0);

		await uploadConceptImage({
			bucket: env.CONCEPT_MEDIA,
			collectionId,
			database: env.DB,
			images: env.IMAGES,
			limits: { ...defaults, maxImageCount: 1 },
			rateLimitSecret: env.BETTER_AUTH_SECRET,
			request: uploadRequest(),
			userId: users.owner,
		});
		await expect(
			uploadConceptImage({
				bucket: env.CONCEPT_MEDIA,
				collectionId,
				database: env.DB,
				images: env.IMAGES,
				limits: { ...defaults, maxImageCount: 1 },
				rateLimitSecret: env.BETTER_AUTH_SECRET,
				request: uploadRequest(
					uploadForm({ role: "reference", subjectKind: null }),
				),
				userId: users.owner,
			}),
		).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" });
	});

	it("keeps the Concept count quota atomic across concurrent uploads", async () => {
		const defaults = conceptMediaLimits(env);
		await uploadConceptImage({
			bucket: env.CONCEPT_MEDIA,
			collectionId,
			database: env.DB,
			images: env.IMAGES,
			limits: defaults,
			rateLimitSecret: env.BETTER_AUTH_SECRET,
			request: uploadRequest(),
			userId: users.owner,
		});

		const limits = { ...defaults, maxImageCount: 2 };
		const attempts = await Promise.allSettled([
			uploadConceptImage({
				bucket: env.CONCEPT_MEDIA,
				collectionId,
				database: env.DB,
				images: env.IMAGES,
				limits,
				rateLimitSecret: env.BETTER_AUTH_SECRET,
				request: uploadRequest(
					uploadForm({
						caption: "Concurrent reference one",
						role: "reference",
						subjectKind: null,
					}),
				),
				userId: users.owner,
			}),
			uploadConceptImage({
				bucket: env.CONCEPT_MEDIA,
				collectionId,
				database: env.DB,
				images: env.IMAGES,
				limits,
				rateLimitSecret: env.BETTER_AUTH_SECRET,
				request: uploadRequest(
					uploadForm({
						caption: "Concurrent reference two",
						role: "reference",
						subjectKind: null,
					}),
				),
				userId: users.owner,
			}),
		]);

		expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		const rejected = attempts.filter(
			(attempt): attempt is PromiseRejectedResult =>
				attempt.status === "rejected",
		);
		expect(
			rejected.map(({ reason }) => reason),
		).toEqual([expect.objectContaining({ code: "MEDIA_LIMIT_EXCEEDED" })]);
		expect(
			await env.DB.prepare(
				"select count(*) as count from concept_images where concept_id = ?1 and deleted_at is null",
			)
				.bind(conceptId)
				.first<{ count: number }>(),
		).toEqual({ count: 2 });
		expect(
			(await env.CONCEPT_MEDIA.list({ prefix: "concept-images/" })).objects,
		).toHaveLength(2);
	});

	it("rate-limits upload authorization before processing another image", async () => {
		const limits = { ...conceptMediaLimits(env), uploadLimit: 1 };
		await uploadConceptImage({
			bucket: env.CONCEPT_MEDIA,
			collectionId,
			database: env.DB,
			images: env.IMAGES,
			limits,
			rateLimitSecret: env.BETTER_AUTH_SECRET,
			request: uploadRequest(),
			userId: users.owner,
		});
		await expect(
			uploadConceptImage({
				bucket: env.CONCEPT_MEDIA,
				collectionId,
				database: env.DB,
				images: env.IMAGES,
				limits,
				rateLimitSecret: env.BETTER_AUTH_SECRET,
				request: uploadRequest(uploadForm({ caption: "Too soon" })),
				userId: users.owner,
			}),
		).rejects.toMatchObject({ code: "RATE_LIMITED" });
	});
});
