import { z } from "zod";

export const mcpActionReceiptSchema = z
	.object({
		id: z.string(),
		operation: z.string(),
		status: z.enum([
			"pending",
			"running",
			"succeeded",
			"failed",
			"denied",
			"expired",
			"unknown",
		]),
		approvalUrl: z.string().nullable(),
		expiresAt: z.string(),
		message: z.string(),
		result: z.unknown().nullable(),
	})
	.strict();
export const mcpActionReviewSchema = z
	.object({
		receipt: mcpActionReceiptSchema,
		title: z.string(),
		target: z.string(),
		arguments: z.record(z.string(), z.unknown()).nullable(),
		canApprove: z.boolean(),
	})
	.strict();
export type McpActionReceipt = z.infer<typeof mcpActionReceiptSchema>;
