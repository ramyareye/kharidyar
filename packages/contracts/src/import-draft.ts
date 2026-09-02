import { z } from "zod";

import {
	merchantInputSchema,
	offerFactsResourceSchema,
	productInputSchema,
} from "./commerce";

const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const positiveQuantity = z.number().int().min(1).max(maximumSafeInteger);
const minorAmount = z.number().int().min(0).max(maximumSafeInteger);
const requiredText = (maximumLength: number) =>
	z.string().trim().min(1).max(maximumLength);
const nullableText = (maximumLength: number) =>
	z.string().trim().min(1).max(maximumLength).nullable();
const currency = z.string().regex(/^[A-Z]{3}$/u);
const httpsUrl = z
	.string()
	.trim()
	.max(2_048)
	.pipe(z.url({ protocol: /^https$/u }));

export const importFormats = ["markdown", "json"] as const;
export const importDraftStatuses = ["draft", "applied", "discarded"] as const;
export const importValueOrigins = ["source", "inferred", "reviewed"] as const;
export const importSourceKinds = [
	"product",
	"category",
	"search",
	"listing",
	"unknown",
] as const;
export const importWarningCodes = [
	"future_quantity_requires_choice",
	"inferred_quantity",
	"inferred_unit_price",
	"non_product_source",
	"partial_row",
	"qualified_availability",
	"summary_total_incomplete",
	"summary_total_mismatch",
	"unknown_shipping",
	"unmapped_fact",
	"unsupported_currency",
] as const;
export const importApplicationRecordTypes = [
	"item",
	"product",
	"candidate",
	"merchant",
	"offer",
	"price_check",
] as const;

export const importMoneySchema = z
	.object({ minor: minorAmount, currency })
	.strict();

export const importSourceSchema = z
	.object({
		url: httpsUrl,
		title: nullableText(240),
		kind: z.enum(importSourceKinds),
	})
	.strict();

export const importOfferProposalSchema = z
	.object({
		merchant: merchantInputSchema,
		sourceUrl: httpsUrl,
		locale: nullableText(35),
		facts: offerFactsResourceSchema,
		observedAt: z.iso.datetime({ offset: true }).nullable(),
	})
	.strict();

export const importProposalLineSchema = z
	.object({
		key: requiredText(80).regex(/^[a-z0-9][a-z0-9_-]*$/u),
		groupLabel: nullableText(80),
		item: z
			.object({
				title: requiredText(200),
				description: nullableText(4_000),
				requirements: nullableText(4_000),
				quantityNeeded: positiveQuantity,
				quantityOrigin: z.enum(importValueOrigins),
			})
			.strict(),
		futureQuantity: z
			.object({
				quantity: positiveQuantity,
				note: requiredText(500),
			})
			.strict()
			.nullable(),
		product: productInputSchema,
		candidate: z
			.object({
				plannedPurchaseQuantity: positiveQuantity,
				quantityOrigin: z.enum(importValueOrigins),
				notes: nullableText(4_000),
			})
			.strict(),
		source: importSourceSchema.nullable(),
		offer: importOfferProposalSchema.nullable(),
		suppliedLineTotal: importMoneySchema.nullable(),
		exclusions: z.array(requiredText(500)).max(20),
		unmappedFacts: z.array(requiredText(1_000)).max(30),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.offer !== null && value.source?.kind !== "product") {
			context.addIssue({
				code: "custom",
				message: "Only a direct Product source can become an Offer.",
				path: ["offer"],
			});
		}
		if (value.offer !== null && value.offer.sourceUrl !== value.source?.url) {
			context.addIssue({
				code: "custom",
				message: "Offer and source URLs must match.",
				path: ["offer", "sourceUrl"],
			});
		}
	});

