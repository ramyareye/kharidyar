import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import { createAuth } from "../auth/server";
import { mcpEnabled, mcpPath, mcpReadScope } from "../auth/mcp-options";
import {
	protectApiResponse,
	requestLogFields,
	safeErrorName,
} from "./api-protection-middleware";
import { ApiError } from "./api-errors";
import { collaborationExperienceRoutes } from "./collaboration-experience-routes";
import { collaborationRoutes } from "./collaboration-routes";
import { collectionDirectionRoutes } from "./collection-direction-routes";
import { conceptMediaRoutes } from "./concept-media-routes";
import { commerceRoutes } from "./commerce-routes";
import { coreWorkspaceRoutes } from "./core-workspace-routes";
import { contextRoutes } from "./context-routes";
import { itemWorkflowRoutes } from "./item-workflow-routes";
import { importDraftRoutes } from "./import-draft-routes";
import { researchFixtureRoutes } from "./research-fixture-routes";
import { researchRoutes } from "./research-routes";
import { mcpRoutes } from "./mcp-routes";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

const app = new Hono<WorkerAppEnv>();

app.use("/api/*", protectApiResponse);

// Expose only the OAuth flow, not the provider's general client/resource CRUD.
const oauthPaths = new Set([
	"/oauth2/authorize",
	"/oauth2/token",
	"/oauth2/consent",
	"/oauth2/continue",
	"/oauth2/revoke",
]);
app.use(
	"/api/auth/oauth2/*",
	bodyLimit({
		maxSize: 16_384,
		onError: (c) => c.json({ error: "Request body too large." }, 413),
	}),
);
app.all("/api/auth/*", (context) => {
	const path = context.req.path.slice("/api/auth".length);
	// Do not let alternate path encodings bypass the explicit endpoint allowlist.
	if (path.includes("%") || path.includes("//") || path.endsWith("/"))
		return context.notFound();
	if (
		(path.startsWith("/oauth2/") &&
			(!mcpEnabled(context.env) || !oauthPaths.has(path))) ||
		path.startsWith("/admin/") ||
		path.startsWith("/wantkit-mcp/")
	)
		return context.notFound();
	return createAuth(context.env).handler(context.req.raw);
});

app.use("/.well-known/*", protectApiResponse);
app.all("/.well-known/*", (context) => {
	if (!mcpEnabled(context.env)) return context.notFound();
	if (
		[
			"/.well-known/oauth-protected-resource",
			`/.well-known/oauth-protected-resource${mcpPath}`,
		].includes(context.req.path)
	) {
		// This resource accepts bearer tokens only; do not advertise the provider's
		// optional DPoP support until the resource verifies proofs too.
		return context.json({
			resource: `${context.env.BETTER_AUTH_URL}${mcpPath}`,
			authorization_servers: [`${context.env.BETTER_AUTH_URL}/api/auth`],
			scopes_supported: [mcpReadScope],
			bearer_methods_supported: ["header"],
		});
	}
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
	.route("/", mcpRoutes)
	.route("/", collaborationExperienceRoutes)
	.route("/", collaborationRoutes)
	.route("/", coreWorkspaceRoutes)
	.route("/", contextRoutes)
	.route("/", itemWorkflowRoutes)
	.route("/", collectionDirectionRoutes)
	.route("/", conceptMediaRoutes)
	.route("/", commerceRoutes)
	.route("/", importDraftRoutes)
	.route("/", researchFixtureRoutes)
	.route("/", researchRoutes);

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
		const invitationFailure = context.req.path
			.split("/")
			.includes("invitations");
		if (
			invitationFailure ||
			error.status === 403 ||
			error.status === 404 ||
			error.status === 429
		) {
			console.warn({
				event: invitationFailure
					? "invitation_request_failed"
					: "api_request_rejected",
				...requestLogFields(context, {
					errorCode: error.code,
					status: error.status,
				}),
			});
		}
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

	console.error({
		event: "worker_request_failed",
		...requestLogFields(context, {
			errorName: safeErrorName(error),
			status: 500,
		}),
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

export type AppType = typeof apiRoutes;
export { ResearchWorkflow } from "./research-workflow";
export default app;
