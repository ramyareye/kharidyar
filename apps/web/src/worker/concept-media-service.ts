import type {
	ConceptImageReorderInput,
	ConceptImageResource,
	ConceptImageUpdateInput,
	ConceptImageUploadMetadata,
	ConceptMediaResponse,
} from "@kharidyar/contracts";
import { conceptImageUploadMetadataSchema } from "@kharidyar/contracts";
import { hasCapability } from "@kharidyar/domain";

import {
	badRequest,
	conflict,
	notFound,
	resourceArchived,
	ApiError,
} from "./api-errors";
import { loadCollectionAccess, requireCapability } from "./authorization";
import {
	enforceCollaborationRateLimit,
	type CollaborationRateLimitAction,
} from "./collaboration-rate-limit";

export interface ConceptMediaLimits {
	maxFileBytes: number;
	maxImageCount: number;
	maxPixelCount: number;
	maxSidePixels: number;
	maxWorkspaceBytes: number;
	uploadLimit: number;
	uploadWindowMilliseconds: number;
}

interface ConceptStateRow {
	collection_archived_at: number | null;
	concept_id: string | null;
	workspace_archived_at: number | null;
	workspace_id: string;
}

interface ConceptImageRow {
	byte_size: number;
	caption: string | null;
	concept_id: string;
	contains_person: number;
	content_type: "image/webp";
	created_at: number;
	height: number;
	id: string;
	is_cover: number;
	object_key: string;
	original_filename: string;
	position: number;
	role: "base" | "edited" | "reference";
	subject_kind: "person" | "space" | null;
	uploader_id: string;
	uploader_name: string;
	width: number;
}

interface ImageAccessRow extends ConceptImageRow {
	collection_archived_at: number | null;
	collection_id: string;
	concept_archived_at: number | null;
	workspace_archived_at: number | null;
	workspace_id: string;
}

interface ActiveImageStateRow {
	byte_size: number;
	id: string;
	is_cover: number;
	object_key: string;
	position: number;
	role: "base" | "edited" | "reference";
}

interface UsageRow {
	concept_image_count: number;
	workspace_bytes: number;
}

interface PendingObjectDeleteRow {
	id: string;
	object_key: string;
}

const allowedInputTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function positiveInteger(value: string, name: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return parsed;
}

export function conceptMediaLimits(environment: Env): ConceptMediaLimits {
	return {
		maxFileBytes: positiveInteger(
			environment.CONCEPT_MEDIA_MAX_FILE_BYTES,
			"CONCEPT_MEDIA_MAX_FILE_BYTES",
		),
		maxImageCount: positiveInteger(
			environment.CONCEPT_MEDIA_MAX_IMAGES,
			"CONCEPT_MEDIA_MAX_IMAGES",
		),
		maxPixelCount: positiveInteger(
			environment.CONCEPT_MEDIA_MAX_PIXEL_COUNT,
			"CONCEPT_MEDIA_MAX_PIXEL_COUNT",
		),
		maxSidePixels: positiveInteger(
			environment.CONCEPT_MEDIA_MAX_SIDE_PIXELS,
			"CONCEPT_MEDIA_MAX_SIDE_PIXELS",
		),
		maxWorkspaceBytes: positiveInteger(
			environment.CONCEPT_MEDIA_MAX_WORKSPACE_BYTES,
			"CONCEPT_MEDIA_MAX_WORKSPACE_BYTES",
		),
		uploadLimit: positiveInteger(
			environment.CONCEPT_MEDIA_UPLOAD_LIMIT,
			"CONCEPT_MEDIA_UPLOAD_LIMIT",
		),
		uploadWindowMilliseconds: positiveInteger(
			environment.CONCEPT_MEDIA_UPLOAD_WINDOW_MS,
			"CONCEPT_MEDIA_UPLOAD_WINDOW_MS",
		),
	};
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function imageResource(row: ConceptImageRow): ConceptImageResource {
	return {
		byteSize: row.byte_size,
		caption: row.caption,
		conceptId: row.concept_id,
		containsPerson: row.contains_person === 1,
		contentType: row.content_type,
		contentUrl: `/api/concept-images/${encodeURIComponent(row.id)}/content`,
		createdAt: timestamp(row.created_at),
		height: row.height,
		id: row.id,
		isCover: row.is_cover === 1,
		originalFilename: row.original_filename,
		position: row.position,
		role: row.role,
		subjectKind: row.subject_kind,
		uploader: { id: row.uploader_id, name: row.uploader_name },
		width: row.width,
	};
}

function invalidMedia(message: string): ApiError {
	return new ApiError(400, "INVALID_MEDIA", message);
}

function mediaLimit(message: string): ApiError {
	return new ApiError(409, "MEDIA_LIMIT_EXCEEDED", message);
}

async function conceptState(
	database: D1Database,
	collectionId: string,
): Promise<ConceptStateRow> {
	const row = await database
		.prepare(
			`select
				c.workspace_id,
				c.archived_at as collection_archived_at,
				w.archived_at as workspace_archived_at,
				co.id as concept_id
			from collections c
			join workspaces w on w.id = c.workspace_id
			left join concepts co
				on co.collection_id = c.id and co.archived_at is null
			where c.id = ?1`,
		)
		.bind(collectionId)
		.first<ConceptStateRow>();
	if (row === null) throw notFound();
	return row;
}

async function readableConcept(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<{
	canManage: boolean;
	state: ConceptStateRow;
}> {
	const access = requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			input.collectionId,
		),
		"view",
	);
	const state = await conceptState(input.database, input.collectionId);
	return {
		canManage:
			hasCapability(access.grants, access.target, "concept_edit") &&
			state.collection_archived_at === null,
		state,
	};
}

