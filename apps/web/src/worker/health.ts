import type { Context } from "hono";

import type { WorkerAppEnv } from "./session-middleware";

const databaseTimeoutMs = 2_000;

export async function healthResponse(context: Context<WorkerAppEnv>): Promise<Response> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		// Check the binding without reading any application tables or private data.
		const result = await Promise.race([
			context.env.DB.prepare("SELECT 1 AS ok").first<number>("ok"),
			new Promise<null>((resolve) => {
				timeout = setTimeout(() => resolve(null), databaseTimeoutMs);
			}),
		]);
		return context.json({ status: result === 1 ? "ok" : "degraded" }, result === 1 ? 200 : 503);
	} catch {
		// Never expose database errors, binding details or credentials publicly.
		return context.json({ status: "degraded" }, 503);
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
	}
}
