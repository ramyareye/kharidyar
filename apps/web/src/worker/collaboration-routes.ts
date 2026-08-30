import {
	canManageMembershipRole,
	isMembershipRole,
	type MembershipRole,
} from "@kharidyar/domain";
import { Hono } from "hono";

import { readAuthRuntimeConfig } from "../auth/server";
import {
	loadCollectionAccess,
	loadWorkspaceAccess,
	requireCapability,
	type ResourceAccess,
} from "./authorization";
import { ApiError, badRequest, forbidden, notFound } from "./api-errors";
import {
	enforceCollaborationRateLimit,
	invitationAcceptanceRateLimit,
	invitationPreviewRateLimit,
} from "./collaboration-rate-limit";
import {
	createRawInvitationToken,
	hashInvitationToken,
	normalizeInvitationEmail,
	parseRawInvitationToken,
} from "./invitation-token";
import { requireTrustedOrigin } from "./origin-middleware";
import { readJsonObject, requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

const maximumInvitationCollections = 25;
const maximumInvitationLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1_000;

interface InvitationLookupRow {
	id: string;
	workspace_id: string;
	scope_type: "collections" | "workspace";
	role: MembershipRole;
	invited_email_normalized: string | null;
	email_restriction_enabled: number;
	expires_at: number;
	revoked_at: number | null;
	accepted_by_user_id: string | null;
}

interface InvitationPreviewRow extends InvitationLookupRow {
	inviter_name: string;
	workspace_name: string;
}

interface MembershipRow {
	role: unknown;
}

interface CreateInvitationInput {
	collectionIds: readonly string[];
	emailRestrictionEnabled: boolean;
	expiresAt: number;
	invitedEmailNormalized: string | null;
	role: MembershipRole;
	scopeType: "collections" | "workspace";
}

function edgeClientIp(request: Request): string {
	return request.headers.get("cf-connecting-ip")?.trim() || "local-preview";
}

function parseMembershipRole(value: unknown): MembershipRole {
	if (!isMembershipRole(value)) {
		throw badRequest("role is invalid.");
	}

	return value;
}

function parseInvitationCreation(
	body: Record<string, unknown>,
	now: number,
): CreateInvitationInput {
	const role = parseMembershipRole(body.role);
	if (typeof body.expiresAt !== "string") {
		throw badRequest("expiresAt must be an ISO date-time string.");
	}

	const expiresAt = Date.parse(body.expiresAt);
	if (!Number.isFinite(expiresAt) || expiresAt <= now) {
		throw badRequest("expiresAt must be in the future.");
	}
	if (expiresAt - now > maximumInvitationLifetimeMilliseconds) {
		throw badRequest("expiresAt cannot be more than 30 days in the future.");
	}

	if (
		body.scope === null ||
		typeof body.scope !== "object" ||
		Array.isArray(body.scope)
	) {
		throw badRequest("scope is invalid.");
	}
	const scope = body.scope as Record<string, unknown>;
	let scopeType: CreateInvitationInput["scopeType"];
	let collectionIds: readonly string[];

	if (scope.type === "workspace") {
		scopeType = "workspace";
		collectionIds = [];
	} else if (scope.type === "collections") {
		if (
			!Array.isArray(scope.collectionIds) ||
			scope.collectionIds.length === 0 ||
			scope.collectionIds.length > maximumInvitationCollections
		) {
			throw badRequest(
				`collectionIds must contain 1 to ${maximumInvitationCollections} Collections.`,
			);
		}

		const normalizedIds = scope.collectionIds.map((collectionId) =>
			requiredIdentifier(collectionId, "collectionId"),
		);
		if (new Set(normalizedIds).size !== normalizedIds.length) {
			throw badRequest("collectionIds cannot contain duplicates.");
		}
		scopeType = "collections";
		collectionIds = normalizedIds;
	} else {
		throw badRequest("scope.type must be workspace or collections.");
	}

	let invitedEmail: string | null = null;
	if (body.invitedEmail !== undefined && body.invitedEmail !== null) {
		if (typeof body.invitedEmail !== "string") {
			throw badRequest("invitedEmail must be a string.");
		}
		if (body.invitedEmail.trim() !== "") {
			invitedEmail = normalizeInvitationEmail(body.invitedEmail);
		}
	}

	if (
		body.restrictToEmail !== undefined &&
		typeof body.restrictToEmail !== "boolean"
	) {
		throw badRequest("restrictToEmail must be a boolean.");
	}
	const emailRestrictionEnabled =
		body.restrictToEmail === undefined
			? invitedEmail !== null
			: body.restrictToEmail;
	if (emailRestrictionEnabled && invitedEmail === null) {
		throw badRequest(
			"invitedEmail is required when restrictToEmail is enabled.",
		);
	}

	return {
		collectionIds,
		emailRestrictionEnabled,
		expiresAt,
		invitedEmailNormalized: emailRestrictionEnabled ? invitedEmail : null,
		role,
		scopeType,
	};
}

function assertCanManageRole(
	access: ResourceAccess,
	role: MembershipRole,
): void {
	if (!canManageMembershipRole(access.grants, access.target, role)) {
		throw forbidden(
			"Only a Workspace-scoped Owner may grant or remove Owner access.",
		);
	}
}

async function authorizeInvitationTargets(input: {
	actorUserId: string;
	collectionIds: readonly string[];
	database: D1Database;
	role: MembershipRole;
	scopeType: "collections" | "workspace";
	workspaceId: string;
}): Promise<void> {
	if (input.scopeType === "workspace") {
		const access = requireCapability(
			await loadWorkspaceAccess(
				input.database,
				input.actorUserId,
				input.workspaceId,
			),
			"invitations_manage",
		);
		assertCanManageRole(access, input.role);
		return;
	}

	for (const collectionId of input.collectionIds) {
		const access = requireCapability(
			await loadCollectionAccess(
				input.database,
				input.actorUserId,
				collectionId,
			),
			"invitations_manage",
		);
		if (access.target.workspaceId !== input.workspaceId) {
			throw notFound();
		}
		assertCanManageRole(access, input.role);
	}
}

async function invitationByHash(
	database: D1Database,
	tokenHash: string,
): Promise<InvitationLookupRow | null> {
	return database
		.prepare(
			`select
				i.id,
				i.workspace_id,
				i.scope_type,
				i.role,
				i.invited_email_normalized,
				i.email_restriction_enabled,
				i.expires_at,
				i.revoked_at,
				a.accepted_by_user_id
			from invitations i
			left join invitation_acceptances a on a.invitation_id = i.id
			where i.token_hash = ?`,
		)
		.bind(tokenHash)
		.first<InvitationLookupRow>();
}

async function invitationById(
	database: D1Database,
	invitationId: string,
	workspaceId: string,
): Promise<InvitationLookupRow | null> {
	return database
		.prepare(
			`select
				i.id,
				i.workspace_id,
				i.scope_type,
				i.role,
				i.invited_email_normalized,
				i.email_restriction_enabled,
				i.expires_at,
				i.revoked_at,
				a.accepted_by_user_id
			from invitations i
			left join invitation_acceptances a on a.invitation_id = i.id
			where i.id = ? and i.workspace_id = ?`,
		)
		.bind(invitationId, workspaceId)
		.first<InvitationLookupRow>();
}

function invitationAcceptanceError(
	invitation: InvitationLookupRow | null,
	input: {
		email: string;
		emailVerified: boolean;
		now: number;
		userId: string;
	},
): ApiError | null {
	if (invitation === null) {
		return new ApiError(
			404,
			"INVITATION_INVALID",
			"This invitation is invalid.",
		);
	}
	if (invitation.accepted_by_user_id !== null) {
		if (invitation.accepted_by_user_id === input.userId) {
			return null;
		}
		return new ApiError(
			409,
			"CONFLICT",
			"This invitation has already been accepted.",
		);
	}
	if (invitation.revoked_at !== null) {
		return new ApiError(
			409,
			"INVITATION_REVOKED",
			"This invitation has been revoked.",
		);
	}
	if (invitation.expires_at <= input.now) {
		return new ApiError(
			410,
			"INVITATION_EXPIRED",
			"This invitation has expired.",
		);
	}
	if (
		invitation.email_restriction_enabled === 1 &&
		(!input.emailVerified ||
			invitation.invited_email_normalized !== input.email.trim().toLowerCase())
	) {
		return new ApiError(
			403,
			"INVITATION_EMAIL_MISMATCH",
			"Sign in with the verified email address this invitation was created for.",
		);
	}

	return null;
}

function isAlreadyAcceptedBy(
	invitation: InvitationLookupRow | null,
	userId: string,
): boolean {
	return invitation?.accepted_by_user_id === userId;
}

async function acceptInvitationBatch(input: {
	database: D1Database;
	email: string;
	emailVerified: boolean;
	now: number;
	tokenHash: string;
	userId: string;
}): Promise<boolean> {
	const accepted = input.database
		.prepare(
			`insert into invitation_acceptances (
				invitation_id, accepted_by_user_id, accepted_at
			)
			select i.id, ?1, ?2
			from invitations i
			where i.token_hash = ?3
				and i.revoked_at is null
				and i.expires_at > ?2
				and not exists (
					select 1 from invitation_acceptances existing
					where existing.invitation_id = i.id
				)
				and (
					i.email_restriction_enabled = 0
					or (
						?4 = 1
						and i.invited_email_normalized = ?5
					)
				)`,
		)
		.bind(
			input.userId,
			input.now,
			input.tokenHash,
			input.emailVerified ? 1 : 0,
			input.email.trim().toLowerCase(),
		);

	const workspaceMembership = input.database
		.prepare(
			`insert into workspace_memberships (
				id, workspace_id, user_id, role, created_at, updated_at
			)
			select
				lower(hex(randomblob(16))),
				i.workspace_id,
				a.accepted_by_user_id,
				i.role,
				?1,
				?1
			from invitations i
			join invitation_acceptances a on a.invitation_id = i.id
			where i.token_hash = ?2
				and i.scope_type = 'workspace'
				and a.accepted_by_user_id = ?3
			on conflict(workspace_id, user_id) do update set
				role = case
					when (case excluded.role
						when 'viewer' then 1 when 'commenter' then 2
						when 'contributor' then 3 when 'editor' then 4
						when 'owner' then 5 end)
						> (case workspace_memberships.role
						when 'viewer' then 1 when 'commenter' then 2
						when 'contributor' then 3 when 'editor' then 4
						when 'owner' then 5 end)
					then excluded.role
					else workspace_memberships.role
				end,
				updated_at = excluded.updated_at`,
		)
		.bind(input.now, input.tokenHash, input.userId);

	const collectionMemberships = input.database
		.prepare(
			`insert into collection_memberships (
				id, collection_id, user_id, role, created_at, updated_at
			)
			select
				lower(hex(randomblob(16))),
				ic.collection_id,
				a.accepted_by_user_id,
				i.role,
				?1,
				?1
			from invitations i
			join invitation_acceptances a on a.invitation_id = i.id
			join invitation_collections ic on ic.invitation_id = i.id
			where i.token_hash = ?2
				and i.scope_type = 'collections'
				and a.accepted_by_user_id = ?3
			on conflict(collection_id, user_id) do update set
				role = case
					when (case excluded.role
						when 'viewer' then 1 when 'commenter' then 2
						when 'contributor' then 3 when 'editor' then 4
						when 'owner' then 5 end)
						> (case collection_memberships.role
						when 'viewer' then 1 when 'commenter' then 2
						when 'contributor' then 3 when 'editor' then 4
						when 'owner' then 5 end)
					then excluded.role
					else collection_memberships.role
				end,
				updated_at = excluded.updated_at`,
		)
		.bind(input.now, input.tokenHash, input.userId);

	const results = await input.database.batch([
		accepted,
		workspaceMembership,
		collectionMemberships,
	]);
	return results[0]?.meta.changes === 1;
}

function invitationCreationStatements(input: {
	actorUserId: string;
	collectionIds: readonly string[];
	database: D1Database;
	emailRestrictionEnabled: boolean;
	expiresAt: number;
	invitationId: string;
	invitedEmailNormalized: string | null;
	now: number;
	role: MembershipRole;
	scopeType: "collections" | "workspace";
	tokenHash: string;
	workspaceId: string;
}): D1PreparedStatement[] {
	const invitationValues = [
		input.invitationId,
		input.workspaceId,
		input.scopeType,
		input.role,
		input.tokenHash,
		input.invitedEmailNormalized,
		input.emailRestrictionEnabled ? 1 : 0,
		input.expiresAt,
		input.actorUserId,
		input.now,
		input.now,
	] as const;

	let invitationInsert: D1PreparedStatement;
	if (input.scopeType === "workspace") {
		invitationInsert = input.database
			.prepare(
				`insert into invitations (
					id, workspace_id, scope_type, role, token_hash,
					invited_email_normalized, email_restriction_enabled,
					expires_at, created_by_user_id, created_at, updated_at
				)
				select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				where exists (
					select 1 from workspace_memberships actor_membership
					where actor_membership.workspace_id = ?
						and actor_membership.user_id = ?
						and actor_membership.role = 'owner'
				)`,
			)
			.bind(...invitationValues, input.workspaceId, input.actorUserId);
	} else {
		const targetRows = input.collectionIds.map(() => "(?)").join(", ");
		invitationInsert = input.database
			.prepare(
				`with target(collection_id) as (values ${targetRows})
				insert into invitations (
					id, workspace_id, scope_type, role, token_hash,
					invited_email_normalized, email_restriction_enabled,
					expires_at, created_by_user_id, created_at, updated_at
				)
				select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
				where not exists (
					select 1
					from target
					left join collections c
						on c.id = target.collection_id and c.workspace_id = ?
					where c.id is null
						or not (
							exists (
								select 1 from workspace_memberships actor_workspace
								where actor_workspace.workspace_id = c.workspace_id
									and actor_workspace.user_id = ?
									and actor_workspace.role = 'owner'
							)
							or (
								? <> 'owner'
								and exists (
									select 1 from collection_memberships actor_collection
									where actor_collection.collection_id = c.id
										and actor_collection.user_id = ?
										and actor_collection.role = 'owner'
								)
							)
						)
				)`,
			)
			.bind(
				...input.collectionIds,
				...invitationValues,
				input.workspaceId,
				input.actorUserId,
				input.role,
				input.actorUserId,
			);
	}

	return [
		invitationInsert,
		...input.collectionIds.map((collectionId) =>
			input.database
				.prepare(
					`insert into invitation_collections (
						invitation_id, workspace_id, collection_id, created_at
					)
					select i.id, i.workspace_id, ?, ?
					from invitations i
					where i.id = ?`,
				)
				.bind(collectionId, input.now, input.invitationId),
		),
	];
}

async function invitationCollections(
	database: D1Database,
	invitationId: string,
): Promise<readonly string[]> {
	const result = await database
		.prepare(
			`select collection_id
			from invitation_collections
			where invitation_id = ?
			order by collection_id`,
		)
		.bind(invitationId)
		.all<{ collection_id: string }>();
	return result.results.map((row) => row.collection_id);
}

async function authorizeExistingInvitation(input: {
	actorUserId: string;
	database: D1Database;
	invitation: InvitationLookupRow;
}): Promise<void> {
	const collectionIds =
		input.invitation.scope_type === "collections"
			? await invitationCollections(input.database, input.invitation.id)
			: [];
	if (
		input.invitation.scope_type === "collections" &&
		collectionIds.length === 0
	) {
		throw notFound();
	}

	await authorizeInvitationTargets({
		actorUserId: input.actorUserId,
		collectionIds,
		database: input.database,
		role: input.invitation.role,
		scopeType: input.invitation.scope_type,
		workspaceId: input.invitation.workspace_id,
	});
}

async function targetMembership(
	database: D1Database,
	scope: { collectionId?: string; workspaceId?: string },
	userId: string,
): Promise<MembershipRole | null> {
	const statement =
		scope.collectionId === undefined
			? database
					.prepare(
						"select role from workspace_memberships where workspace_id = ? and user_id = ?",
					)
					.bind(scope.workspaceId, userId)
			: database
					.prepare(
						"select role from collection_memberships where collection_id = ? and user_id = ?",
					)
					.bind(scope.collectionId, userId);
	const row = await statement.first<MembershipRow>();
	if (row === null) {
		return null;
	}
	if (!isMembershipRole(row.role)) {
		throw new Error("Stored membership role is invalid");
	}
	return row.role;
}

export const collaborationRoutes = new Hono<WorkerAppEnv>();

collaborationRoutes.use("*", async (context, next) => {
	context.header("cache-control", "no-store");
	await next();
});

collaborationRoutes.post("/invitations/preview", async (context) => {
	const body = await readJsonObject(context.req.raw);
	const now = Date.now();
	await enforceCollaborationRateLimit({
		action: "invitation_preview",
		database: context.env.DB,
		identity: edgeClientIp(context.req.raw),
		limit: invitationPreviewRateLimit.limit,
		now,
		secret: context.env.BETTER_AUTH_SECRET,
		windowMilliseconds: invitationPreviewRateLimit.windowMilliseconds,
	});

	const token = parseRawInvitationToken(body.token);
	const tokenHash = await hashInvitationToken(token);
	const invitation = await context.env.DB.prepare(
		`select
				i.id,
				i.workspace_id,
				i.scope_type,
				i.role,
				i.invited_email_normalized,
				i.email_restriction_enabled,
				i.expires_at,
				i.revoked_at,
				a.accepted_by_user_id,
				u.name as inviter_name,
				w.name as workspace_name
			from invitations i
			join user u on u.id = i.created_by_user_id
			join workspaces w on w.id = i.workspace_id
			left join invitation_acceptances a on a.invitation_id = i.id
			where i.token_hash = ?`,
	)
		.bind(tokenHash)
		.first<InvitationPreviewRow>();

	if (
		invitation === null ||
		invitation.revoked_at !== null ||
		invitation.expires_at <= now ||
		invitation.accepted_by_user_id !== null
	) {
		throw new ApiError(
			404,
			"INVITATION_INVALID",
			"This invitation is invalid.",
		);
	}

	let scopes: { name: string; type: "collection" | "workspace" }[];
	if (invitation.scope_type === "workspace") {
		scopes = [{ name: invitation.workspace_name, type: "workspace" }];
	} else {
		const selected = await context.env.DB.prepare(
			`select c.name
				from invitation_collections ic
				join collections c on c.id = ic.collection_id
				where ic.invitation_id = ?
				order by c.name`,
		)
			.bind(invitation.id)
			.all<{ name: string }>();
		if (selected.results.length === 0) {
			throw new ApiError(
				404,
				"INVITATION_INVALID",
				"This invitation is invalid.",
			);
		}
		scopes = selected.results.map(({ name }) => ({ name, type: "collection" }));
	}

	return context.json({
		invitation: {
			expiresAt: new Date(invitation.expires_at).toISOString(),
			inviterDisplayName: invitation.inviter_name,
			role: invitation.role,
			scopeType: invitation.scope_type,
			scopes,
		},
	});
});

collaborationRoutes.post(
	"/invitations/accept",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const current = context.get("session");
		const body = await readJsonObject(context.req.raw);
		const now = Date.now();
		await enforceCollaborationRateLimit({
			action: "invitation_acceptance",
			database: context.env.DB,
			identity: `${current.user.id}:${edgeClientIp(context.req.raw)}`,
			limit: invitationAcceptanceRateLimit.limit,
			now,
			secret: context.env.BETTER_AUTH_SECRET,
			windowMilliseconds: invitationAcceptanceRateLimit.windowMilliseconds,
		});

		const token = parseRawInvitationToken(body.token);
		const tokenHash = await hashInvitationToken(token);
		let invitation = await invitationByHash(context.env.DB, tokenHash);
		const validationError = invitationAcceptanceError(invitation, {
			email: current.user.email,
			emailVerified: current.user.emailVerified,
			now,
			userId: current.user.id,
		});
		if (isAlreadyAcceptedBy(invitation, current.user.id)) {
			return context.json({ accepted: true, alreadyAccepted: true });
		}
		if (validationError !== null) {
			throw validationError;
		}

		try {
			const didAccept = await acceptInvitationBatch({
				database: context.env.DB,
				email: current.user.email,
				emailVerified: current.user.emailVerified,
				now,
				tokenHash,
				userId: current.user.id,
			});
			if (didAccept) {
				return context.json({ accepted: true, alreadyAccepted: false });
			}
		} catch (error) {
			invitation = await invitationByHash(context.env.DB, tokenHash);
			if (isAlreadyAcceptedBy(invitation, current.user.id)) {
				return context.json({ accepted: true, alreadyAccepted: true });
			}
			throw error;
		}

		invitation = await invitationByHash(context.env.DB, tokenHash);
		if (isAlreadyAcceptedBy(invitation, current.user.id)) {
			return context.json({ accepted: true, alreadyAccepted: true });
		}
		throw (
			invitationAcceptanceError(invitation, {
				email: current.user.email,
				emailVerified: current.user.emailVerified,
				now,
				userId: current.user.id,
			}) ??
			new ApiError(409, "CONFLICT", "The invitation could not be accepted.")
		);
	},
);