async function mutableConcept(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<ConceptStateRow & { concept_id: string }> {
	requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			input.collectionId,
		),
		"concept_edit",
	);
	const state = await conceptState(input.database, input.collectionId);
	if (state.workspace_archived_at !== null) throw resourceArchived("Workspace");
	if (state.collection_archived_at !== null)
		throw resourceArchived("Collection");
	if (state.concept_id === null) {
		throw conflict("Create the Concept before adding images.");
	}
	return { ...state, concept_id: state.concept_id };
}

async function activeImages(
	database: D1Database,
	conceptId: string,
): Promise<ActiveImageStateRow[]> {
	const result = await database
		.prepare(
			`select id, role, object_key, byte_size, position, is_cover
			from concept_images
			where concept_id = ?1 and deleted_at is null
			order by case role when 'base' then 0 when 'reference' then 1 else 2 end,
				position, created_at, id`,
		)
		.bind(conceptId)
		.all<ActiveImageStateRow>();
	return result.results;
}

async function usage(
	database: D1Database,
	conceptId: string | null,
	workspaceId: string,
): Promise<UsageRow> {
	const row = await database
		.prepare(
			`select
				(select count(*) from concept_images ci
					where ci.concept_id = ?1 and ci.deleted_at is null) as concept_image_count,
				(select coalesce(sum(ci.byte_size), 0)
					from concept_images ci
					join concepts co on co.id = ci.concept_id
					join collections c on c.id = co.collection_id
					where c.workspace_id = ?2 and ci.deleted_at is null) as workspace_bytes`,
		)
		.bind(conceptId, workspaceId)
		.first<UsageRow>();
	if (row === null)
		throw new Error("Concept media usage query returned no row");
	return row;
}

async function imageRows(
	database: D1Database,
	conceptId: string,
): Promise<ConceptImageRow[]> {
	const result = await database
		.prepare(
			`select
				ci.id, ci.concept_id, ci.role, ci.subject_kind, ci.object_key,
				ci.content_type, ci.original_filename, ci.byte_size, ci.width,
				ci.height, ci.position, ci.caption, ci.contains_person,
				ci.is_cover, ci.created_at,
				u.id as uploader_id, u.name as uploader_name
			from concept_images ci
			join user u on u.id = ci.uploaded_by_user_id
			where ci.concept_id = ?1 and ci.deleted_at is null
			order by case ci.role when 'base' then 0 when 'reference' then 1 else 2 end,
				ci.position, ci.created_at, ci.id`,
		)
		.bind(conceptId)
		.all<ConceptImageRow>();
	return result.results;
}

