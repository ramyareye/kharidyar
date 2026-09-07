import { z } from "zod";

export const floorPlanLimits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 6,
  maxWorkspaceBytes: 100 * 1024 * 1024,
  maxPixelCount: 40_000_000,
  maxSidePixels: 10_000,
} as const;

export const floorPlanDetailsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    notes: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .transform((value) => value || null),
  })
  .strict();

// Deliberately excludes file bytes, storage keys and uploader identity.
export const floorPlanContextSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    notes: z.string().nullable(),
    contentType: z.enum(["image/webp", "application/pdf"]),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const floorPlanResourceSchema = floorPlanContextSchema
  .extend({
    collectionId: z.string(),
    contentUrl: z.string(),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const floorPlansResponseSchema = z
  .object({
    plans: z.array(floorPlanResourceSchema).max(floorPlanLimits.maxFiles),
    permissions: z.object({ canManage: z.boolean() }).strict(),
  })
  .strict();

export const floorPlanResponseSchema = z
  .object({ plan: floorPlanResourceSchema })
  .strict();
export const floorPlanDeletedResponseSchema = z
  .object({ deleted: z.literal(true) })
  .strict();

export type FloorPlanDetails = z.infer<typeof floorPlanDetailsSchema>;
export type FloorPlanResource = z.infer<typeof floorPlanResourceSchema>;
export type FloorPlansResponse = z.infer<typeof floorPlansResponseSchema>;
