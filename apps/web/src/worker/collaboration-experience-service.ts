import type {
	CollaborationInvitation,
	CollaborationMember,
	CommentInput,
	CommentResolutionInput,
	CommentResource,
	ItemDiscussionResponse,
	WorkspaceCollaborationResponse,
} from "@kharidyar/contracts";
import {
	hasCapability,
	isMembershipRole,
	type Capability,
	type MembershipRole,
} from "@kharidyar/domain";

import { forbidden, notFound, resourceArchived } from "./api-errors";
import {
	loadCollectionAccess,
	requireCapability,
	type ResourceAccess,
} from "./authorization";

interface WorkspaceAccessRow {
	id: string;
	name: string;
	is_workspace_owner: number;
}

interface ManagedCollectionRow {
	id: string;
	name: string;
}

interface MemberRow {
	id: string;
	user_id: string;
	user_name: string;
	user_email: string;
	user_image: string | null;
	role: unknown;
	scope_type: "collection" | "workspace";
	collection_id: string | null;
	collection_name: string | null;
	created_at: number;
	updated_at: number;
}

interface InvitationAdminRow {
	id: string;
	role: unknown;
	scope_type: "collections" | "workspace";
	invited_email_normalized: string | null;
	email_restriction_enabled: number;
	expires_at: number;
	revoked_at: number | null;
	created_at: number;
	created_by_user_id: string;
	created_by_name: string;
	created_by_image: string | null;
	accepted_by_user_id: string | null;
	accepted_by_name: string | null;
	accepted_by_image: string | null;
}

interface InvitationCollectionRow {
	invitation_id: string;
	collection_id: string;
	collection_name: string;
}

interface DiscussionContextRow {
	id: string;
	title: string;
	workspace_id: string;
	collection_id: string;
	archived_at: number | null;
	collection_archived_at: number | null;
	workspace_archived_at: number | null;
}

interface DiscussionContext {
	access: ResourceAccess;
	item: DiscussionContextRow;
}

interface CommentRow {
	id: string;
	item_id: string;
	candidate_id: string | null;
	body: string | null;
	author_user_id: string;
	author_name: string;
	author_image: string | null;
	resolved_at: number | null;
	resolved_by_user_id: string | null;
	resolved_by_name: string | null;
	resolved_by_image: string | null;
	removed_at: number | null;
	removed_by_user_id: string | null;
	removed_by_name: string | null;
	removed_by_image: string | null;
	created_at: number;
	updated_at: number;
}

interface CandidateRow {
	id: string;
	product_title: string;
	archived_at: number | null;
}

interface VoteRow {
	candidate_id: string;
	user_id: string;
	user_name: string;
	user_image: string | null;
}