async function markObjectDeleted(
	database: D1Database,
	bucket: R2Bucket,
	row: PendingObjectDeleteRow,
): Promise<void> {
	await bucket.delete(row.object_key);
	await database
		.prepare(
			`update concept_images
			set object_deleted_at = ?1, updated_at = ?1
			where id = ?2 and deleted_at is not null and object_deleted_at is null`,
		)
		.bind(Date.now(), row.id)
		.run();
}

async function cleanupDeletedObjects(input: {
	bucket: R2Bucket;
	collectionId: string;
	database: D1Database;
}): Promise<void> {
	const pending = await input.database
		.prepare(
			`select ci.id, ci.object_key
			from concept_images ci
			join concepts co on co.id = ci.concept_id
			where co.collection_id = ?1
				and ci.deleted_at is not null
				and ci.object_deleted_at is null
			order by ci.deleted_at
			limit 20`,
		)
		.bind(input.collectionId)
		.all<PendingObjectDeleteRow>();

	for (const row of pending.results) {
		try {
			await markObjectDeleted(input.database, input.bucket, row);
		} catch (error) {
			console.warn({
				errorName: error instanceof Error ? error.name : "UnknownError",
				event: "concept_media_object_cleanup_failed",
				imageId: row.id,
			});
		}
	}
}

export async function readConceptMedia(input: {
	bucket: R2Bucket;
	collectionId: string;
	database: D1Database;
	limits: ConceptMediaLimits;
	userId: string;
}): Promise<ConceptMediaResponse> {
	const { canManage, state } = await readableConcept(input);
	await cleanupDeletedObjects(input);
	const currentUsage = await usage(
		input.database,
		state.concept_id,
		state.workspace_id,
	);
	return {
		conceptId: state.concept_id,
		images:
			state.concept_id === null
				? []
				: (await imageRows(input.database, state.concept_id)).map(
						imageResource,
					),
		limits: {
			maxFileBytes: input.limits.maxFileBytes,
			maxImageCount: input.limits.maxImageCount,
			maxPixelCount: input.limits.maxPixelCount,
			maxSidePixels: input.limits.maxSidePixels,
			maxWorkspaceBytes: input.limits.maxWorkspaceBytes,
		},
		permissions: {
			canManage:
				canManage &&
				state.workspace_archived_at === null &&
				state.concept_id !== null,
		},
		usage: {
			conceptImageCount: currentUsage.concept_image_count,
			workspaceBytes: currentUsage.workspace_bytes,
		},
	};
}

function formText(form: FormData, key: string): string | null {
	const value = form.get(key);
	return typeof value === "string" ? value : null;
}

function uploadParts(form: FormData): {
	file: File;
	metadata: ConceptImageUploadMetadata;
} {
	const file = form.get("file");
	if (!(file instanceof File)) throw invalidMedia("Choose an image to upload.");
	const containsPersonText = formText(form, "containsPerson");
	const rightsText = formText(form, "personRightsConfirmed");
	if (
		!(["true", "false"] as const).includes(
			containsPersonText as "false" | "true",
		) ||
		!(["true", "false"] as const).includes(rightsText as "false" | "true")
	) {
		throw invalidMedia("Image privacy fields are invalid.");
	}
	const parsed = conceptImageUploadMetadataSchema.safeParse({
		caption: formText(form, "caption"),
		containsPerson: containsPersonText === "true",
		personRightsConfirmed: rightsText === "true",
		role: formText(form, "role"),
		subjectKind: formText(form, "subjectKind"),
	});
	if (!parsed.success)
		throw invalidMedia(
			parsed.error.issues[0]?.message ?? "Invalid image details.",
		);
	return { file, metadata: parsed.data };
}

function cleanFilename(value: string): string {
	return (
		value
			.replace(/\p{Cc}/gu, "")
			.trim()
			.slice(0, 255) || "image"
	);
}

function bytesStream(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
	return new Blob([bytes]).stream();
}

