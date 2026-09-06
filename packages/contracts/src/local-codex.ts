import { z } from "zod";
import {
  researchConstraintsSchema,
  researchProviderSearchOutputSchema,
} from "./research";

export const localCodexProvider = "local-codex-v1" as const;
export const localCodexPairingInputSchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export const localCodexPairingSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    expiresAt: z.iso.datetime(),
    online: z.boolean(),
  })
  .strict();
export const localCodexStatusSchema = z
  .object({ enabled: z.boolean(), pairings: z.array(localCodexPairingSchema) })
  .strict();
export const localCodexCredentialsSchema = z
  .object({
    pairing: localCodexPairingSchema,
    token: z.string().min(40),
    origin: z.url(),
  })
  .strict();
export const localCodexJobSchema = z
  .object({
    runId: z.string(),
    query: z.string().min(1).max(1000),
    constraints: researchConstraintsSchema,
    leaseToken: z.string().min(40).max(100),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const localCodexResultSchema = z
  .object({
    model: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,100}$/),
    cliVersion: z.string().trim().min(1).max(100),
    searchMode: z.literal("live"),
    output: researchProviderSearchOutputSchema,
  })
  .strict();
export const localCodexCompletionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      leaseToken: z.string().min(40).max(100),
      result: localCodexResultSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      leaseToken: z.string().min(40).max(100),
      reason: z.enum([
        "login_required",
        "quota_or_provider_error",
        "invalid_output",
        "timeout",
        "cancelled",
      ]),
    })
    .strict(),
]);
export type LocalCodexJob = z.infer<typeof localCodexJobSchema>;
export type LocalCodexCompletion = z.infer<typeof localCodexCompletionSchema>;