collaborationRoutes.post(
	"/workspaces/:workspaceId/invitations",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const workspaceId = requiredIdentifier(
			context.req.param("workspaceId"),
			"workspaceId",
		);
		const current = context.get("session");
		const body = await readJsonObject(context.req.raw);
		const now = Date.now();
		const input = parseInvitationCreation(body, now);

		await authorizeInvitationTargets({
			actorUserId: current.user.id,
			collectionIds: input.collectionIds,
			database: context.env.DB,
			role: input.role,
			scopeType: input.scopeType,
			workspaceId,
		});

		const invitationId = crypto.randomUUID();
		const rawToken = createRawInvitationToken();
		const tokenHash = await hashInvitationToken(rawToken);
		const results = await context.env.DB.batch(
			invitationCreationStatements({
				actorUserId: current.user.id,
				collectionIds: input.collectionIds,
				database: context.env.DB,
				emailRestrictionEnabled: input.emailRestrictionEnabled,
				expiresAt: input.expiresAt,
				invitationId,
				invitedEmailNormalized: input.invitedEmailNormalized,
				now,
				role: input.role,
				scopeType: input.scopeType,
				tokenHash,
				workspaceId,
			}),
		);
		if (results[0]?.meta.changes !== 1) {
			throw forbidden("Your invitation permissions changed. Please retry.");
		}

		const invitationUrl = new URL(
			"/invite",
			readAuthRuntimeConfig(context.env).baseURL,
		);
		invitationUrl.hash = `token=${rawToken}`;

		return context.json(
			{
				invitation: {
					emailRestrictionEnabled: input.emailRestrictionEnabled,
					expiresAt: new Date(input.expiresAt).toISOString(),
					id: invitationId,
					role: input.role,
					scopeType: input.scopeType,
					url: invitationUrl.toString(),
				},
			},
			201,
		);
	},
);

