import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { WorkerAppEnv } from "./session-middleware";

const apiContentSecurityPolicy = [
	"default-src 'none'",
	"base-uri 'none'",
	"frame-ancestors 'none'",
	"form-action 'none'",
].join("; ");

const securityHeaders = {
	"content-security-policy": apiContentSecurityPolicy,
	"permissions-policy":
		"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"x-xss-protection": "0",
} as const;

type SafeLogFields = Record<
	string,
	boolean | null | number | string | undefined
>;

const resourceFieldBySegment = {
	collections: "collectionId",
	"context-snapshots": "contextSnapshotId",
	invitations: "invitationId",
	items: "itemId",
	"research-requests": "researchRequestId",
	"research-runs": "researchRunId",
	workspaces: "workspaceId",
} as const;

function safePathIdentifier(value: string | undefined): string | undefined {
	return value !== undefined && /^[A-Za-z0-9_-]{1,200}$/.test(value)
		? value
		: undefined;
}

function pathResourceFields(path: string): SafeLogFields {
	const segments = path.split("/");
	const fields: SafeLogFields = {};
	for (let index = 0; index < segments.length - 1; index += 1) {
		const field =
			resourceFieldBySegment[
				segments[index] as keyof typeof resourceFieldBySegment
			];
		const identifier = safePathIdentifier(segments[index + 1]);
		if (field !== undefined && identifier !== undefined) {
			fields[field] = identifier;
		}
	}
	return fields;
}

export function requestLogFields(
	context: Context<WorkerAppEnv>,
	additional: SafeLogFields = {},
): SafeLogFields {
	return {
		requestId: context.get("requestId"),
		actorId: context.get("actorId"),
		method: context.req.method,
		route: context.req.routePath || "unmatched",
		...pathResourceFields(context.req.path),
		...additional,
	};
}

export function safeErrorName(error: unknown): string {
	if (!(error instanceof Error)) return "UnknownError";
	return /^[A-Za-z][A-Za-z0-9._-]{0,79}$/.test(error.name)
		? error.name
		: "Error";
}

export const protectApiResponse = createMiddleware<WorkerAppEnv>(
	async (context, next) => {
		const requestId = crypto.randomUUID();
		context.set("requestId", requestId);
		await next();

		context.header("x-request-id", requestId);
		for (const [name, value] of Object.entries(securityHeaders)) {
			if (!context.res.headers.has(name)) context.header(name, value);
		}
		if (!context.res.headers.has("cache-control")) {
			context.header("cache-control", "no-store");
		}
	},
);