interface MutableCommentRow {
	author_user_id: string;
	candidate_id: string | null;
	removed_at: number | null;
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function actor(
	id: string,
	name: string,
	image: string | null,
): { id: string; name: string; image: string | null } {
	return { id, image, name };
}

function storedRole(value: unknown): MembershipRole {
	if (!isMembershipRole(value)) {
		throw new Error("Stored membership role is invalid");
	}
	return value;
}

async function workspaceAdministrationAccess(
	database: D1Database,
	userId: string,
	workspaceId: string,
): Promise<WorkspaceAccessRow> {
	const workspace = await database
		.prepare(
			`select
				w.id,
				w.name,
				exists (
					select 1 from workspace_memberships owner
					where owner.workspace_id = w.id
						and owner.user_id = ?1
						and owner.role = 'owner'
				) as is_workspace_owner
			from workspaces w
			where w.id = ?2
				and (
					exists (
						select 1 from workspace_memberships member
						where member.workspace_id = w.id and member.user_id = ?1
					)
					or exists (
						select 1
						from collections c
						join collection_memberships member on member.collection_id = c.id
						where c.workspace_id = w.id and member.user_id = ?1
					)
				)`,
		)
		.bind(userId, workspaceId)
		.first<WorkspaceAccessRow>();
	if (workspace === null) {
		throw notFound();
	}
	return workspace;
}

async function managedCollections(
	database: D1Database,
	userId: string,
	workspaceId: string,
	isWorkspaceOwner: boolean,
): Promise<ManagedCollectionRow[]> {
	const result = await database
		.prepare(
			`select c.id, c.name
			from collections c
			where c.workspace_id = ?1
				and c.archived_at is null
				and (
					?2 = 1
					or exists (
						select 1 from collection_memberships owner
						where owner.collection_id = c.id
							and owner.user_id = ?3
							and owner.role = 'owner'
					)
				)
			order by c.name, c.id`,
		)
		.bind(workspaceId, isWorkspaceOwner ? 1 : 0, userId)
		.all<ManagedCollectionRow>();
	return result.results;
}

async function administrationMembers(
	database: D1Database,
	workspaceId: string,
): Promise<MemberRow[]> {
	const result = await database
		.prepare(
			`select
				wm.id,
				wm.user_id,
				u.name as user_name,
				u.email as user_email,
				u.image as user_image,
				wm.role,
				'workspace' as scope_type,
				null as collection_id,
				null as collection_name,
				wm.created_at,
				wm.updated_at
			from workspace_memberships wm
			join user u on u.id = wm.user_id
			where wm.workspace_id = ?1
			union all
			select
				cm.id,
				cm.user_id,
				u.name as user_name,
				u.email as user_email,
				u.image as user_image,
				cm.role,
				'collection' as scope_type,
				c.id as collection_id,
				c.name as collection_name,
				cm.created_at,
				cm.updated_at
			from collection_memberships cm
			join collections c on c.id = cm.collection_id
			join user u on u.id = cm.user_id
			where c.workspace_id = ?1
			order by scope_type desc, user_name, user_id, collection_name`,
		)
		.bind(workspaceId)
		.all<MemberRow>();
	return result.results;
}

async function administrationInvitations(
	database: D1Database,
	workspaceId: string,
): Promise<{
	invitations: InvitationAdminRow[];
	collections: InvitationCollectionRow[];
}> {
	const [invitationResult, collectionResult] = await database.batch([
		database
			.prepare(
				`select
					i.id,
					i.role,
					i.scope_type,
					i.invited_email_normalized,
					i.email_restriction_enabled,
					i.expires_at,
					i.revoked_at,
					i.created_at,
					i.created_by_user_id,
					creator.name as created_by_name,
					creator.image as created_by_image,
					a.accepted_by_user_id,
					accepted.name as accepted_by_name,
					accepted.image as accepted_by_image
				from invitations i
				join user creator on creator.id = i.created_by_user_id
				left join invitation_acceptances a on a.invitation_id = i.id
				left join user accepted on accepted.id = a.accepted_by_user_id
				where i.workspace_id = ?1
				order by i.created_at desc, i.id desc
				limit 100`,
			)
			.bind(workspaceId),
		database
			.prepare(
				`select
					ic.invitation_id,
					c.id as collection_id,
					c.name as collection_name
				from invitation_collections ic
				join collections c on c.id = ic.collection_id
				where ic.workspace_id = ?1
				order by c.name, c.id`,
			)
			.bind(workspaceId),
	]);

	return {
		invitations: invitationResult.results as unknown as InvitationAdminRow[],
		collections:
			collectionResult.results as unknown as InvitationCollectionRow[],
	};
}

function memberResource(input: {
	row: MemberRow;
	workspace: WorkspaceAccessRow;
	userId: string;
	isWorkspaceOwner: boolean;
}): CollaborationMember {
	const role = storedRole(input.row.role);
	const scope =
		input.row.scope_type === "workspace"
			? {
					type: "workspace" as const,
					workspaceId: input.workspace.id,
					workspaceName: input.workspace.name,
				}
			: {
					type: "collection" as const,
					workspaceId: input.workspace.id,
					collectionId: input.row.collection_id!,
					collectionName: input.row.collection_name!,
				};

	return {
		id: input.row.id,
		user: {
			...actor(input.row.user_id, input.row.user_name, input.row.user_image),
			email: input.row.user_email,
		},
		role,
		scope,
		canManage:
			input.row.user_id !== input.userId &&
			(input.isWorkspaceOwner ||
				(input.row.scope_type === "collection" && role !== "owner")),
		createdAt: timestamp(input.row.created_at),
		updatedAt: timestamp(input.row.updated_at),
	};
}

function invitationStatus(
	row: InvitationAdminRow,
	now: number,
): CollaborationInvitation["status"] {
	if (row.accepted_by_user_id !== null) return "accepted";
	if (row.revoked_at !== null) return "revoked";
	if (row.expires_at <= now) return "expired";
	return "pending";
}

export async function readWorkspaceCollaboration(input: {
	database: D1Database;
	userId: string;
	workspaceId: string;
}): Promise<WorkspaceCollaborationResponse> {
	const workspace = await workspaceAdministrationAccess(
		input.database,
		input.userId,
		input.workspaceId,
	);
	const isWorkspaceOwner = workspace.is_workspace_owner === 1;
	const manageable = await managedCollections(
		input.database,
		input.userId,
		input.workspaceId,
		isWorkspaceOwner,
	);
	const managedIds = new Set(manageable.map(({ id }) => id));
	if (!isWorkspaceOwner && managedIds.size === 0) {
		return {
			invitations: [],
			members: [],
			permissions: {
				canGrantOwner: false,
				canInviteWorkspace: false,
				invitableCollections: [],
			},
		};
	}

	const [memberRows, invitationRows] = await Promise.all([
		administrationMembers(input.database, input.workspaceId),
		administrationInvitations(input.database, input.workspaceId),
	]);
	const visibleMembers = memberRows.filter(
		(row) =>
			isWorkspaceOwner ||
			(row.scope_type === "collection" && managedIds.has(row.collection_id!)),
	);
	const invitationCollections = new Map<string, InvitationCollectionRow[]>();
	for (const row of invitationRows.collections) {
		const current = invitationCollections.get(row.invitation_id) ?? [];
		current.push(row);
		invitationCollections.set(row.invitation_id, current);
	}
	const now = Date.now();
	const invitations = invitationRows.invitations.flatMap((row) => {
		const role = storedRole(row.role);
		const collections = invitationCollections.get(row.id) ?? [];
		const canSee =
			isWorkspaceOwner ||
			(row.scope_type === "collections" &&
				role !== "owner" &&
				collections.length > 0 &&
				collections.every(({ collection_id }) =>
					managedIds.has(collection_id),
				));
		if (!canSee) return [];
		const status = invitationStatus(row, now);
		return [
			{
				id: row.id,
				role,
				scope:
					row.scope_type === "workspace"
						? {
								type: "workspace" as const,
								workspaceId: workspace.id,
								workspaceName: workspace.name,
							}
						: {
								type: "collections" as const,
								workspaceId: workspace.id,
								collections: collections.map((collection) => ({
									id: collection.collection_id,
									name: collection.collection_name,
								})),
							},
				invitedEmail: row.invited_email_normalized,
				emailRestrictionEnabled: row.email_restriction_enabled === 1,
				status,
				createdBy: actor(
					row.created_by_user_id,
					row.created_by_name,
					row.created_by_image,
				),
				acceptedBy:
					row.accepted_by_user_id === null || row.accepted_by_name === null
						? null
						: actor(
								row.accepted_by_user_id,
								row.accepted_by_name,
								row.accepted_by_image,
							),
				canRevoke: status === "pending",
				expiresAt: timestamp(row.expires_at),
				createdAt: timestamp(row.created_at),
			} satisfies CollaborationInvitation,
		];
	});

	return {
		members: visibleMembers.map((row) =>
			memberResource({
				isWorkspaceOwner,
				row,
				userId: input.userId,
				workspace,
			}),
		),
		invitations,
		permissions: {
			canGrantOwner: isWorkspaceOwner,
			canInviteWorkspace: isWorkspaceOwner,
			invitableCollections: manageable,
		},
	};
}

async function discussionContext(
	database: D1Database,
	userId: string,
	itemId: string,
	capability: Capability = "view",
	mutable = false,
): Promise<DiscussionContext> {
	const item = await database
		.prepare(
			`select
				i.id,
				i.title,
				i.workspace_id,
				i.collection_id,
				i.archived_at,
				c.archived_at as collection_archived_at,
				w.archived_at as workspace_archived_at
			from items i
			join collections c on c.id = i.collection_id
			join workspaces w on w.id = i.workspace_id
			where i.id = ?1`,
		)
		.bind(itemId)
		.first<DiscussionContextRow>();
	if (item === null) throw notFound();

	const access = requireCapability(
		await loadCollectionAccess(database, userId, item.collection_id),
		capability,
	);
	if (mutable) {
		if (item.workspace_archived_at !== null)
			throw resourceArchived("Workspace");
		if (item.collection_archived_at !== null)
			throw resourceArchived("Collection");
		if (item.archived_at !== null) throw resourceArchived("Item");
	}
	return { access, item };
}

async function requireCandidate(
	database: D1Database,
	itemId: string,
	candidateId: string,
	mutable: boolean,
): Promise<void> {
	const row = await database
		.prepare(
			"select archived_at from item_candidates where id = ?1 and item_id = ?2",
		)
		.bind(candidateId, itemId)
		.first<{ archived_at: number | null }>();
	if (row === null) throw notFound();
	if (mutable && row.archived_at !== null) throw resourceArchived("Candidate");
}

function commentResource(
	row: CommentRow,
	access: ResourceAccess,
	userId: string,
	isMutable: boolean,
): CommentResource {
	const active = row.removed_at === null;
	const canModerate = hasCapability(
		access.grants,
		access.target,
		"comment_moderate",
	);
	const isAuthor = row.author_user_id === userId;
	return {
		id: row.id,
		target:
			row.candidate_id === null
				? { itemId: row.item_id, type: "item" }
				: {
						candidateId: row.candidate_id,
						itemId: row.item_id,
						type: "candidate",
					},
		body: row.body,
		author: actor(row.author_user_id, row.author_name, row.author_image),
		resolvedAt: row.resolved_at === null ? null : timestamp(row.resolved_at),
		resolvedBy:
			row.resolved_by_user_id === null || row.resolved_by_name === null
				? null
				: actor(
						row.resolved_by_user_id,
						row.resolved_by_name,
						row.resolved_by_image,
					),
		removedAt: row.removed_at === null ? null : timestamp(row.removed_at),
		removedBy:
			row.removed_by_user_id === null || row.removed_by_name === null
				? null
				: actor(
						row.removed_by_user_id,
						row.removed_by_name,
						row.removed_by_image,
					),
		permissions: {
			canEdit:
				active &&
				isMutable &&
				isAuthor &&
				hasCapability(access.grants, access.target, "comment_edit_own"),
			canRemove:
				active &&
				isMutable &&
				(canModerate ||
					(isAuthor &&
						hasCapability(access.grants, access.target, "comment_remove_own"))),
			canResolve: active && isMutable && canModerate,
		},
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

export async function readItemDiscussion(input: {
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemDiscussionResponse> {
	const context = await discussionContext(
		input.database,
		input.userId,
		input.itemId,
	);
	const [commentResult, candidateResult, voteResult] =
		await input.database.batch([
			input.database
				.prepare(
					`select
					comment.id,
					comment.item_id,
					comment.candidate_id,
					comment.body,
					comment.author_user_id,
					author.name as author_name,
					author.image as author_image,
					comment.resolved_at,
					comment.resolved_by_user_id,
					resolver.name as resolved_by_name,
					resolver.image as resolved_by_image,
					comment.removed_at,
					comment.removed_by_user_id,
					remover.name as removed_by_name,
					remover.image as removed_by_image,
					comment.created_at,
					comment.updated_at
				from comments comment
				join user author on author.id = comment.author_user_id
				left join user resolver on resolver.id = comment.resolved_by_user_id
				left join user remover on remover.id = comment.removed_by_user_id
					where comment.item_id = ?1
					order by comment.created_at desc, comment.id desc
					limit 300`,
				)
				.bind(input.itemId),
			input.database
				.prepare(
					`select ic.id, p.title as product_title, ic.archived_at
				from item_candidates ic
				join products p on p.id = ic.product_id
				where ic.item_id = ?1
				order by ic.archived_at is not null, ic.rank is null, ic.rank, ic.created_at, ic.id`,
				)
				.bind(input.itemId),
			input.database
				.prepare(
					`select
					vote.candidate_id,
					vote.user_id,
					u.name as user_name,
					u.image as user_image
				from candidate_votes vote
				join user u on u.id = vote.user_id
				where vote.item_id = ?1
				order by vote.created_at, vote.user_id`,
				)
				.bind(input.itemId),
		]);
	const rows = (commentResult.results as unknown as CommentRow[]).reverse();
	const candidates = candidateResult.results as unknown as CandidateRow[];
	const votes = voteResult.results as unknown as VoteRow[];
	const archivedCandidateIds = new Set(
		candidates
			.filter((candidate) => candidate.archived_at !== null)
			.map((candidate) => candidate.id),
	);
	const isMutable =
		context.item.archived_at === null &&
		context.item.collection_archived_at === null &&
		context.item.workspace_archived_at === null;
	const resources = rows.map((row) =>
		commentResource(
			row,
			context.access,
			input.userId,
			isMutable &&
				(row.candidate_id === null ||
					!archivedCandidateIds.has(row.candidate_id)),
		),
	);

	return {
		itemId: context.item.id,
		itemTitle: context.item.title,
		itemComments: resources.filter(({ target }) => target.type === "item"),
		candidates: candidates.map((candidate) => {
			const candidateVotes = votes.filter(
				(vote) => vote.candidate_id === candidate.id,
			);
			return {
				candidateId: candidate.id,
				productTitle: candidate.product_title,
				archived: candidate.archived_at !== null,
				comments: resources.filter(
					(comment) =>
						comment.target.type === "candidate" &&
						comment.target.candidateId === candidate.id,
				),
				voteCount: candidateVotes.length,
				voters: candidateVotes.map((vote) =>
					actor(vote.user_id, vote.user_name, vote.user_image),
				),
				currentUserVoted: candidateVotes.some(
					(vote) => vote.user_id === input.userId,
				),
			};
		}),
		permissions: {
			canComment:
				isMutable &&
				hasCapability(
					context.access.grants,
					context.access.target,
					"comment_create",
				),
			canModerate:
				isMutable &&
				hasCapability(
					context.access.grants,
					context.access.target,
					"comment_moderate",
				),
			canVote:
				isMutable &&
				hasCapability(
					context.access.grants,
					context.access.target,
					"vote_manage_own",
				),
			isMutable,
		},
	};
}

export async function createComment(input: {
	candidateId?: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: CommentInput;
}): Promise<ItemDiscussionResponse> {
	const context = await discussionContext(
		input.database,
		input.userId,
		input.itemId,
		"comment_create",
		true,
	);
	if (input.candidateId !== undefined) {
		await requireCandidate(
			input.database,
			input.itemId,
			input.candidateId,
			true,
		);
	}
	const now = Date.now();
	await input.database
		.prepare(
			`insert into comments (
				id, workspace_id, item_id, candidate_id, body, author_user_id,
				created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
		)
		.bind(
			crypto.randomUUID(),
			context.item.workspace_id,
			context.item.id,
			input.candidateId ?? null,
			input.value.body,
			input.userId,
			now,
		)
		.run();
	return readItemDiscussion(input);
}

async function mutableComment(
	database: D1Database,
	itemId: string,
	commentId: string,
): Promise<MutableCommentRow> {
	const row = await database
		.prepare(
			"select author_user_id, candidate_id, removed_at from comments where id = ?1 and item_id = ?2",
		)
		.bind(commentId, itemId)
		.first<MutableCommentRow>();
	if (row === null) throw notFound();
	return row;
}

export async function updateComment(input: {
	commentId: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: CommentInput;
}): Promise<ItemDiscussionResponse> {
	await discussionContext(
		input.database,
		input.userId,
		input.itemId,
		"comment_edit_own",
		true,
	);
	const comment = await mutableComment(
		input.database,
		input.itemId,
		input.commentId,
	);
	if (comment.author_user_id !== input.userId) throw forbidden();
	if (comment.removed_at !== null) throw notFound();
	if (comment.candidate_id !== null) {
		await requireCandidate(
			input.database,
			input.itemId,
			comment.candidate_id,
			true,
		);
	}
	await input.database
		.prepare(
			"update comments set body = ?1, updated_at = ?2 where id = ?3 and item_id = ?4 and removed_at is null",
		)
		.bind(input.value.body, Date.now(), input.commentId, input.itemId)
		.run();
	return readItemDiscussion(input);
}

export async function removeComment(input: {
	commentId: string;
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemDiscussionResponse> {
	const context = await discussionContext(
		input.database,
		input.userId,
		input.itemId,
		"view",
		true,
	);
	const comment = await mutableComment(
		input.database,
		input.itemId,
		input.commentId,
	);
	if (comment.removed_at !== null) return readItemDiscussion(input);
	if (comment.candidate_id !== null) {
		await requireCandidate(
			input.database,
			input.itemId,
			comment.candidate_id,
			true,
		);
	}
	const canRemove =
		hasCapability(
			context.access.grants,
			context.access.target,
			"comment_moderate",
		) ||
		(comment.author_user_id === input.userId &&
			hasCapability(
				context.access.grants,
				context.access.target,
				"comment_remove_own",
			));
	if (!canRemove) throw forbidden();
	const now = Date.now();
	await input.database
		.prepare(
			`update comments
			set body = null,
				removed_at = ?1,
				removed_by_user_id = ?2,
				resolved_at = null,
				resolved_by_user_id = null,
				updated_at = ?1
			where id = ?3 and item_id = ?4 and removed_at is null`,
		)
		.bind(now, input.userId, input.commentId, input.itemId)
		.run();
	return readItemDiscussion(input);
}

export async function resolveComment(input: {
	commentId: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: CommentResolutionInput;
}): Promise<ItemDiscussionResponse> {
	await discussionContext(
		input.database,
		input.userId,
		input.itemId,
		"comment_moderate",
		true,
	);
	const comment = await mutableComment(
		input.database,
		input.itemId,
		input.commentId,
	);
	if (comment.removed_at !== null) throw notFound();
	if (comment.candidate_id !== null) {
		await requireCandidate(
			input.database,
			input.itemId,
			comment.candidate_id,
			true,
		);
	}
	const now = Date.now();
	await input.database
		.prepare(
			`update comments
			set resolved_at = ?1,
				resolved_by_user_id = ?2,
				updated_at = ?3
			where id = ?4 and item_id = ?5 and removed_at is null`,
		)
		.bind(
			input.value.resolved ? now : null,
			input.value.resolved ? input.userId : null,
			now,
			input.commentId,
			input.itemId,
		)
		.run();
	return readItemDiscussion(input);
}

export async function setCandidateVote(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	selected: boolean;
	userId: string;
}): Promise<ItemDiscussionResponse> {
	const context = await discussionContext(
		input.database,
		input.userId,
		input.itemId,
		"vote_manage_own",
		true,
	);
	await requireCandidate(input.database, input.itemId, input.candidateId, true);
	if (input.selected) {
		const now = Date.now();
		await input.database
			.prepare(
				`insert into candidate_votes (
					workspace_id, item_id, candidate_id, user_id, created_at, updated_at
				) values (?1, ?2, ?3, ?4, ?5, ?5)
				on conflict(candidate_id, user_id) do update set updated_at = excluded.updated_at`,
			)
			.bind(
				context.item.workspace_id,
				context.item.id,
				input.candidateId,
				input.userId,
				now,
			)
			.run();
	} else {
		await input.database
			.prepare(
				"delete from candidate_votes where candidate_id = ?1 and user_id = ?2 and item_id = ?3",
			)
			.bind(input.candidateId, input.userId, input.itemId)
			.run();
	}
	return readItemDiscussion(input);
}
