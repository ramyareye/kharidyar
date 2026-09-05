import {
	conceptImageReorderInputSchema,
	conceptImageUpdateInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import {
	conceptMediaLimits,
	deleteConceptImage,
	readConceptImageContent,
	readConceptMedia,
	reorderConceptReferences,
	updateConceptImage,
	uploadConceptImage,
} from "./concept-media-service";
import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const conceptMediaRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get(
		"/collections/:collectionId/concept/images",
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await readConceptMedia({
					bucket: context.env.CONCEPT_MEDIA,
					collectionId: requiredIdentifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					limits: conceptMediaLimits(context.env),
					userId: current.user.id,
				}),
			);
		},
	)
	.post(
		"/collections/:collectionId/concept/images",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await uploadConceptImage({
					bucket: context.env.CONCEPT_MEDIA,
					collectionId: requiredIdentifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					images: context.env.IMAGES,
					limits: conceptMediaLimits(context.env),
					rateLimitSecret: context.env.BETTER_AUTH_SECRET,
					request: context.req.raw,
					userId: current.user.id,
				}),
				201,
			);
		},
	)
	.put(
		"/collections/:collectionId/concept/images/order",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(conceptImageReorderInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await reorderConceptReferences({
					bucket: context.env.CONCEPT_MEDIA,
					collectionId: requiredIdentifier(
						context.req.param("collectionId"),
						"collectionId",
					),
					database: context.env.DB,
					limits: conceptMediaLimits(context.env),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.get("/concept-images/:imageId/content", requireSession, async (context) => {
		const current = context.get("session");
		return readConceptImageContent({
			bucket: context.env.CONCEPT_MEDIA,
			database: context.env.DB,
			imageId: requiredIdentifier(context.req.param("imageId"), "imageId"),
			requestHeaders: context.req.raw.headers,
			userId: current.user.id,
		});
	})
	.patch(
		"/concept-images/:imageId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(conceptImageUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			return context.json(
				await updateConceptImage({
					bucket: context.env.CONCEPT_MEDIA,
					database: context.env.DB,
					imageId: requiredIdentifier(context.req.param("imageId"), "imageId"),
					limits: conceptMediaLimits(context.env),
					userId: current.user.id,
					value: context.req.valid("json"),
				}),
			);
		},
	)
	.delete(
		"/concept-images/:imageId",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			return context.json(
				await deleteConceptImage({
					bucket: context.env.CONCEPT_MEDIA,
					database: context.env.DB,
					imageId: requiredIdentifier(context.req.param("imageId"), "imageId"),
					limits: conceptMediaLimits(context.env),
					userId: current.user.id,
				}),
			);
		},
	);

export type ConceptMediaRoutes = typeof conceptMediaRoutes;
