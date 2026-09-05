import {
	conceptImageRoles,
	conceptSubjectKinds,
	uploadableConceptImageRoles,
} from "@kharidyar/domain";
import { z } from "zod";

const nullableCaptionSchema = z
	.string()
	.trim()
	.max(500)
	.transform((value) => (value.length === 0 ? null : value))
	.nullable();

export const conceptImageRoleSchema = z.enum(conceptImageRoles);
export const conceptSubjectKindSchema = z.enum(conceptSubjectKinds);

export const conceptImageUploadMetadataSchema = z
	.object({
		caption: nullableCaptionSchema,
		containsPerson: z.boolean(),
		personRightsConfirmed: z.boolean(),
		role: z.enum(uploadableConceptImageRoles),
		subjectKind: conceptSubjectKindSchema.nullable(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.role === "base" && value.subjectKind === null) {
			context.addIssue({
				code: "custom",
				message: "A base image requires a subject kind.",
				path: ["subjectKind"],
			});
		}
		if (value.role === "reference" && value.subjectKind !== null) {
			context.addIssue({
				code: "custom",
				message: "A reference image cannot set a subject kind.",
				path: ["subjectKind"],
			});
		}
		if (value.subjectKind === "person" && !value.containsPerson) {
			context.addIssue({
				code: "custom",
				message: "A person base must be marked as containing a person.",
				path: ["containsPerson"],
			});
		}
		if (value.containsPerson && !value.personRightsConfirmed) {
			context.addIssue({
				code: "custom",
				message: "Person-photo rights must be confirmed.",
				path: ["personRightsConfirmed"],
			});
		}
		if (!value.containsPerson && value.personRightsConfirmed) {
			context.addIssue({
				code: "custom",
				message: "Rights confirmation requires a person photo.",
				path: ["personRightsConfirmed"],
			});
		}
	});

export const conceptImageResourceSchema = z
	.object({
		byteSize: z.number().int().positive(),
		caption: z.string().nullable(),
		conceptId: z.string(),
		containsPerson: z.boolean(),
		contentType: z.literal("image/webp"),
		contentUrl: z.string(),
		createdAt: z.iso.datetime(),
		height: z.number().int().positive(),
		id: z.string(),
		isCover: z.boolean(),
		originalFilename: z.string(),
		position: z.number().int().min(0),
		role: conceptImageRoleSchema,
		subjectKind: conceptSubjectKindSchema.nullable(),
		uploader: z
			.object({
				id: z.string(),
				name: z.string(),
			})
			.strict(),
		width: z.number().int().positive(),
	})
	.strict();

export const conceptMediaResponseSchema = z
	.object({
		conceptId: z.string().nullable(),
		images: z.array(conceptImageResourceSchema),
		limits: z
			.object({
				maxFileBytes: z.number().int().positive(),
				maxImageCount: z.number().int().positive(),
				maxPixelCount: z.number().int().positive(),
				maxSidePixels: z.number().int().positive(),
				maxWorkspaceBytes: z.number().int().positive(),
			})
			.strict(),
		permissions: z.object({ canManage: z.boolean() }).strict(),
		usage: z
			.object({
				conceptImageCount: z.number().int().min(0),
				workspaceBytes: z.number().int().min(0),
			})
			.strict(),
	})
	.strict();

export const conceptImageUpdateInputSchema = z
	.object({
		caption: nullableCaptionSchema.optional(),
		isCover: z.boolean().optional(),
	})
	.strict()
	.refine((value) => Object.keys(value).length > 0, {
		message: "At least one field is required.",
	});

export const conceptImageReorderInputSchema = z
	.object({
		imageIds: z.array(z.string().min(1)).max(50),
	})
	.strict()
	.superRefine((value, context) => {
		if (new Set(value.imageIds).size !== value.imageIds.length) {
			context.addIssue({
				code: "custom",
				message: "Image identifiers must be unique.",
				path: ["imageIds"],
			});
		}
	});

export type ConceptImageUploadMetadata = z.infer<
	typeof conceptImageUploadMetadataSchema
>;
export type ConceptImageResource = z.infer<typeof conceptImageResourceSchema>;
export type ConceptMediaResponse = z.infer<typeof conceptMediaResponseSchema>;
export type ConceptImageUpdateInput = z.infer<
	typeof conceptImageUpdateInputSchema
>;
export type ConceptImageReorderInput = z.infer<
	typeof conceptImageReorderInputSchema
>;