async function normalizedImage(input: {
	file: File;
	images: ImagesBinding;
	limits: ConceptMediaLimits;
}): Promise<{
	bytes: ArrayBuffer;
	height: number;
	sha256: ArrayBuffer;
	sha256Hex: string;
	width: number;
}> {
	if (!allowedInputTypes.has(input.file.type)) {
		throw invalidMedia("Use a JPEG, PNG, or WebP image.");
	}
	if (input.file.size <= 0 || input.file.size > input.limits.maxFileBytes) {
		throw mediaLimit("The image exceeds the configured file-size limit.");
	}

	const source = await input.file.arrayBuffer();
	let sourceInfo: ImageInfoResponse;
	try {
		sourceInfo = await input.images.info(bytesStream(source));
	} catch {
		throw invalidMedia("The uploaded file could not be decoded as an image.");
	}
	if (!("width" in sourceInfo)) {
		throw invalidMedia("SVG images are not accepted.");
	}
	if (
		!allowedInputTypes.has(sourceInfo.format) ||
		sourceInfo.format !== input.file.type
	) {
		throw invalidMedia(
			"The file contents do not match an accepted image type.",
		);
	}
	if (
		sourceInfo.width > input.limits.maxSidePixels ||
		sourceInfo.height > input.limits.maxSidePixels ||
		sourceInfo.width * sourceInfo.height > input.limits.maxPixelCount
	) {
		throw mediaLimit("The image dimensions exceed the configured limit.");
	}

	let output: ArrayBuffer;
	try {
		const transformed = await input.images
			.input(bytesStream(source))
			.output({ anim: false, format: "image/webp", quality: 90 });
		output = await new Response(transformed.image()).arrayBuffer();
	} catch {
		throw invalidMedia("The image could not be safely normalized.");
	}
	if (output.byteLength <= 0 || output.byteLength > input.limits.maxFileBytes) {
		throw mediaLimit(
			"The normalized image exceeds the configured file-size limit.",
		);
	}

	let outputInfo: ImageInfoResponse;
	try {
		outputInfo = await input.images.info(bytesStream(output));
	} catch {
		throw invalidMedia("The normalized image could not be verified.");
	}
	if (!("width" in outputInfo)) {
		throw invalidMedia("The normalized image format is invalid.");
	}
	if (outputInfo.format !== "image/webp") {
		throw invalidMedia("The normalized image format is invalid.");
	}
	const sha256 = await crypto.subtle.digest("SHA-256", output);
	const sha256Hex = [...new Uint8Array(sha256)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return {
		bytes: output,
		height: outputInfo.height,
		sha256,
		sha256Hex,
		width: outputInfo.width,
	};
}

async function deleteNewObjectAfterFailure(
	bucket: R2Bucket,
	key: string,
	imageId: string,
): Promise<void> {
	try {
		await bucket.delete(key);
	} catch (error) {
		console.error({
			errorName: error instanceof Error ? error.name : "UnknownError",
			event: "concept_media_failed_upload_cleanup_failed",
			imageId,
		});
	}
}

export async function uploadConceptImage(input: {
	bucket: R2Bucket;
	collectionId: string;
	database: D1Database;
	images: ImagesBinding;
	limits: ConceptMediaLimits;
	rateLimitSecret: string;
	request: Request;
	userId: string;
}): Promise<ConceptMediaResponse> {
	const state = await mutableConcept(input);
	await enforceCollaborationRateLimit({
		action: "concept_media_upload" satisfies CollaborationRateLimitAction,
		database: input.database,
		identity: `${input.userId}:${input.collectionId}`,
		limit: input.limits.uploadLimit,
		now: Date.now(),
		secret: input.rateLimitSecret,
		windowMilliseconds: input.limits.uploadWindowMilliseconds,
	});
	let form: FormData;
	try {
		form = await input.request.formData();
	} catch {
		throw badRequest("The upload must use multipart form data.");
	}
	const { file, metadata } = uploadParts(form);
	const normalized = await normalizedImage({
		file,
		images: input.images,
		limits: input.limits,
	});
	const currentImages = await activeImages(input.database, state.concept_id);
	const currentBase = currentImages.find(({ role }) => role === "base");
	const currentCover = currentImages.find(({ is_cover }) => is_cover === 1);
	const replacingBase = metadata.role === "base" ? currentBase : undefined;
	const currentUsage = await usage(
		input.database,
		state.concept_id,
		state.workspace_id,
	);
	const nextCount =
		currentUsage.concept_image_count - (replacingBase ? 1 : 0) + 1;
	const nextWorkspaceBytes =
		currentUsage.workspace_bytes -
		(replacingBase?.byte_size ?? 0) +
		normalized.bytes.byteLength;
	if (nextCount > input.limits.maxImageCount) {
		throw mediaLimit("This Concept has reached its image limit.");
	}
	if (nextWorkspaceBytes > input.limits.maxWorkspaceBytes) {
		throw mediaLimit("This Workspace has reached its media storage limit.");
	}

	const now = Date.now();
	const imageId = crypto.randomUUID();
	const objectKey = `concept-images/${crypto.randomUUID()}`;
	const shouldBeCover =
		currentCover === undefined || replacingBase?.is_cover === 1;
	const position =
		metadata.role === "base"
			? 0
			: Math.max(
					-1,
					...currentImages
						.filter(({ role }) => role === "reference")
						.map(({ position: currentPosition }) => currentPosition),
				) + 1;
	const stored = await input.bucket.put(objectKey, normalized.bytes, {
		customMetadata: { imageId },
		httpMetadata: {
			cacheControl: "private, no-store",
			contentDisposition: "inline",
			contentType: "image/webp",
		},
		onlyIf: new Headers({ "if-none-match": "*" }),
		sha256: normalized.sha256,
	});
	if (stored === null)
		throw conflict("The generated image key already exists.");

	const statements: D1PreparedStatement[] = [];
	if (replacingBase) {
		statements.push(
			input.database
				.prepare(
					`update concept_images
					set deleted_at = ?1, deleted_by_user_id = ?2, updated_at = ?1
					where id = ?3 and concept_id = ?4 and deleted_at is null`,
				)
				.bind(now, input.userId, replacingBase.id, state.concept_id),
		);
	}
	statements.push(
		input.database
			.prepare(
				`insert into concept_images (
					id, concept_id, role, subject_kind, parent_image_id, object_key,
					content_type, original_filename, byte_size, width, height, sha256,
					position, caption, contains_person, person_rights_confirmed_at,
					uploaded_by_user_id, is_cover, created_at, updated_at
				)
				select
					case when (
						(select count(*)
							from concept_images ci
							where ci.concept_id = ?1 and ci.deleted_at is null) < ?2
						and
						(select coalesce(sum(ci.byte_size), 0)
							from concept_images ci
							join concepts co on co.id = ci.concept_id
							join collections c on c.id = co.collection_id
							where c.workspace_id = ?3 and ci.deleted_at is null) + ?4 <= ?5
						and exists (
							select 1
							from concepts co
							join collections c on c.id = co.collection_id
							join workspaces w on w.id = c.workspace_id
							where co.id = ?1
								and co.archived_at is null
								and c.archived_at is null
								and w.archived_at is null
								and (
									exists (
										select 1 from workspace_memberships wm
										where wm.workspace_id = c.workspace_id
											and wm.user_id = ?19
											and wm.role in ('editor', 'owner')
									)
									or exists (
										select 1 from collection_memberships cm
										where cm.collection_id = c.id
											and cm.user_id = ?19
											and cm.role in ('editor', 'owner')
									)
								)
						)
					) then ?6 else null end,
					?1, ?7, ?8, null, ?9, 'image/webp', ?10, ?11, ?12, ?13, ?14,
					?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21`,
			)
			.bind(
				state.concept_id,
				input.limits.maxImageCount,
				state.workspace_id,
				normalized.bytes.byteLength,
				input.limits.maxWorkspaceBytes,
				imageId,
				metadata.role,
				metadata.subjectKind,
				objectKey,
				cleanFilename(file.name),
				normalized.bytes.byteLength,
				normalized.width,
				normalized.height,
				normalized.sha256Hex,
				position,
				metadata.caption,
				metadata.containsPerson ? 1 : 0,
				metadata.containsPerson ? now : null,
				input.userId,
				shouldBeCover ? 1 : 0,
				now,
			),
	);

	try {
		await input.database.batch(statements);
	} catch (error) {
		await deleteNewObjectAfterFailure(input.bucket, objectKey, imageId);
		if (error instanceof ApiError) throw error;
		if (
			error instanceof Error &&
			error.message.includes("NOT NULL constraint failed: concept_images.id")
		) {
			const latestState = await mutableConcept(input);
			if (latestState.concept_id !== state.concept_id) {
				throw conflict("The Concept changed. Please retry.");
			}
			const latestImages = await activeImages(input.database, state.concept_id);
			const latestBase = latestImages.find(({ role }) => role === "base");
			const latestUsage = await usage(
				input.database,
				state.concept_id,
				state.workspace_id,
			);
			if (
				latestUsage.concept_image_count -
					(metadata.role === "base" && latestBase ? 1 : 0) +
					1 >
				input.limits.maxImageCount
			) {
				throw mediaLimit("This Concept has reached its image limit.");
			}
			if (
				latestUsage.workspace_bytes -
					(metadata.role === "base" ? (latestBase?.byte_size ?? 0) : 0) +
					normalized.bytes.byteLength >
				input.limits.maxWorkspaceBytes
			) {
				throw mediaLimit("This Workspace has reached its media storage limit.");
			}
			throw conflict("Concept images changed. Please retry.");
		}
		if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
			throw conflict("Concept images changed. Please retry.");
		}
		throw error;
	}

	if (replacingBase) {
		try {
			await markObjectDeleted(input.database, input.bucket, {
				id: replacingBase.id,
				object_key: replacingBase.object_key,
			});
		} catch (error) {
			console.warn({
				errorName: error instanceof Error ? error.name : "UnknownError",
				event: "concept_media_replaced_object_cleanup_deferred",
				imageId: replacingBase.id,
			});
		}
	}

	return readConceptMedia(input);
}

