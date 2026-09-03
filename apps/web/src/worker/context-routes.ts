import { Hono } from "hono";

import {
	createCollectionContextSnapshot,
	readContextSnapshot,
	renderContextSnapshotMarkdown,
} from "./context-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const contextRoutes = new Hono<WorkerAppEnv>()
	.use("*", async (context, next) => {
		context.header("cache-control", "no-store");
		await next();
	})
	.post(
		"/collections/:collectionId/context-snapshots",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const current = context.get("session");
			const snapshot = await createCollectionContextSnapshot({
				actorName: current.user.name,
				collectionId: requiredIdentifier(
					context.req.param("collectionId"),
					"collectionId",
				),
				database: context.env.DB,
				rateLimitSecret: context.env.BETTER_AUTH_SECRET,
				userId: current.user.id,
			});
			console.info({
				event: "context_snapshot_created",
				requestId: context.get("requestId"),
				actorId: current.user.id,
				workspaceId: snapshot.scope.workspaceId,
				collectionId: snapshot.scope.collectionId,
				contextSnapshotId: snapshot.id,
				contentBytes: snapshot.contentBytes,
			});
			return context.json({ snapshot }, 201);
		},
	)
	.get(
		"/context-snapshots/:snapshotId/export.md",
		requireSession,
		async (context) => {
			const current = context.get("session");
			const snapshot = await readContextSnapshot({
				database: context.env.DB,
				snapshotId: requiredIdentifier(
					context.req.param("snapshotId"),
					"snapshotId",
				),
				userId: current.user.id,
			});
			return new Response(renderContextSnapshotMarkdown(snapshot), {
				headers: {
					"cache-control": "no-store",
					"content-disposition": `attachment; filename="kharidyar-context-${snapshot.id}.md"`,
					"content-type": "text/markdown; charset=UTF-8",
					"x-content-type-options": "nosniff",
				},
			});
		},
	)
	.get(
		"/context-snapshots/:snapshotId",
		requireSession,
		async (context) => {
			const current = context.get("session");
			const snapshot = await readContextSnapshot({
				database: context.env.DB,
				snapshotId: requiredIdentifier(
					context.req.param("snapshotId"),
					"snapshotId",
				),
				userId: current.user.id,
			});
			return context.json({ snapshot });
		},
	);

export type ContextRoutes = typeof contextRoutes;
