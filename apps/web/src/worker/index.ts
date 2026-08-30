import { Hono } from "hono";

import { createAuth } from "../auth/server";
import {
	requireSession,
	type WorkerAppEnv,
} from "./session-middleware";

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

app.onError((error, context) => {
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
