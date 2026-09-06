import { mcp, type McpOptions } from "@better-auth/mcp";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

export const mcpReadScope = "wantkit:read";
export const mcpWriteScope = "wantkit:write";
export const mcpPath = "/api/mcp";

export interface McpBindings {
	MCP_ENABLED?: string;
	MCP_ALLOWED_USER_IDS?: string;
}

export function mcpEnabled(bindings: McpBindings): boolean {
	return bindings.MCP_ENABLED === "true";
}

export function mcpUserAllowed(bindings: McpBindings, userId: string): boolean {
	return (
		mcpEnabled(bindings) &&
		(bindings.MCP_ALLOWED_USER_IDS ?? "")
			.split(",")
			.map((id) => id.trim())
			.includes(userId)
	);
}

export function createMcpAuthPlugins(baseURL: string, bindings: McpBindings) {
	const options: McpOptions = {
		resource: `${baseURL}${mcpPath}`,
		loginPage: "/connectors/login",
		consentPage: "/connectors/consent",
		disableJwtPlugin: true,
		scopes: [mcpReadScope, mcpWriteScope, "offline_access"],
		grantTypes: ["authorization_code", "refresh_token"],
		accessTokenExpiresIn: 600,
		refreshTokenExpiresIn: 7 * 24 * 60 * 60,
		refreshTokenReuseInterval: 0,
		allowDynamicClientRegistration: false,
		resourcePrivileges: () => false,
		customTokenResponseFields: ({ user, metadata }) => {
			if (
				!user ||
				!mcpUserAllowed(bindings, user.id) ||
				metadata?.wantkitOwner !== user.id
			) {
				throw new APIError("FORBIDDEN", {
					error: "access_denied",
					error_description:
						"This private connector is not available to this account.",
				});
			}
			return {};
		},
		clientPrivileges: ({ action, user }) =>
			Boolean(
				user &&
					(["read", "list", "delete"].includes(action) ||
						(action === "create" && mcpUserAllowed(bindings, user.id))),
			),
		customAccessTokenClaims: ({ user, metadata }) => {
			if (
				!user ||
				!mcpUserAllowed(bindings, user.id) ||
				metadata?.wantkitOwner !== user.id
			) {
				throw new APIError("FORBIDDEN", {
					error: "access_denied",
					error_description:
						"This private connector belongs to another account or is disabled.",
				});
			}
			return {};
		},
	};
	return [
		mcp(options),
		{
			id: "wantkit-mcp-verification",
			endpoints: {
				verifyWantkitMcpToken: createAuthEndpoint(
					"/wantkit-mcp/verify",
					{
						method: "POST",
						body: z.object({ token: z.string().min(1).max(4096) }),
						metadata: { SERVER_ONLY: true },
					},
					async (ctx) => {
						// Local provider validation includes token expiry/revocation, client
						// status and the original login session; no network introspection.
						return getOAuthProviderApi(ctx, options).requireActiveAccessToken(
							ctx.body.token,
						);
					},
				),
			},
		},
	];
}