collaborationRoutes.post(
	"/workspaces/:workspaceId/invitations/:invitationId/revoke",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const workspaceId = requiredIdentifier(
			context.req.param("workspaceId"),
			"workspaceId",
		);
		const invitationId = requiredIdentifier(
			context.req.param("invitationId"),
			"invitationId",
		);
		const current = context.get("session");
		let invitation = await invitationById(
			context.env.DB,
			invitationId,
			workspaceId,
		);
		if (invitation === null) {
			throw notFound();
		}

		await authorizeExistingInvitation({
			actorUserId: current.user.id,
			database: context.env.DB,
			invitation,
		});
		if (invitation.accepted_by_user_id !== null) {
			throw new ApiError(
				409,
				"CONFLICT",
				"An accepted invitation cannot be revoked.",
			);
		}
		if (invitation.revoked_at !== null) {
			return context.json({ revoked: true, alreadyRevoked: true });
		}

		const now = Date.now();
		const result = await context.env.DB.prepare(
			`update invitations
					set revoked_at = ?1, revoked_by_user_id = ?2, updated_at = ?1
					where id = ?3
						and revoked_at is null
						and not exists (
							select 1 from invitation_acceptances a
							where a.invitation_id = invitations.id
						)
						and (
							exists (
								select 1 from workspace_memberships actor_workspace
								where actor_workspace.workspace_id = invitations.workspace_id
									and actor_workspace.user_id = ?2
									and actor_workspace.role = 'owner'
							)
							or (
								invitations.role <> 'owner'
								and invitations.scope_type = 'collections'
								and exists (
									select 1 from invitation_collections target
									where target.invitation_id = invitations.id
								)
								and not exists (
									select 1 from invitation_collections target
									where target.invitation_id = invitations.id
										and not exists (
											select 1 from collection_memberships actor_collection
											where actor_collection.collection_id = target.collection_id
												and actor_collection.user_id = ?2
												and actor_collection.role = 'owner'
										)
								)
							)
						)`,
		)
			.bind(now, current.user.id, invitationId)
			.run();
		if (result.meta.changes === 1) {
			return context.json({ revoked: true, alreadyRevoked: false });
		}

		invitation = await invitationById(
			context.env.DB,
			invitationId,
			workspaceId,
		);
		if (invitation?.accepted_by_user_id != null) {
			throw new ApiError(
				409,
				"CONFLICT",
				"An accepted invitation cannot be revoked.",
			);
		}
		if (invitation === null) {
			throw notFound();
		}
		await authorizeExistingInvitation({
			actorUserId: current.user.id,
			database: context.env.DB,
			invitation,
		});
		return context.json({ revoked: true, alreadyRevoked: true });
	},
);

