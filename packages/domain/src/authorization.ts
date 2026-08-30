export const membershipRoles = [
	"viewer",
	"commenter",
	"contributor",
	"editor",
	"owner",
] as const;

export type MembershipRole = (typeof membershipRoles)[number];

export const capabilities = [
	"view",
	"export_context",
	"comment_create",
	"comment_edit_own",
	"comment_remove_own",
	"vote_manage_own",
	"item_create",
	"item_edit",
	"candidate_manage",
	"product_manage",
	"offer_manage",
	"research_manage",
	"offer_refresh",
	"research_result_promote",
	"collection_content_edit",
	"collection_brief_edit",
	"concept_edit",
	"item_archive",
	"candidate_archive",
	"item_status_non_purchase",
	"comment_moderate",
	"research_result_moderate",
	"settings_edit",
	"members_manage_non_owner",
	"invitations_manage",
	"record_purchase",
	"scope_archive",
	"scope_delete",
] as const;

export type Capability = (typeof capabilities)[number];

const viewerCapabilities = ["view", "export_context"] as const;
const commenterCapabilities = [
	...viewerCapabilities,
	"comment_create",
	"comment_edit_own",
	"comment_remove_own",
	"vote_manage_own",
] as const;
const contributorCapabilities = [
	...commenterCapabilities,
	"item_create",
	"item_edit",
	"candidate_manage",
	"product_manage",
	"offer_manage",
	"research_manage",
	"offer_refresh",
	"research_result_promote",
] as const;
const editorCapabilities = [
	...contributorCapabilities,
	"collection_content_edit",
	"collection_brief_edit",
	"concept_edit",
	"item_archive",
	"candidate_archive",
	"item_status_non_purchase",
	"comment_moderate",
	"research_result_moderate",
] as const;
const ownerCapabilities = [
	...editorCapabilities,
	"settings_edit",
	"members_manage_non_owner",
	"invitations_manage",
	"record_purchase",
	"scope_archive",
	"scope_delete",
] as const;

const roleCapabilities = {
	viewer: viewerCapabilities,
	commenter: commenterCapabilities,
	contributor: contributorCapabilities,
	editor: editorCapabilities,
	owner: ownerCapabilities,
} as const satisfies Record<MembershipRole, readonly Capability[]>;

export type AuthorizationTarget =
	| { readonly workspaceId: string; readonly collectionId?: undefined }
	| { readonly workspaceId: string; readonly collectionId: string };

export type MembershipGrant =
	| {
			readonly scope: "workspace";
			readonly workspaceId: string;
			readonly role: MembershipRole;
	  }
	| {
			readonly scope: "collection";
			readonly workspaceId: string;
			readonly collectionId: string;
			readonly role: MembershipRole;
	  };

export function isMembershipRole(value: unknown): value is MembershipRole {
	return (
		typeof value === "string" &&
		membershipRoles.includes(value as MembershipRole)
	);
}

export function capabilitiesForRole(
	role: MembershipRole,
): ReadonlySet<Capability> {
	return new Set(roleCapabilities[role]);
}

function grantApplies(
	grant: MembershipGrant,
	target: AuthorizationTarget,
): boolean {
	if (grant.workspaceId !== target.workspaceId) {
		return false;
	}

	if (grant.scope === "workspace") {
		return true;
	}

	return (
		target.collectionId !== undefined &&
		grant.collectionId === target.collectionId
	);
}

export function resolveCapabilities(
	grants: readonly MembershipGrant[],
	target: AuthorizationTarget,
): ReadonlySet<Capability> {
	const resolved = new Set<Capability>();

	for (const grant of grants) {
		if (!grantApplies(grant, target)) {
			continue;
		}

		for (const capability of roleCapabilities[grant.role]) {
			resolved.add(capability);
		}
	}

	return resolved;
}

export function hasCapability(
	grants: readonly MembershipGrant[],
	target: AuthorizationTarget,
	capability: Capability,
): boolean {
	return resolveCapabilities(grants, target).has(capability);
}

export function hasWorkspaceOwnerGrant(
	grants: readonly MembershipGrant[],
	workspaceId: string,
): boolean {
	return grants.some(
		(grant) =>
			grant.scope === "workspace" &&
			grant.workspaceId === workspaceId &&
			grant.role === "owner",
	);
}

export function canManageMembershipRole(
	grants: readonly MembershipGrant[],
	target: AuthorizationTarget,
	role: MembershipRole,
): boolean {
	if (role === "owner") {
		return hasWorkspaceOwnerGrant(grants, target.workspaceId);
	}

	return hasCapability(grants, target, "members_manage_non_owner");
}

export function canRemoveWorkspaceOwner(ownerCount: number): boolean {
	return Number.isSafeInteger(ownerCount) && ownerCount > 1;
}