export const importProposalSchema = z
	.object({
		schemaVersion: z.literal("1"),
		lines: z.array(importProposalLineSchema).max(100),
		summaryTotals: z
			.array(
				z
					.object({
						key: requiredText(80).regex(/^[a-z0-9][a-z0-9_-]*$/u),
						groupLabel: nullableText(80),
						label: requiredText(240),
						amount: importMoneySchema,
					})
					.strict(),
			)
			.max(30),
		exclusions: z.array(requiredText(1_000)).max(50),
		unmappedFacts: z.array(requiredText(1_000)).max(100),
	})
	.strict()
	.superRefine((value, context) => {
		const keys = [
			...value.lines.map(({ key }) => key),
			...value.summaryTotals.map(({ key }) => key),
		];
		if (new Set(keys).size !== keys.length) {
			context.addIssue({
				code: "custom",
				message: "Import proposal keys must be unique.",
				path: ["lines"],
			});
		}
	});

export const importDraftCreateInputSchema = z
	.object({
		format: z.enum(importFormats),
		rawInput: requiredText(100_000),
	})
	.strict();

export const importDraftCorrectionInputSchema = z
	.object({ proposal: importProposalSchema })
	.strict();

export const importWarningSchema = z
	.object({
		code: z.enum(importWarningCodes),
		severity: z.enum(["info", "warning", "error"]),
		lineKey: z.string().nullable(),
		detail: z.string().nullable(),
	})
	.strict();

export const importReconciliationSchema = z
	.object({
		summaryKey: z.string(),
		status: z.enum(["matched", "mismatch", "incomplete"]),
		supplied: importMoneySchema,
		computedMinor: minorAmount,
		differenceMinor: z
			.number()
			.int()
			.min(-maximumSafeInteger)
			.max(maximumSafeInteger),
	})
	.strict();

export const importApplicationRecordSchema = z
	.object({
		proposalKey: z.string(),
		recordType: z.enum(importApplicationRecordTypes),
		recordId: z.string(),
		action: z.enum(["created", "reused"]),
	})
	.strict();

export const importDraftPermissionsSchema = z
	.object({
		canEdit: z.boolean(),
		canApply: z.boolean(),
	})
	.strict();

export const importDraftResourceSchema = z
	.object({
		id: z.string(),
		workspaceId: z.string(),
		collectionId: z.string(),
		format: z.enum(importFormats),
		parserVersion: z.string(),
		proposal: importProposalSchema,
		warnings: z.array(importWarningSchema),
		reconciliations: z.array(importReconciliationSchema),
		status: z.enum(importDraftStatuses),
		rawInput: z.string().nullable(),
		createdByUserId: z.string(),
		appliedByUserId: z.string().nullable(),
		appliedAt: z.iso.datetime().nullable(),
		discardedByUserId: z.string().nullable(),
		discardedAt: z.iso.datetime().nullable(),
		application: z.array(importApplicationRecordSchema),
		permissions: importDraftPermissionsSchema,
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

export const importDraftListResponseSchema = z
	.object({ drafts: z.array(importDraftResourceSchema) })
	.strict();

export const importDraftResponseSchema = z
	.object({ draft: importDraftResourceSchema })
	.strict();

export type ImportFormat = (typeof importFormats)[number];
export type ImportDraftStatus = (typeof importDraftStatuses)[number];
export type ImportValueOrigin = (typeof importValueOrigins)[number];
export type ImportSourceKind = (typeof importSourceKinds)[number];
export type ImportWarningCode = (typeof importWarningCodes)[number];
export type ImportApplicationRecordType =
	(typeof importApplicationRecordTypes)[number];
export type ImportProposal = z.infer<typeof importProposalSchema>;
export type ImportProposalLine = z.infer<typeof importProposalLineSchema>;
export type ImportDraftCreateInput = z.infer<
	typeof importDraftCreateInputSchema
>;
export type ImportDraftCorrectionInput = z.infer<
	typeof importDraftCorrectionInputSchema
>;
export type ImportWarning = z.infer<typeof importWarningSchema>;
export type ImportReconciliation = z.infer<typeof importReconciliationSchema>;
export type ImportApplicationRecord = z.infer<
	typeof importApplicationRecordSchema
>;
export type ImportDraftResource = z.infer<typeof importDraftResourceSchema>;