collaborationRoutes.patch(
	"/workspaces/:workspaceId/members/:userId",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const workspaceId = requiredIdentifier(
			context.req.param("workspaceId"),
			"workspaceId",
		);
		const targetUserId = requiredIdentifier(
			context.req.param("userId"),
			"userId",
		);
		const role = parseMembershipRole(
			(await readJsonObject(context.req.raw)).role,
		);
		const current = context.get("session");
		const access = requireCapability(
			await loadWorkspaceAccess(context.env.DB, current.user.id, workspaceId),
			"members_manage_non_owner",
		);
		const existingRole = await targetMembership(
			context.env.DB,
			{ workspaceId },
			targetUserId,
		);
		if (existingRole === null) {
			throw notFound("The Workspace membership was not found.");
		}
		assertCanManageRole(access, existingRole);
		assertCanManageRole(access, role);

		const now = Date.now();
		const result = await context.env.DB.prepare(
			`update workspace_memberships
					set role = ?1, updated_at = ?2
					where workspace_id = ?3 and user_id = ?4
						and exists (
							select 1 from workspace_memberships actor_membership
							where actor_membership.workspace_id = ?3
								and actor_membership.user_id = ?5
								and actor_membership.role = 'owner'
						)
						and (
						role <> 'owner'
						or ?1 = 'owner'
						or (
							select count(*) from workspace_memberships owners
							where owners.workspace_id = ?3 and owners.role = 'owner'
						) > 1
					)`,
		)
			.bind(role, now, workspaceId, targetUserId, current.user.id)
			.run();
		if (result.meta.changes !== 1) {
			const refreshedAccess = requireCapability(
				await loadWorkspaceAccess(context.env.DB, current.user.id, workspaceId),
				"members_manage_non_owner",
			);
			const refreshedRole = await targetMembership(
				context.env.DB,
				{ workspaceId },
				targetUserId,
			);
			if (refreshedRole === null) {
				throw notFound("The Workspace membership was not found.");
			}
			assertCanManageRole(refreshedAccess, refreshedRole);
			assertCanManageRole(refreshedAccess, role);
			throw new ApiError(
				409,
				"CONFLICT",
				"A Workspace must keep at least one Workspace-scoped Owner.",
			);
		}

		return context.json({ membership: { role, userId: targetUserId } });
	},
);

