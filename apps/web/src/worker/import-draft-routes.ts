import {
	importDraftCorrectionInputSchema,
	importDraftCreateInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import { jsonContractValidator } from "./contract-validation";
import {
	applyImportDraft,
	correctImportDraft,
	createImportDraft,
	discardImportDraft,
	listImportDrafts,
	readImportDraft,
} from "./import-draft-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

function identifier(value: string, field: string): string {
	return requiredIdentifier(value, field);
}

export const importDraftRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get(
		"/collections/:collectionId/import-drafts",
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json({
				drafts: await listImportDrafts({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					userId: current.user.id,
				}),
			});
		},
	)
	.post(
		"/collections/:collectionId/import-drafts",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(importDraftCreateInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				{
					draft: await createImportDraft({
						collectionId: identifier(
							context.req.param("collectionId"),
							"collectionId",
						),
						database: context.env.DB,
						userId: current.user.id,
						value: context.req.valid("json"),
					}),
				},
				201,
			);
		},
	)
	.get(
		"/collections/:collectionId/import-drafts/:draftId",
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json({
				draft: await readImportDraft({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					draftId: identifier(context.req.param("draftId"), "draftId"),
					userId: current.user.id,
				}),
			});
		},
	)
	.put(
		"/collections/:collectionId/import-drafts/:draftId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(importDraftCorrectionInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json({
				draft: await correctImportDraft({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					draftId: identifier(context.req.param("draftId"), "draftId"),
					proposal: context.req.valid("json").proposal,
					userId: current.user.id,
				}),
			});
		},
	)
	.post(
		"/collections/:collectionId/import-drafts/:draftId/apply",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json({
				draft: await applyImportDraft({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					draftId: identifier(context.req.param("draftId"), "draftId"),
					userId: current.user.id,
				}),
			});
		},
	)
	.post(
		"/collections/:collectionId/import-drafts/:draftId/discard",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json({
				draft: await discardImportDraft({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					draftId: identifier(context.req.param("draftId"), "draftId"),
					userId: current.user.id,
				}),
			});
		},
	);

export type ImportDraftRoutes = typeof importDraftRoutes;
