import { createMiddleware } from "hono/factory";

import {
	createAuth,
	type KharidyarSession,
} from "../auth/server";

export interface WorkerAppEnv {
	Bindings: Env;
	Variables: {
		session: KharidyarSession;
	};
}

export const requireSession = createMiddleware<WorkerAppEnv>(
	async (context, next) => {
		const auth = createAuth(context.env);
		const session = await auth.api.getSession({
			headers: context.req.raw.headers,
		});

		if (session === null) {
			return context.json(
				{
					error: {
						code: "UNAUTHENTICATED",
						message: "Authentication is required.",
					},
				},
				401,
			);
		}

		context.set("session", session);
		await next();
	},
);