collaborationRoutes.delete(
	"/workspaces/:workspaceId/members/:userId",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const workspaceId = requiredIdentifier(
			context.req.param("workspaceId"),
			"workspaceId",
		);
		const targetUserId = requiredIdentifier(
			context.req.param("userId"),
			"userId",
		);
		const current = context.get("session");
		const access = requireCapability(
			await loadWorkspaceAccess(context.env.DB, current.user.id, workspaceId),
			"members_manage_non_owner",
		);
		const existingRole = await targetMembership(
			context.env.DB,
			{ workspaceId },
			targetUserId,
		);
		if (existingRole === null) {
			throw notFound("The Workspace membership was not found.");
		}
		assertCanManageRole(access, existingRole);

		const result = await context.env.DB.prepare(
			`delete from workspace_memberships
					where workspace_id = ?1 and user_id = ?2
						and exists (
							select 1 from workspace_memberships actor_membership
							where actor_membership.workspace_id = ?1
								and actor_membership.user_id = ?3
								and actor_membership.role = 'owner'
						)
						and (
						role <> 'owner'
						or (
							select count(*) from workspace_memberships owners
							where owners.workspace_id = ?1 and owners.role = 'owner'
						) > 1
					)`,
		)
			.bind(workspaceId, targetUserId, current.user.id)
			.run();
		if (result.meta.changes !== 1) {
			const refreshedAccess = requireCapability(
				await loadWorkspaceAccess(context.env.DB, current.user.id, workspaceId),
				"members_manage_non_owner",
			);
			const refreshedRole = await targetMembership(
				context.env.DB,
				{ workspaceId },
				targetUserId,
			);
			if (refreshedRole === null) {
				throw notFound("The Workspace membership was not found.");
			}
			assertCanManageRole(refreshedAccess, refreshedRole);
			throw new ApiError(
				409,
				"CONFLICT",
				"A Workspace must keep at least one Workspace-scoped Owner.",
			);
		}

		return context.json({ removed: true });
	},
);