async function imageAccess(input: {
	database: D1Database;
	imageId: string;
	userId: string;
	write: boolean;
}): Promise<ImageAccessRow> {
	const row = await input.database
		.prepare(
			`select
				ci.id, ci.concept_id, ci.role, ci.subject_kind, ci.object_key,
				ci.content_type, ci.original_filename, ci.byte_size, ci.width,
				ci.height, ci.position, ci.caption, ci.contains_person,
				ci.is_cover, ci.created_at,
				u.id as uploader_id, u.name as uploader_name,
				co.collection_id, co.archived_at as concept_archived_at,
				c.workspace_id, c.archived_at as collection_archived_at,
				w.archived_at as workspace_archived_at
			from concept_images ci
			join concepts co on co.id = ci.concept_id
			join collections c on c.id = co.collection_id
			join workspaces w on w.id = c.workspace_id
			join user u on u.id = ci.uploaded_by_user_id
			where ci.id = ?1 and ci.deleted_at is null`,
		)
		.bind(input.imageId)
		.first<ImageAccessRow>();
	if (row === null || row.concept_archived_at !== null) throw notFound();
	requireCapability(
		await loadCollectionAccess(input.database, input.userId, row.collection_id),
		input.write ? "concept_edit" : "view",
	);
	if (input.write) {
		if (row.workspace_archived_at !== null) throw resourceArchived("Workspace");
		if (row.collection_archived_at !== null)
			throw resourceArchived("Collection");
	}
	return row;
}

