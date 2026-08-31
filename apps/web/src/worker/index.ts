import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { createAuth } from "../auth/server";
import { ApiError } from "./api-errors";
import { collaborationRoutes } from "./collaboration-routes";
import { coreWorkspaceRoutes } from "./core-workspace-routes";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

const app = new Hono<WorkerAppEnv>();

app.all("/api/auth/*", (context) => {
	return createAuth(context.env).handler(context.req.raw);
});

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("/api/session", requireSession, (context) => {
	const current = context.get("session");

	return context.json({
		session: {
			expiresAt: current.session.expiresAt.toISOString(),
			id: current.session.id,
		},
		user: {
			email: current.user.email,
			id: current.user.id,
			image: current.user.image ?? null,
			name: current.user.name,
		},
	});
});

const apiRoutes = new Hono<WorkerAppEnv>()
	.route("/", collaborationRoutes)
	.route("/", coreWorkspaceRoutes);

app.route("/api", apiRoutes);

app.onError((error, context) => {
	if (error instanceof HTTPException && error.status === 400) {
		return new Response(
			JSON.stringify({
				error: {
					code: "BAD_REQUEST",
					message: "The request body must be valid JSON.",
				},
			}),
			{
				headers: {
					"cache-control": "no-store",
					"content-type": "application/json; charset=UTF-8",
				},
				status: 400,
			},
		);
	}

	if (error instanceof ApiError) {
		const headers = new Headers({
			"cache-control": "no-store",
			"content-type": "application/json; charset=UTF-8",
		});
		if (error.retryAfterSeconds !== undefined) {
			headers.set("retry-after", error.retryAfterSeconds.toString());
		}

		return new Response(
			JSON.stringify({
				error: {
					code: error.code,
					message: error.message,
				},
			}),
			{ headers, status: error.status },
		);
	}

	console.error(
		JSON.stringify({
			message: "worker_request_failed",
			errorName: error.name,
			path: context.req.path,
		}),
	);

	return context.json(
		{
			error: {
				code: "INTERNAL_ERROR",
				message: "The request could not be completed.",
			},
		},
		500,
	);
});

export type AppType = typeof apiRoutes;
export default app;
