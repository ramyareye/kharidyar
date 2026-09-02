import { membershipRoles } from "@kharidyar/domain";
import { z } from "zod";

const requiredText = (maximumLength: number) =>
	z.string().trim().min(1).max(maximumLength);

const actorSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		image: z.string().nullable(),
	})
	.strict();

const membershipRoleSchema = z.enum(membershipRoles);

const workspaceMembershipScopeSchema = z
	.object({
		type: z.literal("workspace"),
		workspaceId: z.string(),
		workspaceName: z.string(),
	})
	.strict();

const collectionMembershipScopeSchema = z
	.object({
		type: z.literal("collection"),
		workspaceId: z.string(),
		collectionId: z.string(),
		collectionName: z.string(),
	})
	.strict();

export const collaborationMemberSchema = z
	.object({
		id: z.string(),
		user: actorSchema.extend({ email: z.email() }),
		role: membershipRoleSchema,
		scope: z.discriminatedUnion("type", [
			workspaceMembershipScopeSchema,
			collectionMembershipScopeSchema,
		]),
		canManage: z.boolean(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

const invitationScopeSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("workspace"),
			workspaceId: z.string(),
			workspaceName: z.string(),
		})
		.strict(),
	z
		.object({
			type: z.literal("collections"),
			workspaceId: z.string(),
			collections: z
				.array(z.object({ id: z.string(), name: z.string() }).strict())
				.min(1),
		})
		.strict(),
]);

export const collaborationInvitationSchema = z
	.object({
		id: z.string(),
		role: membershipRoleSchema,
		scope: invitationScopeSchema,
		invitedEmail: z.email().nullable(),
		emailRestrictionEnabled: z.boolean(),
		status: z.enum(["pending", "accepted", "revoked", "expired"]),
		createdBy: actorSchema,
		acceptedBy: actorSchema.nullable(),
		canRevoke: z.boolean(),
		expiresAt: z.iso.datetime(),
		createdAt: z.iso.datetime(),
	})
	.strict();

export const managedCollectionSchema = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.strict();

export const workspaceCollaborationResponseSchema = z
	.object({
		members: z.array(collaborationMemberSchema),
		invitations: z.array(collaborationInvitationSchema),
		permissions: z
			.object({
				canGrantOwner: z.boolean(),
				canInviteWorkspace: z.boolean(),
				invitableCollections: z.array(managedCollectionSchema),
			})
			.strict(),
	})
	.strict();

const invitationWorkspaceInputScopeSchema = z
	.object({ type: z.literal("workspace") })
	.strict();

const invitationCollectionsInputScopeSchema = z
	.object({
		type: z.literal("collections"),
		collectionIds: z.array(z.string().trim().min(1)).min(1).max(25),
	})
	.strict();

export const invitationCreateInputSchema = z
	.object({
		role: membershipRoleSchema,
		scope: z.discriminatedUnion("type", [
			invitationWorkspaceInputScopeSchema,
			invitationCollectionsInputScopeSchema,
		]),
		expiresAt: z.iso.datetime({ offset: true }),
		invitedEmail: z.email().nullable(),
		restrictToEmail: z.boolean(),
	})
	.strict();

export const invitationCreatedResponseSchema = z
	.object({
		invitation: z
			.object({
				id: z.string(),
				role: membershipRoleSchema,
				scopeType: z.enum(["workspace", "collections"]),
				emailRestrictionEnabled: z.boolean(),
				expiresAt: z.iso.datetime(),
				url: z.url(),
			})
			.strict(),
	})
	.strict();

export const membershipMutationResponseSchema = z
	.object({
		membership: z
			.object({ role: membershipRoleSchema, userId: z.string() })
			.strict(),
	})
	.strict();

export const removalResponseSchema = z
	.object({ removed: z.literal(true) })
	.strict();

export const revocationResponseSchema = z
	.object({
		revoked: z.literal(true),
		alreadyRevoked: z.boolean(),
	})
	.strict();

const commentPermissionsSchema = z
	.object({
		canEdit: z.boolean(),
		canRemove: z.boolean(),
		canResolve: z.boolean(),
	})
	.strict();

const itemCommentTargetSchema = z
	.object({ type: z.literal("item"), itemId: z.string() })
	.strict();

const candidateCommentTargetSchema = z
	.object({
		type: z.literal("candidate"),
		itemId: z.string(),
		candidateId: z.string(),
	})
	.strict();

export const commentResourceSchema = z
	.object({
		id: z.string(),
		target: z.discriminatedUnion("type", [
			itemCommentTargetSchema,
			candidateCommentTargetSchema,
		]),
		body: z.string().nullable(),
		author: actorSchema,
		resolvedAt: z.iso.datetime().nullable(),
		resolvedBy: actorSchema.nullable(),
		removedAt: z.iso.datetime().nullable(),
		removedBy: actorSchema.nullable(),
		permissions: commentPermissionsSchema,
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

export const candidateDiscussionSchema = z
	.object({
		candidateId: z.string(),
		productTitle: z.string(),
		archived: z.boolean(),
		comments: z.array(commentResourceSchema),
		voteCount: z.number().int().min(0),
		voters: z.array(actorSchema),
		currentUserVoted: z.boolean(),
	})
	.strict();

export const itemDiscussionResponseSchema = z
	.object({
		itemId: z.string(),
		itemTitle: z.string(),
		itemComments: z.array(commentResourceSchema),
		candidates: z.array(candidateDiscussionSchema),
		permissions: z
			.object({
				canComment: z.boolean(),
				canModerate: z.boolean(),
				canVote: z.boolean(),
				isMutable: z.boolean(),
			})
			.strict(),
	})
	.strict();

export const commentInputSchema = z
	.object({ body: requiredText(2_000) })
	.strict();

export const commentResolutionInputSchema = z
	.object({ resolved: z.boolean() })
	.strict();

export const candidateVoteInputSchema = z
	.object({ selected: z.boolean() })
	.strict();

export type CollaborationMember = z.infer<typeof collaborationMemberSchema>;
export type CollaborationInvitation = z.infer<
	typeof collaborationInvitationSchema
>;
export type WorkspaceCollaborationResponse = z.infer<
	typeof workspaceCollaborationResponseSchema
>;
export type InvitationCreateInput = z.infer<typeof invitationCreateInputSchema>;
export type InvitationCreatedResponse = z.infer<
	typeof invitationCreatedResponseSchema
>;
export type CommentInput = z.infer<typeof commentInputSchema>;
export type CommentResolutionInput = z.infer<
	typeof commentResolutionInputSchema
>;
export type CandidateVoteInput = z.infer<typeof candidateVoteInputSchema>;
export type CommentResource = z.infer<typeof commentResourceSchema>;
export type CandidateDiscussion = z.infer<typeof candidateDiscussionSchema>;
export type ItemDiscussionResponse = z.infer<
	typeof itemDiscussionResponseSchema
>;
