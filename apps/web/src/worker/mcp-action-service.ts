import { requireActiveWriteGrant } from "./mcp-write-grant";
import {
	mcpActionReceiptSchema,
	type McpActionReceipt,
} from "@kharidyar/contracts";
import { z } from "zod";
import { mcpWriteScope } from "../auth/mcp-options";
import { ApiError, conflict, notFound } from "./api-errors";
import {
	actionTarget,
	findMcpAction,
	type ActionContext,
} from "./mcp-action-catalog";
import { readWorkspace } from "./core-workspace-service";
import type { McpActor } from "./mcp-auth-service";

const lifetime = 10 * 60_000;
const maximumBytes = 96_000;
export const operationIdSchema = z
	.string()
	.min(8)
	.max(100)
	.regex(/^[A-Za-z0-9_-]+$/);
interface ActionRow {
	id: string;
	user_id: string;
	client_id: string;
	session_id: string;
	access_token_id: string;
	operation_id: string;
	operation: string;
	input_hash: string;
	arguments_json: string | null;
	target_json: string | null;
	status: McpActionReceipt["status"];
	result_json: string | null;
	error_code: string | null;
	created_at: number;
	expires_at: number;
	started_at: number | null;
	finished_at: number | null;
}
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, canonical(v)]),
		);
	return value;
}
async function digest(value: unknown) {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify(canonical(value))),
	);
	return Array.from(new Uint8Array(bytes), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}
