import {
  researchExtractionStatuses,
  researchResultStatuses,
  researchRunStatuses,
} from "@kharidyar/domain";
import { z } from "zod";

import {
  merchantInputSchema,
  offerFactsResourceSchema,
  productInputSchema,
} from "./commerce";

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
const positiveQuantity = z.number().int().min(1).max(maximumSafeInteger);
const minorAmount = z.number().int().min(0).max(maximumSafeInteger);
const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,
  );

export const researchConstraintsSchema = z
  .object({
    maxUnitPriceMinor: minorAmount.nullable(),
    currency: z.literal("EUR"),
    preferredDomains: z.array(domainName).max(10),
    requiredTerms: z.array(requiredText(80)).max(10),
    excludedTerms: z.array(requiredText(80)).max(10),
  })
  .strict();

export const researchRequestCreateInputSchema = z
  .object({
    query: requiredText(1_000),
    itemId: z.string().trim().min(1).nullable(),
    constraints: researchConstraintsSchema,
  })
  .strict();

export const researchResultSuggestionSchema = z
  .object({
    product: productInputSchema,
    merchant: merchantInputSchema,
    offer: z
      .object({
        facts: offerFactsResourceSchema,
        locale: nullableText(35),
      })
      .strict(),
  })
  .strict();

export const researchResultPromotionInputSchema = z
  .object({
    confirmedDirectProductUrl: z.literal(true),
    itemId: z.string().trim().min(1),
    plannedPurchaseQuantity: positiveQuantity,
    candidateNotes: nullableText(4_000),
    product: productInputSchema,
    merchant: merchantInputSchema,
    offer: z
      .object({
        facts: offerFactsResourceSchema,
        locale: nullableText(35),
      })
      .strict(),
  })
  .strict();

export const researchResultModerationInputSchema = z
  .object({ dismissed: z.boolean() })
  .strict();

export const researchPromotionResourceSchema = z
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
  .strict();

export const researchSourceResourceSchema = z
  .object({
    id: z.string(),
    url: z.string().url(),
    title: z.string().nullable(),
    provider: z.string(),
    retrievedAt: z.iso.datetime(),
    extractionStatus: z.enum(researchExtractionStatuses),
    extractionMethod: z.enum(["search", "browser_run"]),
    extractionMetadata: z.record(z.string(), z.unknown()),
    snapshotAvailable: z.boolean(),
    snapshotExpiresAt: z.iso.datetime(),
  })
  .strict();

export const researchResultResourceSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    score: z.number().min(0).max(1).nullable(),
    status: z.enum(researchResultStatuses),
    suggestion: researchResultSuggestionSchema.nullable(),
    source: researchSourceResourceSchema,
    promotion: researchPromotionResourceSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

const actorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  })
  .strict();

export const researchRunResourceSchema = z
  .object({
    id: z.string(),
    status: z.enum(researchRunStatuses),
    provider: z.literal("tavily-basic-v1"),
    workflowInstanceId: z.string(),
    providerQuery: z.string(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    requestedBy: actorSchema,
    results: z.array(researchResultResourceSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const researchRequestResourceSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    collectionId: z.string(),
    itemId: z.string().nullable(),
    query: z.string(),
    constraints: researchConstraintsSchema,
    createdBy: actorSchema,
    runs: z.array(researchRunResourceSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const researchPermissionsSchema = z
  .object({
    canCreate: z.boolean(),
    canCancel: z.boolean(),
    canPromote: z.boolean(),
    canModerate: z.boolean(),
  })
  .strict();

export const researchDeskResponseSchema = z
  .object({
    requests: z.array(researchRequestResourceSchema),
    permissions: researchPermissionsSchema,
  })
  .strict();

export const researchWorkflowParamsSchema = z
  .object({
    requestId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
  })
  .strict();

export const researchProviderSearchResultSchema = z
  .object({
    title: requiredText(240),
    url: z
      .string()
      .trim()
      .max(2_048)
      .pipe(z.url({ protocol: /^https$/u })),
    content: nullableText(4_000),
    score: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const researchProviderSearchOutputSchema = z
  .object({
    providerRequestId: z.string().nullable(),
    results: z.array(researchProviderSearchResultSchema).max(5),
  })
  .strict();

export type ResearchConstraints = z.infer<typeof researchConstraintsSchema>;
export type ResearchRequestCreateInput = z.infer<
  typeof researchRequestCreateInputSchema
>;
export type ResearchResultSuggestion = z.infer<
  typeof researchResultSuggestionSchema
>;
export type ResearchResultPromotionInput = z.infer<
  typeof researchResultPromotionInputSchema
>;
export type ResearchDeskResponse = z.infer<typeof researchDeskResponseSchema>;
export type ResearchRequestResource = z.infer<
  typeof researchRequestResourceSchema
>;
export type ResearchRunResource = z.infer<typeof researchRunResourceSchema>;
export type ResearchResultResource = z.infer<
  typeof researchResultResourceSchema
>;
export type ResearchProviderSearchOutput = z.infer<
  typeof researchProviderSearchOutputSchema
>;
export type ResearchWorkflowParams = z.infer<
  typeof researchWorkflowParamsSchema
>;
