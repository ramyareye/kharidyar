import { itemStatusChangeInputSchema } from "@kharidyar/contracts";
import { Hono } from "hono";

import { jsonContractValidator } from "./contract-validation";
import {
	changeItemStatus,
	readItemWorkflow,
} from "./item-workflow-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const itemWorkflowRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get("/items/:itemId/workflow", requireSession, async (context) => {
		const current = context.get("session");
		return context.json(
			await readItemWorkflow({
				database: context.env.DB,
				itemId: requiredIdentifier(context.req.param("itemId"), "itemId"),
				userId: current.user.id,
			}),
		);
	})
	.post(
		"/items/:itemId/status",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(itemStatusChangeInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await changeItemStatus({
					database: context.env.DB,
					itemId: requiredIdentifier(
						context.req.param("itemId"),
						"itemId",
					),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	);

export type ItemWorkflowRoutes = typeof itemWorkflowRoutes;