export async function readConceptImageContent(input: {
	bucket: R2Bucket;
	database: D1Database;
	imageId: string;
	requestHeaders: Headers;
	userId: string;
}): Promise<Response> {
	const row = await imageAccess({ ...input, write: false });
	const conditionalHeaders = new Headers();
	for (const name of [
		"if-match",
		"if-modified-since",
		"if-none-match",
		"if-unmodified-since",
	]) {
		const value = input.requestHeaders.get(name);
		if (value !== null) conditionalHeaders.set(name, value);
	}
	const object = await input.bucket.get(row.object_key, {
		onlyIf: conditionalHeaders,
	});
	if (object === null) throw notFound();
	const headers = new Headers({
		"cache-control": "private, no-store",
		"content-disposition": "inline",
		"content-type": row.content_type,
		"x-content-type-options": "nosniff",
	});
	headers.set("etag", object.httpEtag);
	if ("body" in object) {
		headers.set("content-length", object.size.toString());
		return new Response(object.body, { headers, status: 200 });
	}
	return new Response(null, { headers, status: 304 });
}

export async function updateConceptImage(input: {
	bucket: R2Bucket;
	database: D1Database;
	imageId: string;
	limits: ConceptMediaLimits;
	userId: string;
	value: ConceptImageUpdateInput;
}): Promise<ConceptMediaResponse> {
	const row = await imageAccess({ ...input, write: true });
	const now = Date.now();
	const statements: D1PreparedStatement[] = [];
	if (input.value.isCover === true) {
		statements.push(
			input.database
				.prepare(
					`update concept_images
					set is_cover = 0, updated_at = ?1
					where concept_id = ?2 and deleted_at is null and is_cover = 1`,
				)
				.bind(now, row.concept_id),
		);
	}
	statements.push(
		input.database
			.prepare(
				`update concept_images
				set caption = case when ?1 = 1 then ?2 else caption end,
					is_cover = case when ?3 = 1 then ?4 else is_cover end,
					updated_at = ?5
				where id = ?6 and deleted_at is null`,
			)
			.bind(
				Object.hasOwn(input.value, "caption") ? 1 : 0,
				input.value.caption ?? null,
				Object.hasOwn(input.value, "isCover") ? 1 : 0,
				input.value.isCover ? 1 : 0,
				now,
				row.id,
			),
	);
	const results = await input.database.batch(statements);
	if (results.at(-1)?.meta.changes !== 1) {
		throw conflict("The Concept image changed. Please retry.");
	}
	return readConceptMedia({
		bucket: input.bucket,
		collectionId: row.collection_id,
		database: input.database,
		limits: input.limits,
		userId: input.userId,
	});
}

