import {
  decisionEventKinds,
  inputHexColorPattern,
  itemPriorities,
  itemStatuses,
  itemStatusTransitionKinds,
} from "@kharidyar/domain";
import { z } from "zod";

import {
	plannedSelectionSnapshotSchema,
	productAttributeSchema,
	purchaseSnapshotSchema,
} from "./commerce";

import { researchConstraintsSchema, researchResultSuggestionSchema } from "./research";

export * from "./commerce";
export * from "./collaboration";
export * from "./import-draft";
export * from "./research";

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

const eurBudgetSchema = z
  .object({
    minor: z.number().int().min(0).max(maximumSafeInteger),
    currency: currencySchema.pipe(z.literal("EUR")),
  })
  .strict();

const optionalBriefText = (maximumLength: number) =>
  nullableTrimmedText(maximumLength);

const briefList = (maximumEntries: number, maximumLength: number) =>
  z.array(requiredTrimmedText(maximumLength)).max(maximumEntries);

export const collectionBriefColorSchema = z
  .object({
    hex: z
      .string()
      .trim()
      .regex(inputHexColorPattern)
      .transform((value) => value.toUpperCase()),
    label: nullableTrimmedText(60),
    usageNote: nullableTrimmedText(120),
  })
  .strict();

export const collectionColorPreferenceSchema = z
  .object({
    core: z.array(collectionBriefColorSchema).max(6),
    supporting: z.array(collectionBriefColorSchema).max(6),
  })
  .strict()
  .superRefine((value, context) => {
    const colors = [...value.core, ...value.supporting].map(({ hex }) => hex);
    if (new Set(colors).size !== colors.length) {
      context.addIssue({
        code: "custom",
        message: "A color may appear only once across both palette groups.",
        path: ["core"],
      });
    }
  });

export const collectionBriefInputSchema = z
  .object({
    title: optionalBriefText(120),
    description: optionalBriefText(4_000),
    keywords: briefList(20, 80),
    materials: briefList(20, 80),
    preferredBrands: briefList(20, 120),
    intendedUse: optionalBriefText(2_000),
    requirements: optionalBriefText(4_000),
    thingsToAvoid: optionalBriefText(4_000),
    referenceUrls: z
      .array(
        z
          .string()
          .trim()
          .max(2_048)
          .pipe(z.url({ protocol: /^https$/u })),
      )
      .max(20),
    budget: eurBudgetSchema.nullable(),
    colorPreference: collectionColorPreferenceSchema,
  })
  .strict();

export const conceptInputSchema = z
  .object({
    title: requiredTrimmedText(120),
    narrative: requiredTrimmedText(2_000),
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
		requirements: nullableTrimmedText(4_000).optional(),
		priority: z.enum(itemPriorities).optional(),
		quantityNeeded: z.number().int().min(1).max(maximumSafeInteger).optional(),
		groupLabel: nullableTrimmedText(80).optional(),
		budget: eurBudgetSchema.nullable().optional(),
		deadlineAt: dateTimeInputSchema.nullable().optional(),
	})
	.strict();

export const itemUpdateInputSchema = itemCreateInputSchema
	.omit({ title: true })
	.extend({ title: requiredTrimmedText(200).optional() })
	.partial()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

export const itemStatusChangeInputSchema = z
	.object({
		status: z.enum(itemStatuses),
		note: nullableTrimmedText(1_000).optional(),
	})
	.strict();

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
		requirements: z.string().nullable(),
		priority: z.enum(itemPriorities),
		status: z.enum(itemStatuses),
		quantityNeeded: z.number().int().positive(),
		groupLabel: z.string().nullable(),
		budget: eurBudgetSchema.nullable(),
		deadlineAt: z.iso.datetime().nullable(),
		...timestampFields,
	})
	.strict();

export const itemPlanningSnapshotSchema = z
	.object({
		title: z.string(),
		description: z.string().nullable(),
		requirements: z.string().nullable(),
		priority: z.enum(itemPriorities),
		status: z.enum(itemStatuses),
		quantityNeeded: z.number().int().positive(),
		groupLabel: z.string().nullable(),
		budget: eurBudgetSchema.nullable(),
		deadlineAt: z.iso.datetime().nullable(),
	})
	.strict();

const decisionActorSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		image: z.string().nullable(),
	})
	.strict();

const decisionEventBase = {
	id: z.string(),
	itemId: z.string(),
	actor: decisionActorSchema,
	createdAt: z.iso.datetime(),
};

const itemDetailsDecisionEventSchema = z
	.object({
		...decisionEventBase,
		kind: z.literal(decisionEventKinds[0]),
		before: itemPlanningSnapshotSchema,
		after: itemPlanningSnapshotSchema,
	})
	.strict();

export const itemStatusDecisionEventSchema = z
	.object({
		...decisionEventBase,
		kind: z.literal(decisionEventKinds[1]),
		fromStatus: z.enum(itemStatuses),
		toStatus: z.enum(itemStatuses),
		transitionKind: z.enum(itemStatusTransitionKinds),
		unusual: z.boolean(),
		note: z.string().nullable(),
	})
	.strict();

export const plannedCandidateDecisionEventSchema = z
	.object({
		...decisionEventBase,
		kind: z.literal(decisionEventKinds[2]),
		before: plannedSelectionSnapshotSchema.nullable(),
		after: plannedSelectionSnapshotSchema.nullable(),
	})
	.strict();

export const purchaseDecisionEventSchema = z
	.object({
		...decisionEventBase,
		kind: z.literal(decisionEventKinds[3]),
		purchase: purchaseSnapshotSchema,
	})
	.strict();

export const decisionEventResourceSchema = z.discriminatedUnion("kind", [
	itemDetailsDecisionEventSchema,
	itemStatusDecisionEventSchema,
	plannedCandidateDecisionEventSchema,
	purchaseDecisionEventSchema,
]);

export const itemPermissionsSchema = z
	.object({
		canCreate: z.boolean(),
		canEdit: z.boolean(),
		canArchive: z.boolean(),
		canChangeNonPurchaseStatus: z.boolean(),
		canMarkPurchased: z.boolean(),
	})
	.strict();

