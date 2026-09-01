import {
	availabilityStates,
	merchantSalesChannels,
	offerPriceKinds,
	shippingBases,
} from "@kharidyar/domain";
import { z } from "zod";

const maximumSafeInteger = Number.MAX_SAFE_INTEGER;

const requiredText = (maximumLength: number) =>
	z.string().trim().min(1).max(maximumLength);

const nullableText = (maximumLength: number) =>
	z
		.string()
		.trim()
		.max(maximumLength)
		.transform((value) => (value.length === 0 ? null : value))
		.nullable();

const nullableCurrency = z
	.string()
	.trim()
	.transform((value) => value.toUpperCase())
	.pipe(z.string().regex(/^[A-Z]{3}$/u))
	.nullable();

const httpsUrl = z
	.string()
	.trim()
	.max(2_048)
	.pipe(z.url({ protocol: /^https$/u }));

const nullableHttpsUrl = z
	.union([httpsUrl, z.literal("")])
	.transform((value) => (value === "" ? null : value))
	.nullable();

const nonNegativeMinor = z
	.number()
	.int()
	.min(0)
	.max(maximumSafeInteger);

const positiveQuantity = z
	.number()
	.int()
	.min(1)
	.max(maximumSafeInteger);

const nullableRank = z.number().int().min(0).max(1_000).nullable();

const timestampFields = {
	archivedAt: z.iso.datetime().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
} as const;

const nonEmptyPatch = <T extends Record<string, unknown>>(value: T) =>
	Object.keys(value).length > 0;

export const productAttributeSchema = z
	.object({
		label: requiredText(80),
		value: requiredText(240),
	})
	.strict();

export const productInputSchema = z
	.object({
		title: requiredText(240),
		brand: nullableText(160),
		model: nullableText(160),
		category: nullableText(120),
		attributes: z.array(productAttributeSchema).max(30),
	})
	.strict();

export const productUpdateInputSchema = productInputSchema
	.partial()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

export const merchantInputSchema = z
	.object({
		name: requiredText(160),
		salesChannel: z.enum(merchantSalesChannels),
		websiteUrl: nullableHttpsUrl,
		notes: nullableText(2_000),
	})
	.strict();

const offerFactsSchema = z
	.object({
		priceKind: z.enum(offerPriceKinds),
		unitPriceMinor: nonNegativeMinor.nullable(),
		currency: nullableCurrency,
		shippingMinor: nonNegativeMinor.nullable(),
		shippingBasis: z.enum(shippingBases),
		availabilityState: z.enum(availabilityStates),
		availabilityChannel: nullableText(80),
		availabilityLocation: nullableText(160),
		availabilityVariant: nullableText(160),
		availabilityNote: nullableText(1_000),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.priceKind === "unknown" && value.unitPriceMinor !== null) {
			context.addIssue({
				code: "custom",
				message: "An unknown price cannot include a unit price.",
				path: ["unitPriceMinor"],
			});
		}
		if (
			value.priceKind !== "unknown" &&
			(value.unitPriceMinor === null || value.currency === null)
		) {
			context.addIssue({
				code: "custom",
				message: "An exact or starting price requires an amount and currency.",
				path: ["unitPriceMinor"],
			});
		}
		if (value.shippingMinor !== null && value.currency === null) {
			context.addIssue({
				code: "custom",
				message: "Shipping requires a currency.",
				path: ["shippingMinor"],
			});
		}
	});

export const offerInputSchema = z
	.object({
		merchantId: z.string().trim().min(1),
		sourceUrl: httpsUrl,
		locale: nullableText(35),
		facts: offerFactsSchema,
		observedAt: z.iso.datetime({ offset: true }).optional(),
	})
	.strict();

export const priceCheckInputSchema = z
	.object({
		facts: offerFactsSchema,
		observedAt: z.iso.datetime({ offset: true }).optional(),
	})
	.strict();

const newProductChoiceSchema = z
	.object({ kind: z.literal("new"), value: productInputSchema })
	.strict();

const existingProductChoiceSchema = z
	.object({ kind: z.literal("existing"), productId: z.string().trim().min(1) })
	.strict();

export const candidateCreateInputSchema = z
	.object({
		product: z.discriminatedUnion("kind", [
			newProductChoiceSchema,
			existingProductChoiceSchema,
		]),
		plannedPurchaseQuantity: positiveQuantity,
		notes: nullableText(4_000),
		rank: nullableRank,
	})
	.strict();

export const candidateUpdateInputSchema = z
	.object({
		plannedPurchaseQuantity: positiveQuantity.optional(),
		notes: nullableText(4_000).optional(),
		rank: nullableRank.optional(),
	})
	.strict()
	.refine(nonEmptyPatch, { message: "At least one field is required." });