export async function reorderConceptReferences(input: {
	bucket: R2Bucket;
	collectionId: string;
	database: D1Database;
	limits: ConceptMediaLimits;
	userId: string;
	value: ConceptImageReorderInput;
}): Promise<ConceptMediaResponse> {
	const state = await mutableConcept(input);
	const current = (await activeImages(input.database, state.concept_id)).filter(
		({ role }) => role === "reference",
	);
	const expected = new Set(current.map(({ id }) => id));
	if (
		expected.size !== input.value.imageIds.length ||
		input.value.imageIds.some((id) => !expected.has(id))
	) {
		throw conflict("Reference images changed. Refresh and retry the order.");
	}
	if (current.length === 0) return readConceptMedia(input);

	const now = Date.now();
	const statements = input.value.imageIds.map((id, position) =>
		input.database
			.prepare(
				`update concept_images
				set position = ?1, updated_at = ?2
				where id = ?3 and concept_id = ?4 and role = 'reference'
					and deleted_at is null`,
			)
			.bind(position, now, id, state.concept_id),
	);
	const results = await input.database.batch(statements);
	if (results.some(({ meta }) => meta.changes !== 1)) {
		throw conflict("Reference images changed. Refresh and retry the order.");
	}
	return readConceptMedia(input);
}

export async function deleteConceptImage(input: {
	bucket: R2Bucket;
	database: D1Database;
	imageId: string;
	limits: ConceptMediaLimits;
	userId: string;
}): Promise<ConceptMediaResponse> {
	const row = await imageAccess({ ...input, write: true });
	const now = Date.now();
	const deleted = await input.database
		.prepare(
			`update concept_images
			set deleted_at = ?1, deleted_by_user_id = ?2, updated_at = ?1
			where id = ?3 and deleted_at is null`,
		)
		.bind(now, input.userId, row.id)
		.run();
	if (deleted.meta.changes !== 1) {
		throw conflict("The Concept image changed. Please retry.");
	}
	await markObjectDeleted(input.database, input.bucket, {
		id: row.id,
		object_key: row.object_key,
	});
	return readConceptMedia({
		bucket: input.bucket,
		collectionId: row.collection_id,
		database: input.database,
		limits: input.limits,
		userId: input.userId,
	});
}

export async function deleteAllConceptMedia(input: {
	bucket: R2Bucket;
	conceptId: string;
	database: D1Database;
	userId: string;
}): Promise<void> {
	const active = await activeImages(input.database, input.conceptId);
	if (active.length === 0) return;
	const now = Date.now();
	await input.database
		.prepare(
			`update concept_images
			set deleted_at = ?1, deleted_by_user_id = ?2, updated_at = ?1
			where concept_id = ?3 and deleted_at is null`,
		)
		.bind(now, input.userId, input.conceptId)
		.run();
	for (const image of active) {
		try {
			await markObjectDeleted(input.database, input.bucket, {
				id: image.id,
				object_key: image.object_key,
			});
		} catch (error) {
			console.warn({
				errorName: error instanceof Error ? error.name : "UnknownError",
				event: "concept_media_concept_cleanup_deferred",
				imageId: image.id,
			});
		}
	}
}