collaborationRoutes.patch(
	"/collections/:collectionId/members/:userId",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const collectionId = requiredIdentifier(
			context.req.param("collectionId"),
			"collectionId",
		);
		const targetUserId = requiredIdentifier(
			context.req.param("userId"),
			"userId",
		);
		const role = parseMembershipRole(
			(await readJsonObject(context.req.raw)).role,
		);
		const current = context.get("session");
		const access = requireCapability(
			await loadCollectionAccess(context.env.DB, current.user.id, collectionId),
			"members_manage_non_owner",
		);
		const existingRole = await targetMembership(
			context.env.DB,
			{ collectionId },
			targetUserId,
		);
		if (existingRole === null) {
			throw notFound("The Collection membership was not found.");
		}
		assertCanManageRole(access, existingRole);
		assertCanManageRole(access, role);

		const result = await context.env.DB.prepare(
			`update collection_memberships
				set role = ?1, updated_at = ?2
				where collection_id = ?3 and user_id = ?4
					and (
						exists (
							select 1
							from collections c
							join workspace_memberships actor_workspace
								on actor_workspace.workspace_id = c.workspace_id
							where c.id = ?3
								and actor_workspace.user_id = ?5
								and actor_workspace.role = 'owner'
						)
						or (
							collection_memberships.role <> 'owner'
							and ?1 <> 'owner'
							and exists (
								select 1 from collection_memberships actor_collection
								where actor_collection.collection_id = ?3
									and actor_collection.user_id = ?5
									and actor_collection.role = 'owner'
							)
						)
					)`,
		)
			.bind(role, Date.now(), collectionId, targetUserId, current.user.id)
			.run();
		if (result.meta.changes !== 1) {
			const refreshedAccess = requireCapability(
				await loadCollectionAccess(
					context.env.DB,
					current.user.id,
					collectionId,
				),
				"members_manage_non_owner",
			);
			const refreshedRole = await targetMembership(
				context.env.DB,
				{ collectionId },
				targetUserId,
			);
			if (refreshedRole === null) {
				throw notFound("The Collection membership was not found.");
			}
			assertCanManageRole(refreshedAccess, refreshedRole);
			assertCanManageRole(refreshedAccess, role);
			throw new ApiError(
				409,
				"CONFLICT",
				"The membership changed. Please retry.",
			);
		}
		return context.json({ membership: { role, userId: targetUserId } });
	},
);

