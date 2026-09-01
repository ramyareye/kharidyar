import {
	candidateCreateInputSchema,
	candidateUpdateInputSchema,
	merchantInputSchema,
	offerInputSchema,
	plannedSelectionInputSchema,
	priceCheckInputSchema,
	productUpdateInputSchema,
	purchaseRecordInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import {
	changePlannedSelection,
	createCandidate,
	createMerchant,
	createOffer,
	readCollectionRollup,
	readItemComparison,
	recordPriceCheck,
	recordPurchase,
	setCandidateArchived,
	updateCandidate,
	updateCandidateProduct,
	updateOffer,
} from "./commerce-service";
import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

function identifier(value: string, field: string): string {
	return requiredIdentifier(value, field);
}

export const commerceRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get("/items/:itemId/comparison", requireSession, async (context) => {
		const current = context.get("session");
		return context.json(
			await readItemComparison({
				database: context.env.DB,
				itemId: identifier(context.req.param("itemId"), "itemId"),
				userId: current.user.id,
			}),
		);
	})
	.post(
		"/items/:itemId/candidates",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(candidateCreateInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await createCandidate({
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
		"/items/:itemId/candidates/:candidateId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(candidateUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await updateCandidate({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.post(
		"/items/:itemId/candidates/:candidateId/archive",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await setCandidateArchived({
					archived: true,
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
				}),
			);
		},
	)
	.post(
		"/items/:itemId/candidates/:candidateId/restore",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await setCandidateArchived({
					archived: false,
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
				}),
			);
		},
	)
	.patch(
		"/items/:itemId/candidates/:candidateId/product",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(productUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await updateCandidateProduct({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.post(
		"/items/:itemId/merchants",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(merchantInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await createMerchant({
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
		"/items/:itemId/candidates/:candidateId/offers",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(offerInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await createOffer({
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
	.put(
		"/items/:itemId/candidates/:candidateId/offers/:offerId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(offerInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await updateOffer({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					offerId: identifier(context.req.param("offerId"), "offerId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.post(
		"/items/:itemId/candidates/:candidateId/offers/:offerId/price-checks",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(priceCheckInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await recordPriceCheck({
					candidateId: identifier(
						context.req.param("candidateId"),
						"candidateId",
					),
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					offerId: identifier(context.req.param("offerId"), "offerId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
				201,
			);
		},
	)
	.put(
		"/items/:itemId/plan",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(plannedSelectionInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await changePlannedSelection({
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.post(
		"/items/:itemId/purchases",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(purchaseRecordInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await recordPurchase({
					database: context.env.DB,
					itemId: identifier(context.req.param("itemId"), "itemId"),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
				201,
			);
		},
	)
	.get(
		"/collections/:collectionId/planned-cost",
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await readCollectionRollup({
					collectionId: identifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					userId: current.user.id,
				}),
			);
		},
	);

export type CommerceRoutes = typeof commerceRoutes;
