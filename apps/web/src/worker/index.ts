import { Hono } from "hono";

import { createAuth } from "../auth/server";
import { ApiError } from "./api-errors";
import { collaborationRoutes } from "./collaboration-routes";
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

app.route("/api", collaborationRoutes);

app.onError((error, context) => {
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

	console.error("worker_request_failed", {
		errorName: error.name,
		path: context.req.path,
	});

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

export default app;