export const plannedSelectionInputSchema = z
	.object({
		candidateId: z.string().trim().min(1).nullable(),
		offerId: z.string().trim().min(1).nullable(),
		plannedPurchaseQuantity: positiveQuantity.nullable(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.candidateId === null) {
			if (value.offerId !== null || value.plannedPurchaseQuantity !== null) {
				context.addIssue({
					code: "custom",
					message: "Clearing a plan cannot include an Offer or quantity.",
					path: ["candidateId"],
				});
			}
			return;
		}
		if (value.plannedPurchaseQuantity === null) {
			context.addIssue({
				code: "custom",
				message: "A planned Candidate requires a purchase quantity.",
				path: ["plannedPurchaseQuantity"],
			});
		}
	});

export const purchaseRecordInputSchema = z
	.object({
		candidateId: z.string().trim().min(1),
		offerId: z.string().trim().min(1),
		purchasedQuantity: positiveQuantity,
		unitPriceMinor: nonNegativeMinor,
		currency: nullableCurrency.unwrap(),
		shippingMinor: nonNegativeMinor.nullable(),
		shippingBasis: z.enum(shippingBases),
		observedAt: z.iso.datetime({ offset: true }).optional(),
		note: nullableText(1_000),
	})
	.strict();

export const productResourceSchema = productInputSchema.extend({
	id: z.string(),
	workspaceId: z.string(),
	...timestampFields,
});

export const merchantResourceSchema = merchantInputSchema.extend({
	id: z.string(),
	workspaceId: z.string(),
	...timestampFields,
});

export const offerFactsResourceSchema = offerFactsSchema;

export const priceCheckResourceSchema = z
	.object({
		id: z.string(),
		offerId: z.string(),
		facts: offerFactsResourceSchema,
		observedAt: z.iso.datetime(),
		observedBy: z
			.object({
				id: z.string(),
				name: z.string(),
				image: z.string().nullable(),
			})
			.strict(),
		createdAt: z.iso.datetime(),
	})
	.strict();

export const offerResourceSchema = z
	.object({
		id: z.string(),
		workspaceId: z.string(),
		productId: z.string(),
		merchant: merchantResourceSchema,
		sourceUrl: z.string(),
		locale: z.string().nullable(),
		facts: offerFactsResourceSchema,
		lastCheckedAt: z.iso.datetime(),
		freshness: z.enum(["fresh", "stale"]),
		priceChecks: z.array(priceCheckResourceSchema),
		...timestampFields,
	})
	.strict();

export const plannedCostResourceSchema = z
	.object({
		status: z.enum(["exact", "lower_bound", "incomplete"]),
		currency: z.string().nullable(),
		merchandiseMinor: nonNegativeMinor.nullable(),
		shippingMinor: nonNegativeMinor.nullable(),
		totalMinor: nonNegativeMinor.nullable(),
		missing: z.array(z.enum(["unit_price", "shipping"])),
	})
	.strict();

export const plannedSelectionSnapshotSchema = z
	.object({
		candidateId: z.string(),
		productId: z.string(),
		productTitle: z.string(),
		offerId: z.string().nullable(),
		merchantName: z.string().nullable(),
		plannedPurchaseQuantity: positiveQuantity,
	})
	.strict();

export const purchaseSnapshotSchema = z
	.object({
		candidateId: z.string(),
		productId: z.string(),
		productTitle: z.string(),
		offerId: z.string(),
		merchantId: z.string(),
		merchantName: z.string(),
		sourceUrl: z.string(),
		priceCheckId: z.string(),
		purchasedQuantity: positiveQuantity,
		priceKind: z.literal("exact"),
		unitPriceMinor: nonNegativeMinor,
		currency: z.string().regex(/^[A-Z]{3}$/u),
		shippingMinor: nonNegativeMinor.nullable(),
		shippingBasis: z.enum(shippingBases),
		merchandiseTotalMinor: nonNegativeMinor,
		shippingTotalMinor: nonNegativeMinor.nullable(),
		totalMinor: nonNegativeMinor.nullable(),
		observedAt: z.iso.datetime(),
		note: z.string().nullable(),
	})
	.strict();

export const purchaseRecordResourceSchema = z
	.object({
		id: z.string(),
		actor: z
			.object({
				id: z.string(),
				name: z.string(),
				image: z.string().nullable(),
			})
			.strict(),
		purchase: purchaseSnapshotSchema,
		createdAt: z.iso.datetime(),
	})
	.strict();

export const comparisonOfferSchema = offerResourceSchema.extend({
	plannedCost: plannedCostResourceSchema,
});

