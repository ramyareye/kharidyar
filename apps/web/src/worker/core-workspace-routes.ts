import {
	archiveListQuerySchema,
	collectionCreateInputSchema,
	collectionUpdateInputSchema,
	itemCreateInputSchema,
	itemListQuerySchema,
	itemUpdateInputSchema,
	workspaceCreateInputSchema,
	workspaceUpdateInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import {
	jsonContractValidator,
	queryContractValidator,
} from "./contract-validation";
import {
	createCollection,
	createItem,
	createWorkspace,
	listCollections,
	listItems,
	listWorkspaces,
	readCollection,
	readItem,
	readWorkspace,
	setCollectionArchived,
	setItemArchived,
	setWorkspaceArchived,
	updateCollection,
	updateItem,
	updateWorkspace,
} from "./core-workspace-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const coreWorkspaceRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.get(
		"/workspaces",
		requireSession,
		queryContractValidator(archiveListQuerySchema),
		async (context) => {
			const current = context.get("session");
			const workspaces = await listWorkspaces({
				database: context.env.DB,
				query: context.req.valid("query"),
				userId: current.user.id,
			});
			return context.json({ workspaces });
		},
	)
	.post(
		"/workspaces",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(workspaceCreateInputSchema),
		async (context) => {
			const current = context.get("session");
			const workspace = await createWorkspace({
				actorUserId: current.user.id,
				database: context.env.DB,
				value: context.req.valid("json"),
			});
			return context.json({ workspace }, 201);
		},
	)
	.get("/workspaces/:workspaceId", requireSession, async (context) => {
		const current = context.get("session");
		const workspace = await readWorkspace({
			database: context.env.DB,
			userId: current.user.id,
			workspaceId: requiredIdentifier(
				context.req.param("workspaceId"),
				"workspaceId",
			),
		});
		return context.json({ workspace });
	})
	.patch(
		"/workspaces/:workspaceId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(workspaceUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			const workspace = await updateWorkspace({
				database: context.env.DB,
				userId: current.user.id,
				value: context.req.valid("json"),
				workspaceId: requiredIdentifier(
					context.req.param("workspaceId"),
					"workspaceId",
				),
			});
			return context.json({ workspace });
		},
	)
	.post(
		"/workspaces/:workspaceId/archive",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const workspace = await setWorkspaceArchived({
				archived: true,
				database: context.env.DB,
				userId: current.user.id,
				workspaceId: requiredIdentifier(
					context.req.param("workspaceId"),
					"workspaceId",
				),
			});
			return context.json({ workspace });
		},
	)
	.post(
		"/workspaces/:workspaceId/restore",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const workspace = await setWorkspaceArchived({
				archived: false,
				database: context.env.DB,
				userId: current.user.id,
				workspaceId: requiredIdentifier(
					context.req.param("workspaceId"),
					"workspaceId",
				),
			});
			return context.json({ workspace });
		},
	)
	.get(
		"/workspaces/:workspaceId/collections",
		requireSession,
		queryContractValidator(archiveListQuerySchema),
		async (context) => {
			const current = context.get("session");
			const workspaceId = requiredIdentifier(
				context.req.param("workspaceId"),
				"workspaceId",
			);
			const collections = await listCollections({
				database: context.env.DB,
				query: context.req.valid("query"),
				userId: current.user.id,
				workspaceId,
			});
			return context.json({ collections });
		},
	)
	.post(
		"/workspaces/:workspaceId/collections",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(collectionCreateInputSchema),
		async (context) => {
			const current = context.get("session");
			const collection = await createCollection({
				database: context.env.DB,
				userId: current.user.id,
				value: context.req.valid("json"),
				workspaceId: requiredIdentifier(
					context.req.param("workspaceId"),
					"workspaceId",
				),
			});
			return context.json({ collection }, 201);
		},
	)
	.get("/collections/:collectionId", requireSession, async (context) => {
		const current = context.get("session");
		const collection = await readCollection({
			collectionId: requiredIdentifier(
				context.req.param("collectionId"),
				"collectionId",
			),
			database: context.env.DB,
			userId: current.user.id,
		});
		return context.json({ collection });
	})
	.patch(
		"/collections/:collectionId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(collectionUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			const collection = await updateCollection({
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				userId: current.user.id,
				value: context.req.valid("json"),
			});
			return context.json({ collection });
		},
	)
	.post(
		"/collections/:collectionId/archive",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const collection = await setCollectionArchived({
				archived: true,
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				userId: current.user.id,
			});
			return context.json({ collection });
		},
	)
	.post(
		"/collections/:collectionId/restore",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const collection = await setCollectionArchived({
				archived: false,
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				userId: current.user.id,
			});
			return context.json({ collection });
		},
	)
	.get(
		"/collections/:collectionId/items",
		requireSession,
		queryContractValidator(itemListQuerySchema),
		async (context) => {
			const current = context.get("session");
			const result = await listItems({
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				query: context.req.valid("query"),
				userId: current.user.id,
			});
			return context.json(result);
		},
	)
	.post(
		"/collections/:collectionId/items",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(itemCreateInputSchema),
		async (context) => {
			const current = context.get("session");
			const item = await createItem({
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				userId: current.user.id,
				value: context.req.valid("json"),
			});
			return context.json({ item }, 201);
		},
	)
	.get("/items/:itemId", requireSession, async (context) => {
		const current = context.get("session");
		const item = await readItem({
			database: context.env.DB,
			itemId: requiredIdentifier(context.req.param("itemId"), "itemId"),
			userId: current.user.id,
		});
		return context.json({ item });
	})
	.patch(
		"/items/:itemId",
		requireTrustedOrigin,
		requireSession,
		jsonContractValidator(itemUpdateInputSchema),
		async (context) => {
			const current = context.get("session");
			const item = await updateItem({
				database: context.env.DB,
				itemId: requiredIdentifier(
					context.req.param("itemId"),
					"itemId",
				),
				userId: current.user.id,
				value: context.req.valid("json"),
			});
			return context.json({ item });
		},
	)
	.post(
		"/items/:itemId/archive",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const item = await setItemArchived({
				archived: true,
				database: context.env.DB,
				itemId: requiredIdentifier(
					context.req.param("itemId"),
					"itemId",
				),
				userId: current.user.id,
			});
			return context.json({ item });
		},
	)
	.post(
		"/items/:itemId/restore",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const item = await setItemArchived({
				archived: false,
				database: context.env.DB,
				itemId: requiredIdentifier(
					context.req.param("itemId"),
					"itemId",
				),
				userId: current.user.id,
			});
			return context.json({ item });
		},
	);

export type CoreWorkspaceRoutes = typeof coreWorkspaceRoutes;
