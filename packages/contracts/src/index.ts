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
	purchaseSnapshotSchema,
} from "./commerce";

export * from "./commerce";
export * from "./collaboration";

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
export type ItemStatusDecisionEvent = z.infer<
	typeof itemStatusDecisionEventSchema
>;
export type PlannedCandidateDecisionEvent = z.infer<
	typeof plannedCandidateDecisionEventSchema
>;
export type PurchaseDecisionEvent = z.infer<typeof purchaseDecisionEventSchema>;
export type ItemPermissions = z.infer<typeof itemPermissionsSchema>;
export type ApiErrorCode = (typeof apiErrorCodes)[number];
