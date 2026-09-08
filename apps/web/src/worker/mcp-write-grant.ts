import { z } from "zod";
import { mcpUserAllowed, mcpWriteScope } from "../auth/mcp-options";
import { forbidden } from "./api-errors";
import type { McpActor } from "./mcp-auth-service";
// Better Auth's pinned Drizzle adapter serializes array fields before the
// schema's JSON mode. Decode a bounded number of layers and fail closed.
function storedScopes(raw: unknown): string[] {
	try {
		for (let depth = 0; depth < 3 && typeof raw === "string"; depth++)
			raw = JSON.parse(raw);
		return z.array(z.string()).parse(raw);
	} catch {
		return [];
	}
}
export async function requireActiveWriteGrant(env: Env, actor: McpActor) {
	if (
		!mcpUserAllowed(env, actor.userId) ||
		!actor.scopes.includes(mcpWriteScope)
	)
		throw forbidden("Reconnect with write access to change WantKit.");
	const active = await env.DB.prepare(
		`select a.expires_at, a.scopes as token_scopes,c.scopes as client_scopes from oauth_access_token a
    join oauth_client c on c.client_id=a.client_id and c.user_id=a.user_id
    join session s on s.id=a.session_id and s.user_id=a.user_id
    where a.id=?1 and a.user_id=?2 and a.client_id=?3 and a.session_id=?4
    and a.revoked is null and a.expires_at>?5 and s.expires_at>?5 and coalesce(c.disabled,0)=0`,
	)
		.bind(
			actor.accessTokenId,
			actor.userId,
			actor.clientId,
			actor.sessionId,
			Date.now(),
		)
		.first<{
			expires_at: number;
			token_scopes: string;
			client_scopes: string;
		}>();
	if (
		!active ||
		!storedScopes(active.token_scopes).includes(mcpWriteScope) ||
		!storedScopes(active.client_scopes).includes(mcpWriteScope)
	)
		throw forbidden(
			"This approval expired or its assistant connection was revoked. Start a new request from your connected assistant.",
		);
	return active.expires_at;
}