collaborationRoutes.delete(
	"/collections/:collectionId/members/:userId",
	requireTrustedOrigin,
	requireSession,
	async (context) => {
		const collectionId = requiredIdentifier(
			context.req.param("collectionId"),
			"collectionId",
		);
		const targetUserId = requiredIdentifier(
			context.req.param("userId"),
			"userId",
		);
		const current = context.get("session");
		const access = requireCapability(
			await loadCollectionAccess(context.env.DB, current.user.id, collectionId),
			"members_manage_non_owner",
		);
		const existingRole = await targetMembership(
			context.env.DB,
			{ collectionId },
			targetUserId,
		);
		if (existingRole === null) {
			throw notFound("The Collection membership was not found.");
		}
		assertCanManageRole(access, existingRole);

		const result = await context.env.DB.prepare(
			`delete from collection_memberships
				where collection_id = ?1 and user_id = ?2
					and (
						exists (
							select 1
							from collections c
							join workspace_memberships actor_workspace
								on actor_workspace.workspace_id = c.workspace_id
							where c.id = ?1
								and actor_workspace.user_id = ?3
								and actor_workspace.role = 'owner'
						)
						or (
							collection_memberships.role <> 'owner'
							and exists (
								select 1 from collection_memberships actor_collection
								where actor_collection.collection_id = ?1
									and actor_collection.user_id = ?3
									and actor_collection.role = 'owner'
							)
						)
					)`,
		)
			.bind(collectionId, targetUserId, current.user.id)
			.run();
		if (result.meta.changes !== 1) {
			const refreshedAccess = requireCapability(
				await loadCollectionAccess(
					context.env.DB,
					current.user.id,
					collectionId,
				),
				"members_manage_non_owner",
			);
			const refreshedRole = await targetMembership(
				context.env.DB,
				{ collectionId },
				targetUserId,
			);
			if (refreshedRole === null) {
				throw notFound("The Collection membership was not found.");
			}
			assertCanManageRole(refreshedAccess, refreshedRole);
			throw new ApiError(
				409,
				"CONFLICT",
				"The membership changed. Please retry.",
			);
		}
		return context.json({ removed: true });
	},
);
