import {
	candidateVoteInputSchema,
	commentInputSchema,
	commentResolutionInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import {
	createComment,
	readItemDiscussion,
	readWorkspaceCollaboration,
	removeComment,
	resolveComment,
	setCandidateVote,
	updateComment,
} from "./collaboration-experience-service";
import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

function identifier(value: string, field: string): string {
	return requiredIdentifier(value, field);
}

export const collaborationExperienceRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get(
		"/workspaces/:workspaceId/collaboration",
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await readWorkspaceCollaboration({
					database: context.env.DB,
					userId: current.user.id,
					workspaceId: identifier(
						context.req.param("workspaceId"),
						"workspaceId",
					),
				}),
			);
		},
	)
	.get("/items/:itemId/discussion", requireSession, async (context) => {
		const current = context.get("session");
		return context.json(
			await readItemDiscussion({
				database: context.env.DB,
				itemId: identifier(context.req.param("itemId"), "itemId"),
				userId: current.user.id,
			}),
		);
	})
	.post(
		"/items/:itemId/comments",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(commentInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await createComment({
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
				201,
			);
		},
	)
	.post(
		"/items/:itemId/candidates/:candidateId/comments",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(commentInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await createComment({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
				201,
			);
		},
	)
	.patch(
		"/items/:itemId/comments/:commentId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(commentInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await updateComment({
					commentId: identifier(context.req.param("commentId"), "commentId"),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.delete(
		"/items/:itemId/comments/:commentId",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await removeComment({
					commentId: identifier(context.req.param("commentId"), "commentId"),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
				}),
			);
		},
	)
	.post(
		"/items/:itemId/comments/:commentId/resolve",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(commentResolutionInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await resolveComment({
					commentId: identifier(context.req.param("commentId"), "commentId"),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.put(
		"/items/:itemId/candidates/:candidateId/vote",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(candidateVoteInputSchema),
		async (context) => {
			const current = context.get("session");
			const value = context.req.valid("json");
			return context.json(
				await setCandidateVote({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					selected: value.selected,
					userId: current.user.id,
				}),
			);
		},
	);
