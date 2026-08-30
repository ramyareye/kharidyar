import { createMiddleware } from "hono/factory";

import { readAuthRuntimeConfig } from "../auth/server";
import { forbidden } from "./api-errors";
import type { WorkerAppEnv } from "./session-middleware";

export const requireTrustedOrigin = createMiddleware<WorkerAppEnv>(
	async (context, next) => {
		const suppliedOrigin = context.req.header("origin");
		if (suppliedOrigin === undefined) {
			const fetchSite = context.req.header("sec-fetch-site");
			if (fetchSite === undefined || fetchSite === "same-origin") {
				// Native and server clients do not send browser Origin/Fetch Metadata.
				// Browser requests that do identify themselves must be same-origin.
				await next();
				return;
			}
			throw forbidden("The request origin is not trusted.");
		}

		let normalizedOrigin: string;
		try {
			normalizedOrigin = new URL(suppliedOrigin).origin;
		} catch {
			throw forbidden("The request origin is not trusted.");
		}

		const config = readAuthRuntimeConfig(context.env);
		if (!config.trustedOrigins.includes(normalizedOrigin)) {
			throw forbidden("The request origin is not trusted.");
		}

		await next();
	},
);
