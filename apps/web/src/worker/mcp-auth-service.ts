import { z } from "zod";
import { createAuth, type AuthBindings } from "../auth/server";
import { mcpPath, mcpReadScope, mcpUserAllowed } from "../auth/mcp-options";
import { forbidden, conflict, notFound } from "./api-errors";
import { enforceCollaborationRateLimit } from "./collaboration-rate-limit";

export const connectorInputSchema = z
	.object({
		provider: z.enum(["chatgpt", "claude"]),
		redirectUri: z.string().url().max(512),
	})
	.strict()
	.refine(
		({ provider, redirectUri }) => {
			const url = new URL(redirectUri);
			if (
				url.protocol !== "https:" ||
				url.username ||
				url.password ||
				url.search ||
				url.hash ||
				url.port
			)
				return false;
			return provider === "claude"
				? url.origin === "https://claude.ai" &&
						url.pathname === "/api/mcp/auth_callback"
				: url.origin === "https://chatgpt.com" &&
						(url.pathname === "/connector_platform_oauth_redirect" ||
							/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname));
		},
		{ message: "Use the exact HTTPS callback shown by ChatGPT or Claude." },
	);

export async function listMcpConnections(
	bindings: AuthBindings,
	headers: Headers,
	userId: string,
) {
	const enabled = mcpUserAllowed(bindings, userId);
	if (!enabled) return { enabled: false, endpoint: null, connections: [] };
	const clients =
		(await createAuth(bindings).api.getOAuthClients({ headers })) ?? [];
	return {
		enabled,
		endpoint: `${bindings.BETTER_AUTH_URL}${mcpPath}`,
		connections: clients.map((client) => ({
			id: client.client_id,
			name: client.client_name ?? "WantKit connector",
			redirectUris: client.redirect_uris,
		})),
	};
}

export async function createMcpConnection(
	bindings: AuthBindings,
	headers: Headers,
	userId: string,
	body: z.infer<typeof connectorInputSchema>,
) {
	if (!mcpUserAllowed(bindings, userId)) throw forbidden();
	await enforceCollaborationRateLimit({
		action: "mcp_registration",
		database: bindings.DB,
		identity: userId,
		secret: bindings.BETTER_AUTH_SECRET,
		now: Date.now(),
		limit: 5,
		windowMilliseconds: 60_000,
	});
	const auth = createAuth(bindings);
	if (((await auth.api.getOAuthClients({ headers })) ?? []).length >= 5)
		throw conflict("Disconnect an existing assistant before adding another.");
	const client = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			client_name: body.provider === "chatgpt" ? "My ChatGPT" : "My Claude",
			redirect_uris: [body.redirectUri],
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: `${mcpReadScope} offline_access`,
			require_pkce: true,
			skip_consent: false,
			metadata: { wantkitOwner: userId },
		},
	});
	return {
		clientId: client.client_id,
		clientSecret: client.client_secret,
		endpoint: `${bindings.BETTER_AUTH_URL}${mcpPath}`,
	};
}

export async function disconnectMcpConnection(
	bindings: AuthBindings,
	headers: Headers,
	userId: string,
	clientId: string,
) {
	if (bindings.MCP_ENABLED !== "true") throw forbidden();
	// Keep disconnect available for a removed pilot participant while enabled.
	const auth = createAuth(bindings);
	const clients = (await auth.api.getOAuthClients({ headers })) ?? [];
	if (
		!clients.some(
			(client) => client.client_id === clientId && client.user_id === userId,
		)
	)
		throw notFound();
	await auth.api.deleteOAuthClient({ headers, body: { client_id: clientId } });
}

export async function authenticateMcpRequest(
	bindings: AuthBindings,
	request: Request,
): Promise<string | null> {
	const authorization = request.headers.get("authorization");
	if (
		!authorization ||
		!/^Bearer [^\s]+$/i.test(authorization) ||
		authorization.length > 4103
	)
		return null;
	try {
		const claims = await createAuth(bindings).api.verifyWantkitMcpToken({
			body: { token: authorization.slice(7) },
		});
		const resource = `${bindings.BETTER_AUTH_URL}${mcpPath}`;
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (
			!claims.sub ||
			typeof claims.sid !== "string" ||
			!mcpUserAllowed(bindings, claims.sub) ||
			claims.iss !== `${bindings.BETTER_AUTH_URL}/api/auth` ||
			!audiences.includes(resource) ||
			typeof claims.scope !== "string" ||
			!claims.scope.split(" ").includes(mcpReadScope) ||
			claims.cnf
		)
			return null;
		return claims.sub;
	} catch {
		// Tokens, provider errors and stored record content never enter logs.
		return null;
	}
}

export async function enforceMcpRequestLimit(
	bindings: AuthBindings,
	identity: string,
	limit = 60,
) {
	await enforceCollaborationRateLimit({
		action: "mcp_request",
		database: bindings.DB,
		identity,
		secret: bindings.BETTER_AUTH_SECRET,
		now: Date.now(),
		limit,
		windowMilliseconds: 60_000,
	});
}