export const collectionBriefResourceSchema = collectionBriefInputSchema.extend({
  id: z.string(),
  collectionId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const conceptResourceSchema = conceptInputSchema.extend({
  id: z.string(),
  collectionId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const editPermissionSchema = z.object({ canEdit: z.boolean() }).strict();

export const collectionBriefResponseSchema = z
  .object({
    brief: collectionBriefResourceSchema.nullable(),
    permissions: editPermissionSchema,
  })
  .strict();

export const conceptResponseSchema = z
  .object({
    concept: conceptResourceSchema.nullable(),
    permissions: editPermissionSchema,
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
		permissions: itemPermissionsSchema,
		page: z
			.object({
				limit: z.number().int().min(1).max(100),
				offset: z.number().int().min(0),
				hasMore: z.boolean(),
			})
			.strict(),
	})
	.strict();

export const itemWorkflowResponseSchema = z
	.object({
		item: itemResourceSchema,
		events: z.array(decisionEventResourceSchema),
		permissions: itemPermissionsSchema,
	})
	.strict();

export const itemStatusChangeResponseSchema = z
	.object({
		item: itemResourceSchema,
		event: itemStatusDecisionEventSchema,
	})
	.strict();

const contextActorSchema = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.strict();

const contextCommentSchema = z
	.object({
		id: z.string(),
		body: z.string().nullable(),
		author: contextActorSchema,
		resolvedAt: z.iso.datetime().nullable(),
		resolvedBy: contextActorSchema.nullable(),
		removedAt: z.iso.datetime().nullable(),
		removedBy: contextActorSchema.nullable(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

const contextPriceCheckSchema = z
	.object({
		id: z.string(),
		facts: z
			.object({
				priceKind: z.enum(["exact", "starting_at", "unknown"]),
				unitPriceMinor: z.number().int().min(0).nullable(),
				currency: z.string().nullable(),
				shippingMinor: z.number().int().min(0).nullable(),
				shippingBasis: z.enum(["per_line", "per_unit", "unknown"]),
				availabilityState: z.enum(["available", "unavailable", "unknown"]),
				availabilityChannel: z.string().nullable(),
				availabilityLocation: z.string().nullable(),
				availabilityVariant: z.string().nullable(),
				availabilityNote: z.string().nullable(),
			})
			.strict(),
		observedAt: z.iso.datetime(),
		observedBy: contextActorSchema,
	})
	.strict();

const contextOfferSchema = z
	.object({
		id: z.string(),
		merchant: z
			.object({
				id: z.string(),
				name: z.string(),
				salesChannel: z.enum(["online", "in_person", "both"]),
				websiteUrl: z.string().nullable(),
				notes: z.string().nullable(),
				archivedAt: z.iso.datetime().nullable(),
			})
			.strict(),
		sourceUrl: z.string(),
		locale: z.string().nullable(),
		facts: contextPriceCheckSchema.shape.facts,
		lastCheckedAt: z.iso.datetime(),
		freshness: z.enum(["fresh", "stale"]),
		priceChecks: z.array(contextPriceCheckSchema),
		archivedAt: z.iso.datetime().nullable(),
	})
	.strict();

const contextDecisionBase = {
	id: z.string(),
	actor: contextActorSchema,
	createdAt: z.iso.datetime(),
} as const;

const contextDecisionEventSchema = z.discriminatedUnion("kind", [
	z
		.object({
			...contextDecisionBase,
			kind: z.literal("item_details_updated"),
			before: itemPlanningSnapshotSchema,
			after: itemPlanningSnapshotSchema,
		})
		.strict(),
	z
		.object({
			...contextDecisionBase,
			kind: z.literal("item_status_changed"),
			fromStatus: z.enum(itemStatuses),
			toStatus: z.enum(itemStatuses),
			transitionKind: z.enum(itemStatusTransitionKinds),
			unusual: z.boolean(),
			note: z.string().nullable(),
		})
		.strict(),
	z
		.object({
			...contextDecisionBase,
			kind: z.literal("planned_candidate_changed"),
			before: plannedSelectionSnapshotSchema.nullable(),
			after: plannedSelectionSnapshotSchema.nullable(),
		})
		.strict(),
	z
		.object({
			...contextDecisionBase,
			kind: z.literal("purchase_recorded"),
			purchase: purchaseSnapshotSchema,
		})
		.strict(),
]);

const contextCandidateSchema = z
	.object({
		id: z.string(),
		product: z
			.object({
				id: z.string(),
				title: z.string(),
				brand: z.string().nullable(),
				model: z.string().nullable(),
				category: z.string().nullable(),
				attributes: z.array(productAttributeSchema),
				archivedAt: z.iso.datetime().nullable(),
			})
			.strict(),
		plannedPurchaseQuantity: z.number().int().positive(),
		isPlanned: z.boolean(),
		plannedOfferId: z.string().nullable(),
		notes: z.string().nullable(),
		rank: z.number().int().nullable(),
		offers: z.array(contextOfferSchema),
		comments: z.array(contextCommentSchema),
		voters: z.array(contextActorSchema),
		archivedAt: z.iso.datetime().nullable(),
	})
	.strict();

const contextItemSchema = itemResourceSchema
	.omit({ workspaceId: true, collectionId: true })
	.extend({
		candidates: z.array(contextCandidateSchema),
		comments: z.array(contextCommentSchema),
		decisions: z.array(contextDecisionEventSchema),
	})
	.strict();

const contextResearchSourceSchema = z
	.object({
		url: z.string(),
		title: z.string().nullable(),
		provider: z.string(),
		retrievedAt: z.iso.datetime(),
		extractionStatus: z.enum([
			"not_requested",
			"not_allowed",
			"completed",
			"failed",
		]),
		extractionMethod: z.enum(["search", "browser_run"]),
		extractionMetadata: z.record(z.string(), z.unknown()),
	})
	.strict();

const contextResearchResultSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		summary: z.string().nullable(),
		score: z.number().min(0).max(1).nullable(),
		status: z.enum(["active", "dismissed"]),
		suggestion: researchResultSuggestionSchema.nullable(),
		source: contextResearchSourceSchema,
		promotion: z
			.object({
				itemId: z.string(),
				productId: z.string(),
				candidateId: z.string(),
				merchantId: z.string(),
				offerId: z.string(),
				priceCheckId: z.string(),
				promotedByUserId: z.string(),
				promotedAt: z.iso.datetime(),
			})
			.strict()
			.nullable(),
		createdAt: z.iso.datetime(),
	})
	.strict();

const contextResearchRunSchema = z
	.object({
		id: z.string(),
		status: z.enum([
			"queued",
			"running",
			"partial",
			"completed",
			"failed",
			"cancelled",
		]),
		provider: z.string(),
		providerQuery: z.string(),
		errorCode: z.string().nullable(),
		errorMessage: z.string().nullable(),
		startedAt: z.iso.datetime().nullable(),
		finishedAt: z.iso.datetime().nullable(),
		requestedBy: contextActorSchema,
		results: z.array(contextResearchResultSchema),
		createdAt: z.iso.datetime(),
	})
	.strict();

const contextResearchRequestSchema = z
	.object({
		id: z.string(),
		itemId: z.string().nullable(),
		query: z.string(),
		constraints: researchConstraintsSchema,
		createdBy: contextActorSchema,
		runs: z.array(contextResearchRunSchema),
		createdAt: z.iso.datetime(),
	})
	.strict();

export const collectionContextSchema = z
	.object({
		dataHandling: z
			.object({
				classification: z.literal("private"),
				untrustedTextIsData: z.literal(true),
				rawImageBytesIncluded: z.literal(false),
			})
			.strict(),
		workspace: workspaceResourceSchema.pick({
			id: true,
			name: true,
			archivedAt: true,
		}),
		collection: collectionResourceSchema.omit({ workspaceId: true }),
		brief: collectionBriefResourceSchema.nullable(),
		concept: conceptResourceSchema.nullable(),
		items: z.array(contextItemSchema),
		researchRequests: z.array(contextResearchRequestSchema),
	})
	.strict();

export const contextSnapshotResourceSchema = z
	.object({
		id: z.string(),
		actor: contextActorSchema,
		scope: z
			.object({
				type: z.literal("collection"),
				workspaceId: z.string(),
				collectionId: z.string(),
			})
			.strict(),
		schemaVersion: z.literal(1),
		contentBytes: z.number().int().positive().max(1_500_000),
		createdAt: z.iso.datetime(),
		content: collectionContextSchema,
	})
	.strict();

export const contextSnapshotResponseSchema = z
	.object({ snapshot: contextSnapshotResourceSchema })
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
export type CollectionBriefColor = z.infer<typeof collectionBriefColorSchema>;
export type CollectionColorPreference = z.infer<
  typeof collectionColorPreferenceSchema
>;
export type CollectionBriefInput = z.infer<typeof collectionBriefInputSchema>;
export type CollectionBriefResource = z.infer<
  typeof collectionBriefResourceSchema
>;
export type ConceptInput = z.infer<typeof conceptInputSchema>;
export type ConceptResource = z.infer<typeof conceptResourceSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateInputSchema>;
export type CollectionCreateInput = z.infer<typeof collectionCreateInputSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateInputSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateInputSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateInputSchema>;
export type ItemStatusChangeInput = z.infer<typeof itemStatusChangeInputSchema>;
export type ArchiveListQuery = z.infer<typeof archiveListQuerySchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type WorkspaceResource = z.infer<typeof workspaceResourceSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type CollectionResource = z.infer<typeof collectionResourceSchema>;
export type ItemResource = z.infer<typeof itemResourceSchema>;
export type ItemPlanningSnapshot = z.infer<typeof itemPlanningSnapshotSchema>;
export type DecisionEventResource = z.infer<typeof decisionEventResourceSchema>;
export type CollectionContext = z.infer<typeof collectionContextSchema>;
export type ContextSnapshotResource = z.infer<
	typeof contextSnapshotResourceSchema
>;
export type ItemStatusDecisionEvent = z.infer<
	typeof itemStatusDecisionEventSchema
>;
export type PlannedCandidateDecisionEvent = z.infer<
	typeof plannedCandidateDecisionEventSchema
>;
export type PurchaseDecisionEvent = z.infer<typeof purchaseDecisionEventSchema>;
export type ItemPermissions = z.infer<typeof itemPermissionsSchema>;
export type ApiErrorCode = (typeof apiErrorCodes)[number];