function stripAvatars(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripAvatars);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [
				k,
				k === "image" ? null : stripAvatars(v),
			]),
		);
	return value;
}
function actorFor(row: ActionRow): McpActor {
	return {
		userId: row.user_id,
		clientId: row.client_id,
		sessionId: row.session_id,
		accessTokenId: row.access_token_id,
		scopes: ["wantkit:read", mcpWriteScope],
	};
}
function receipt(env: Env, row: ActionRow): McpActionReceipt {
	const status =
		row.status === "pending" && row.expires_at <= Date.now()
			? "expired"
			: row.status === "running" &&
				  row.started_at !== null &&
				  row.started_at < Date.now() - 5 * 60_000
				? "unknown"
				: row.status;
	const messages: Record<McpActionReceipt["status"], string> = {
		pending:
			"Awaiting the user's approval in WantKit. No change has been applied.",
		running:
			"This operation is being processed. Check this receipt; do not create another operation ID.",
		succeeded:
			"Applied successfully. Repeated calls with this operation ID do not run it again.",
		failed:
			"This operation did not complete. Review the current records before requesting another change.",
		denied: "The user declined this operation. No change was applied.",
		expired:
			"This approval expired without applying the operation. Start a new request if still wanted.",
		unknown:
			"The result is uncertain. Inspect the current records and this receipt before any new request; automatic retry is blocked.",
	};
	return mcpActionReceiptSchema.parse({
		id: row.id,
		operation: row.operation,
		status,
		approvalUrl:
			status === "pending"
				? `${env.BETTER_AUTH_URL}/connectors/actions/${row.id}`
				: null,
		expiresAt: new Date(row.expires_at).toISOString(),
		message: messages[status] + (row.error_code ? ` (${row.error_code})` : ""),
		result:
			row.created_at >= Date.now() - 24 * 60 * 60_000 && row.result_json
				? JSON.parse(row.result_json)
				: null,
	});
}
async function rowById(env: Env, id: string, userId: string) {
	const row = await env.DB.prepare(
		"select * from mcp_actions where id=? and user_id=?",
	)
		.bind(id, userId)
		.first<ActionRow>();
	if (!row) throw notFound();
	return row;
}
async function requireCreatedWorkspaceAccess(
	ctx: ActionContext,
	row: ActionRow,
) {
	if (
		row.operation !== "create_workspace" ||
		!row.result_json ||
		row.created_at < Date.now() - 24 * 3600000
	)
		return;
	const workspace = z
		.object({ id: z.string() })
		.safeParse(JSON.parse(row.result_json));
	if (workspace.success)
		await readWorkspace({
			database: ctx.env.DB,
			userId: ctx.actor.userId,
			workspaceId: workspace.data.id,
		});
}
async function targetFor(ctx: ActionContext, row: ActionRow) {
	await requireCreatedWorkspaceAccess(ctx, row);
	const definition = findMcpAction(row.operation);
	if (!row.arguments_json)
		throw conflict(
			"This action's detailed record has expired. Inspect current records; do not retry it automatically.",
		);
	const args = definition.parse(JSON.parse(row.arguments_json));
	const target = await actionTarget(ctx, definition, args);
	return {
		args,
		target: { name: target.name, version: await digest(target.version) },
		definition,
	};
}
async function execute(ctx: ActionContext, row: ActionRow) {
	await requireActiveWriteGrant(ctx.env, ctx.actor);
	const { args, target, definition } = await targetFor(ctx, row);
	if (row.target_json !== JSON.stringify(target)) {
		await ctx.env.DB.prepare(
			"update mcp_actions set status='failed',error_code='CONFLICT',finished_at=? where id=? and status='pending'",
		)
			.bind(Date.now(), row.id)
			.run();
		throw conflict(
			"The target changed since this request was prepared. Review a fresh request.",
		);
	}
	const claimed = await ctx.env.DB.prepare(
		`update mcp_actions set status='running',started_at=?1
    where id=?2 and status='pending' and expires_at>?1`,
	)
		.bind(Date.now(), row.id)
		.run();
	if (claimed.meta.changes !== 1)
		return receipt(ctx.env, await rowById(ctx.env, row.id, ctx.actor.userId));
	try {
		// This is an at-most-once attempt, not a cross-service transaction. If a
		// process dies after a write, the running receipt blocks automatic replay.
		const result = stripAvatars(await definition.run(ctx, args)) ?? null;
		let json = JSON.stringify(result);
		if (new TextEncoder().encode(json).byteLength > maximumBytes)
			json = JSON.stringify({
				notice:
					"Applied. Read the affected records for details; the response exceeded the receipt limit.",
			});
		await ctx.env.DB.prepare(
			"update mcp_actions set status='succeeded',result_json=?,finished_at=? where id=? and status='running'",
		)
			.bind(json, Date.now(), row.id)
			.run();
	} catch (error) {
		// Services can have several steps; never claim rollback or auto-retry.
		await ctx.env.DB.prepare(
			"update mcp_actions set status=?,error_code=?,finished_at=? where id=? and status='running'",
		)
			.bind(
				error instanceof ApiError ? "failed" : "unknown",
				error instanceof ApiError ? error.code : "OUTCOME_UNCERTAIN",
				Date.now(),
				row.id,
			)
			.run();
	}
	return receipt(ctx.env, await rowById(ctx.env, row.id, ctx.actor.userId));
}
export async function requestMcpAction(
	ctx: ActionContext,
	name: string,
	operationId: string,
	input: unknown,
) {
	const grantExpiresAt = await requireActiveWriteGrant(ctx.env, ctx.actor);
	operationIdSchema.parse(operationId);
	const definition = findMcpAction(name);
	const args = definition.parse(input);
	const hash = await digest({ name, args });
	const old = await ctx.env.DB.prepare(
		"select * from mcp_actions where user_id=? and client_id=? and operation_id=?",
	)
		.bind(ctx.actor.userId, ctx.actor.clientId, operationId)
		.first<ActionRow>();
	if (old) {
		if (old.input_hash !== hash)
			throw conflict(
				"This operation ID already belongs to different inputs. Do not reuse it for a different change.",
			);
		// Do not return saved private data after the actor loses resource access.
		await actionTarget(ctx, definition, args);
		await requireCreatedWorkspaceAccess(ctx, old);
		return receipt(ctx.env, old);
	}
	const rawTarget = await actionTarget(ctx, definition, args);
	const target = {
		name: rawTarget.name,
		version: await digest(rawTarget.version),
	};
	const now = Date.now();
	const id = crypto.randomUUID();
	// Retain metadata/idempotency keys, but erase detailed inputs/results after
	// 24 hours on the next new action. Read paths also mask expired details.
	await ctx.env.DB.prepare(
		"update mcp_actions set arguments_json=null,target_json=null,result_json=null where user_id=? and created_at<? and arguments_json is not null",
	)
		.bind(ctx.actor.userId, now - 24 * 60 * 60_000)
		.run();
	await ctx.env.DB.prepare(
		`insert into mcp_actions(id,user_id,client_id,session_id,access_token_id,operation_id,operation,input_hash,arguments_json,target_json,status,created_at,expires_at)
    values(?,?,?,?,?,?,?,?,?,?,'pending',?,?) on conflict(user_id,client_id,operation_id) do nothing`,
	)
		.bind(
			id,
			ctx.actor.userId,
			ctx.actor.clientId,
			ctx.actor.sessionId,
			ctx.actor.accessTokenId,
			operationId,
			name,
			hash,
			JSON.stringify(args),
			JSON.stringify(target),
			now,
			Math.min(now + lifetime, grantExpiresAt),
		)
		.run();
	const row = await ctx.env.DB.prepare(
		"select * from mcp_actions where user_id=? and client_id=? and operation_id=?",
	)
		.bind(ctx.actor.userId, ctx.actor.clientId, operationId)
		.first<ActionRow>();
	if (!row || row.input_hash !== hash)
		throw conflict(
			"An operation with this ID already exists with different inputs.",
		);
	if (row.id !== id) return receipt(ctx.env, row);
	return definition.requiresConfirmation(args) || rawTarget.confirmationRequired
		? receipt(ctx.env, row)
		: execute(ctx, row);
}
export async function readMcpAction(ctx: ActionContext, id: string) {
	const row = await rowById(ctx.env, id, ctx.actor.userId);
	if (row.client_id !== ctx.actor.clientId) throw notFound();
	if (row.created_at < Date.now() - 24 * 60 * 60_000)
		return receipt(ctx.env, { ...row, result_json: null });
	await targetFor(ctx, row);
	return receipt(ctx.env, row);
}
export async function reviewMcpAction(env: Env, userId: string, id: string) {
	const row = await rowById(env, id, userId);
	if (row.created_at < Date.now() - 24 * 60 * 60_000) throw notFound();
	const ctx = { env, actor: actorFor(row) };
	await requireActiveWriteGrant(env, ctx.actor);
	const { definition, target, args } = await targetFor(ctx, row);
	return {
		receipt: receipt(env, row),
		title: definition.title,
		target: target.name,
		arguments: args,
		canApprove:
			row.status === "pending" &&
			row.expires_at > Date.now() &&
			row.target_json === JSON.stringify(target),
	};
}
export async function decideMcpAction(
	env: Env,
	userId: string,
	id: string,
	approve: boolean,
	headers: Headers,
) {
	const row = await rowById(env, id, userId);
	const ctx = { env, actor: actorFor(row), approvalHeaders: headers };
	await requireActiveWriteGrant(env, ctx.actor);
	if (!approve) {
		if (row.status !== "pending") return readMcpAction(ctx, row.id);
		await env.DB.prepare(
			"update mcp_actions set status='denied',finished_at=? where id=? and status='pending' and expires_at>?",
		)
			.bind(Date.now(), id, Date.now())
			.run();
		return receipt(env, await rowById(env, id, userId));
	}
	if (row.status !== "pending") return readMcpAction(ctx, row.id);
	return execute(ctx, row);
}
