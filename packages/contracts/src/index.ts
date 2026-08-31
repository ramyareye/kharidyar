import { itemPriorities, itemStatuses } from "@kharidyar/domain";
import { z } from "zod";

const maximumSafeInteger = Number.MAX_SAFE_INTEGER;

function requiredTrimmedText(maximumLength: number) {
	return z.string().trim().min(1).max(maximumLength);
}

function nullableTrimmedText(maximumLength: number) {
	return z
		.string()
		.trim()
		.max(maximumLength)
		.transform((value) => (value.length === 0 ? null : value))
		.nullable();
}

const currencySchema = z
	.string()
	.trim()
	.transform((value) => value.toUpperCase())
	.pipe(z.string().regex(/^[A-Z]{3}$/u));

const dateTimeInputSchema = z.iso
	.datetime({ offset: true })
	.transform((value) => new Date(value).toISOString());

const nonEmptyPatch = <T extends Record<string, unknown>>(value: T) =>
	Object.keys(value).length > 0;

export const moneyInputSchema = z
	.object({
		minor: z.number().int().min(0).max(maximumSafeInteger),
		currency: currencySchema,
	})
	.strict();

export const workspaceCreateInputSchema = z
	.object({
		name: requiredTrimmedText(120),
	})
	.strict();

export const workspaceUpdateInputSchema = workspaceCreateInputSchema
	.partial()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

export const collectionCreateInputSchema = z
	.object({
		name: requiredTrimmedText(120),
		description: nullableTrimmedText(2_000).optional(),
	})
	.strict();

export const collectionUpdateInputSchema = collectionCreateInputSchema
	.partial()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

export const itemCreateInputSchema = z
	.object({
		title: requiredTrimmedText(200),
		description: nullableTrimmedText(4_000).optional(),
		priority: z.enum(itemPriorities).optional(),
		quantityNeeded: z
			.number()
			.int()
			.min(1)
			.max(maximumSafeInteger)
			.optional(),
		groupLabel: nullableTrimmedText(80).optional(),
		budget: moneyInputSchema.nullable().optional(),
		deadlineAt: dateTimeInputSchema.nullable().optional(),
	})
	.strict();

export const itemUpdateInputSchema = itemCreateInputSchema
	.omit({ title: true })
	.extend({ title: requiredTrimmedText(200).optional() })
	.partial()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

const booleanQuerySchema = z
	.enum(["true", "false"])
	.transform((value) => value === "true");

const integerQuerySchema = (minimum: number, maximum: number) =>
	z
		.string()
		.regex(/^\d+$/u)
		.transform(Number)
		.pipe(z.number().int().min(minimum).max(maximum));

export const archiveListQuerySchema = z
	.object({
		includeArchived: booleanQuerySchema.optional(),
	})
	.strict();

export const itemListQuerySchema = z
	.object({
		includeArchived: booleanQuerySchema.optional(),
		status: z.enum(itemStatuses).optional(),
		groupLabel: requiredTrimmedText(80).optional(),
		limit: integerQuerySchema(1, 100).optional(),
		offset: integerQuerySchema(0, 10_000).optional(),
	})
	.strict();

const timestampFields = {
	archivedAt: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
} as const;

export const workspaceResourceSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		...timestampFields,
	})
	.strict();

export const workspaceSummarySchema = z
	.object({
		id: z.string(),
		name: z.string(),
		archivedAt: z.iso.datetime().nullable(),
		accessScope: z.enum(["workspace", "collections"]),
	})
	.strict();

export const collectionResourceSchema = z
	.object({
		id: z.string(),
		workspaceId: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		...timestampFields,
	})
	.strict();

export const itemResourceSchema = z
	.object({
		id: z.string(),
		workspaceId: z.string(),
		collectionId: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		priority: z.enum(itemPriorities),
		status: z.enum(itemStatuses),
		quantityNeeded: z.number().int().positive(),
		groupLabel: z.string().nullable(),
		budget: moneyInputSchema.nullable(),
		deadlineAt: z.iso.datetime().nullable(),
		...timestampFields,
	})
	.strict();

export const workspaceResponseSchema = z
	.object({ workspace: workspaceResourceSchema })
	.strict();
export const workspaceListResponseSchema = z
	.object({ workspaces: z.array(workspaceSummarySchema) })
	.strict();
export const collectionResponseSchema = z
	.object({ collection: collectionResourceSchema })
	.strict();
export const collectionListResponseSchema = z
	.object({ collections: z.array(collectionResourceSchema) })
	.strict();
export const itemResponseSchema = z
	.object({ item: itemResourceSchema })
	.strict();
export const itemListResponseSchema = z
	.object({
		items: z.array(itemResourceSchema),
		page: z
			.object({
				limit: z.number().int().min(1).max(100),
				offset: z.number().int().min(0),
				hasMore: z.boolean(),
			})
			.strict(),
	})
	.strict();

export const apiErrorCodes = [
	"BAD_REQUEST",
	"CONFLICT",
	"FORBIDDEN",
	"INVITATION_EMAIL_MISMATCH",
	"INVITATION_EXPIRED",
	"INVITATION_INVALID",
	"INVITATION_REVOKED",
	"INTERNAL_ERROR",
	"NOT_FOUND",
	"RATE_LIMITED",
	"RESOURCE_ARCHIVED",
	"UNAUTHENTICATED",
] as const;

export const apiErrorResponseSchema = z
	.object({
		error: z
			.object({
				code: z.enum(apiErrorCodes),
				message: z.string(),
			})
			.strict(),
	})
	.strict();

export type MoneyInput = z.infer<typeof moneyInputSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateInputSchema>;
export type CollectionCreateInput = z.infer<typeof collectionCreateInputSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateInputSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateInputSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateInputSchema>;
export type ArchiveListQuery = z.infer<typeof archiveListQuerySchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type WorkspaceResource = z.infer<typeof workspaceResourceSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type CollectionResource = z.infer<typeof collectionResourceSchema>;
export type ItemResource = z.infer<typeof itemResourceSchema>;
export type ApiErrorCode = (typeof apiErrorCodes)[number];
