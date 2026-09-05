import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { mcpEnabled, mcpReadScope } from "../auth/mcp-options";
import { createWantkitMcpServer } from "./mcp-server";
import {
	authenticateMcpRequest,
	connectorInputSchema,
	createMcpConnection,
	disconnectMcpConnection,
	enforceMcpRequestLimit,
	listMcpConnections,
} from "./mcp-auth-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const mcpRoutes = new Hono<WorkerAppEnv>()
	.use(
		"/mcp",
		bodyLimit({
			maxSize: 16_384,
			onError: (c) => c.json({ error: "Request body too large." }, 413),
		}),
	)
	.all("/mcp", requireTrustedOrigin, async (context) => {
		if (!mcpEnabled(context.env)) return context.notFound();
		if (context.req.url.includes("?"))
			return context.json(
				{ error: "Query parameters are not supported." },
				400,
			);
		await enforceMcpRequestLimit(
			context.env,
			`ip:${context.req.header("cf-connecting-ip") ?? "unknown"}`,
			120,
		);
		const userId = await authenticateMcpRequest(context.env, context.req.raw);
		if (!userId) {
			context.header(
				"WWW-Authenticate",
				`Bearer resource_metadata="${context.env.BETTER_AUTH_URL}/.well-known/oauth-protected-resource/api/mcp", scope="${mcpReadScope}"`,
			);
			return context.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32000,
						message: "Connect your WantKit account to continue.",
					},
				},
				401,
			);
		}
		context.set("actorId", userId);
		await enforceMcpRequestLimit(context.env, `user:${userId}`);
		return createMcpHandler(
			() =>
				createWantkitMcpServer({
					database: context.env.DB,
					userId,
					rateLimitSecret: context.env.BETTER_AUTH_SECRET,
				}),
			{ legacy: "stateless" },
		).fetch(context.req.raw);
	})
	.get("/connectors", requireSession, async (context) =>
		context.json(
			await listMcpConnections(
				context.env,
				context.req.raw.headers,
				context.get("session").user.id,
			),
		),
	)
	.post(
		"/connectors",
		bodyLimit({
			maxSize: 2048,
			onError: (c) => c.json({ error: "Request body too large." }, 413),
		}),
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const body = connectorInputSchema.safeParse(await context.req.json());
			if (!body.success)
				return context.json(
					{
						error: {
							message:
								"Choose ChatGPT or Claude and enter its exact supported callback URL.",
						},
					},
					400,
				);
			return context.json(
				await createMcpConnection(
					context.env,
					context.req.raw.headers,
					context.get("session").user.id,
					body.data,
				),
				201,
			);
		},
	)
	.delete(
		"/connectors/:clientId",
		requireTrustedOrigin,
		requireSession,
		async (context) => {
			const clientId = context.req.param("clientId");
			if (!/^[A-Za-z0-9_-]{1,200}$/.test(clientId)) return context.notFound();
			await disconnectMcpConnection(
				context.env,
				context.req.raw.headers,
				context.get("session").user.id,
				clientId,
			);
			return context.body(null, 204);
		},
	);