export const candidateComparisonSchema = z
	.object({
		id: z.string(),
		itemId: z.string(),
		product: productResourceSchema,
		plannedPurchaseQuantity: positiveQuantity,
		isPlanned: z.boolean(),
		plannedOfferId: z.string().nullable(),
		notes: z.string().nullable(),
		rank: z.number().int().nullable(),
		purchasedQuantity: z.number().int().min(0),
		purchases: z.array(purchaseRecordResourceSchema),
		offers: z.array(comparisonOfferSchema),
		...timestampFields,
	})
	.strict();

export const commercePermissionsSchema = z
	.object({
		canManageCandidates: z.boolean(),
		canArchiveCandidates: z.boolean(),
		canManageProducts: z.boolean(),
		canManageOffers: z.boolean(),
		canRecordPurchase: z.boolean(),
		canViewWorkspaceCatalog: z.boolean(),
	})
	.strict();

export const itemComparisonResponseSchema = z
	.object({
		itemId: z.string(),
		candidates: z.array(candidateComparisonSchema),
		catalogProducts: z.array(productResourceSchema),
		merchants: z.array(merchantResourceSchema),
		permissions: commercePermissionsSchema,
	})
	.strict();

export const rollupLineSchema = z
	.object({
		itemId: z.string(),
		itemTitle: z.string(),
		groupLabel: z.string().nullable(),
		candidateId: z.string().nullable(),
		productTitle: z.string().nullable(),
		offerId: z.string().nullable(),
		merchantName: z.string().nullable(),
		plannedPurchaseQuantity: z.number().int().nullable(),
		state: z.enum(["planned", "unplanned", "incomplete", "currency_mismatch"]),
		cost: plannedCostResourceSchema.nullable(),
	})
	.strict();

export const rollupSummarySchema = z
	.object({
		status: z.enum(["exact", "lower_bound", "incomplete"]),
		currency: z.string(),
		merchandiseMinor: nonNegativeMinor,
		shippingMinor: nonNegativeMinor,
		totalMinor: nonNegativeMinor,
		completeLineCount: z.number().int().min(0),
		incompleteLineCount: z.number().int().min(0),
		currencyMismatchLineCount: z.number().int().min(0),
		unplannedLineCount: z.number().int().min(0),
	})
	.strict();

export const groupRollupSchema = z
	.object({
		groupLabel: z.string().nullable(),
		summary: rollupSummarySchema,
	})
	.strict();

export const budgetComparisonResourceSchema = z
	.object({
		status: z.enum([
			"within_budget",
			"over_budget",
			"lower_bound",
			"incomplete",
		]),
		differenceMinor: nonNegativeMinor.nullable(),
	})
	.strict();

export const collectionRollupResponseSchema = z
	.object({
		collectionId: z.string(),
		budget: z
			.object({ minor: nonNegativeMinor, currency: z.string() })
			.strict()
			.nullable(),
		summary: rollupSummarySchema,
		budgetComparison: budgetComparisonResourceSchema.nullable(),
		groups: z.array(groupRollupSchema),
		lines: z.array(rollupLineSchema),
	})
	.strict();

export type ProductAttribute = z.infer<typeof productAttributeSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
export type ProductResource = z.infer<typeof productResourceSchema>;
export type MerchantInput = z.infer<typeof merchantInputSchema>;
export type MerchantResource = z.infer<typeof merchantResourceSchema>;
export type OfferFacts = z.infer<typeof offerFactsResourceSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;
export type OfferResource = z.infer<typeof offerResourceSchema>;
export type PriceCheckInput = z.infer<typeof priceCheckInputSchema>;
export type PriceCheckResource = z.infer<typeof priceCheckResourceSchema>;
export type CandidateCreateInput = z.infer<typeof candidateCreateInputSchema>;
export type CandidateUpdateInput = z.infer<typeof candidateUpdateInputSchema>;
export type PlannedSelectionInput = z.infer<typeof plannedSelectionInputSchema>;
export type PurchaseRecordInput = z.infer<typeof purchaseRecordInputSchema>;
export type PlannedSelectionSnapshot = z.infer<
	typeof plannedSelectionSnapshotSchema
>;
export type PurchaseSnapshot = z.infer<typeof purchaseSnapshotSchema>;
export type PurchaseRecordResource = z.infer<
	typeof purchaseRecordResourceSchema
>;
export type PlannedCostResource = z.infer<typeof plannedCostResourceSchema>;
export type CandidateComparison = z.infer<typeof candidateComparisonSchema>;
export type CommercePermissions = z.infer<typeof commercePermissionsSchema>;
export type ItemComparisonResponse = z.infer<
	typeof itemComparisonResponseSchema
>;
export type RollupLine = z.infer<typeof rollupLineSchema>;
export type RollupSummary = z.infer<typeof rollupSummarySchema>;
export type CollectionRollupResponse = z.infer<
	typeof collectionRollupResponseSchema
>;
