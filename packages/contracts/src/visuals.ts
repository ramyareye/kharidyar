import { z } from "zod";
import { productAttributeSchema } from "./commerce";

export const visualIdentifier = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9_-]+$/);
export const visualSelectionSchema = z
	.object({
		baseImageId: visualIdentifier.nullable(),
		floorPlanId: visualIdentifier.nullable(),
		referenceImageIds: z.array(visualIdentifier).max(3),
		candidates: z
			.array(
				z
					.object({ itemId: visualIdentifier, candidateId: visualIdentifier })
					.strict(),
			)
			.max(5),
		prompt: z.string().trim().min(1).max(6000),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (!value.baseImageId && !value.floorPlanId)
			ctx.addIssue({
				code: "custom",
				message: "Select a base photo or drawing.",
				path: ["baseImageId"],
			});
		if (
			!value.baseImageId &&
			(value.referenceImageIds.length || value.candidates.length)
		)
			ctx.addIssue({
				code: "custom",
				message: "References and products require a space base photo.",
				path: ["baseImageId"],
			});
		if (
			new Set(value.referenceImageIds).size !== value.referenceImageIds.length
		)
			ctx.addIssue({
				code: "custom",
				message: "Select each reference once.",
				path: ["referenceImageIds"],
			});
		if (
			new Set(value.candidates.map((v) => v.candidateId)).size !==
			value.candidates.length
		)
			ctx.addIssue({
				code: "custom",
				message: "Select each candidate once.",
				path: ["candidates"],
			});
	});

// ChatGPT requires all four properties to be declared, and only these two required.
export const chatgptFileSchema = z
	.object({
		download_url: z.string().min(1).max(8192),
		file_id: z.string().min(1).max(256),
		mime_type: z.string().max(100).optional(),
		file_name: z.string().max(255).optional(),
	})
	.strict();

export const visualImportSchema = z
	.object({
		runId: visualIdentifier,
		operationId: z
			.string()
			.min(8)
			.max(100)
			.regex(/^[A-Za-z0-9_-]+$/),
		file: chatgptFileSchema,
		reportedModel: z.string().trim().min(1).max(100).nullable(),
		caption: z.string().trim().min(1).max(500),
	})
	.strict();

export const visualProvenanceSchema = z
	.object({
		runId: visualIdentifier,
		provider: z.literal("chatgpt"),
		reportedModel: z.string().nullable(),
		prompt: z.string(),
		baseImageId: visualIdentifier,
		sourceLabels: z.array(z.string()),
	})
	.strict();

export const visualSourceResultSchema = z.object({
	id: visualIdentifier,
	kind: z.enum(["floor_plan", "concept_image"]),
	label: z.string(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	bytes: z.number().int().positive(),
}).strict();

export const visualRunResultSchema = z.object({
	id: visualIdentifier,
	collectionId: visualIdentifier,
	provider: z.literal("chatgpt"),
	status: z.enum(["ready", "importing", "completed", "failed", "cancelled"]),
	expiresAt: z.iso.datetime(),
	prompt: z.string().nullable(),
	sources: z.array(visualSourceResultSchema),
	selectedProducts: z.array(z.object({
		itemId: visualIdentifier,
		candidateId: visualIdentifier,
		productId: visualIdentifier,
		title: z.string(),
		attributes: z.array(productAttributeSchema),
	}).strict()),
	outputImageId: visualIdentifier.nullable(),
	outputContentUrl: z.string().nullable(),
	reportedModel: z.string().nullable(),
	errorCode: z.string().nullable(),
	notice: z.string(),
}).strict();

// Image bytes stay in the MCP image content block, not duplicated in JSON.
export const visualImageResultSchema = z.object({
	runId: visualIdentifier,
	source: visualSourceResultSchema,
	mimeType: z.literal("image/webp"),
	byteSize: z.number().int().positive().max(2 * 1024 * 1024),
	maxSidePixels: z.literal(4096),
}).strict();

export const visualLimits = {
	lifetimeMs: 10 * 60_000,
	importTimeoutMs: 30_000,
	abandonedImportMs: 5 * 60_000,
	maxTransferBytes: 2 * 1024 * 1024,
	maxTransferSide: 4096,
	maxImportBytes: 10 * 1024 * 1024,
} as const;
export type VisualSelection = z.infer<typeof visualSelectionSchema>;
export type VisualImport = z.infer<typeof visualImportSchema>;
