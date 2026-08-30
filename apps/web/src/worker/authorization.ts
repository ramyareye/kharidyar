import {
	hasCapability,
	isMembershipRole,
	type AuthorizationTarget,
	type Capability,
	type MembershipGrant,
} from "@kharidyar/domain";

import { forbidden, notFound } from "./api-errors";

export interface ResourceAccess {
	readonly grants: readonly MembershipGrant[];
	readonly target: AuthorizationTarget;
}

interface WorkspaceAccessRow {
	workspace_id: string;
	workspace_role: unknown;
}

interface CollectionAccessRow {
	collection_id: string;
	workspace_id: string;
	workspace_role: unknown;
	collection_role: unknown;
}

function roleFromDatabase(value: unknown): MembershipGrant["role"] | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (!isMembershipRole(value)) {
		throw new Error("Stored membership role is invalid");
	}

	return value;
}

export async function loadWorkspaceAccess(
	database: D1Database,
	userId: string,
	workspaceId: string,
): Promise<ResourceAccess | null> {
	const row = await database
		.prepare(
			`select
				w.id as workspace_id,
				wm.role as workspace_role
			from workspaces w
			left join workspace_memberships wm
				on wm.workspace_id = w.id and wm.user_id = ?
			where w.id = ?`,
		)
		.bind(userId, workspaceId)
		.first<WorkspaceAccessRow>();

	if (row === null) {
		return null;
	}

	const role = roleFromDatabase(row.workspace_role);
	return {
		target: { workspaceId: row.workspace_id },
		grants:
			role === null
				? []
				: [{ scope: "workspace", workspaceId: row.workspace_id, role }],
	};
}

export async function loadCollectionAccess(
	database: D1Database,
	userId: string,
	collectionId: string,
): Promise<ResourceAccess | null> {
	const row = await database
		.prepare(
			`select
				c.id as collection_id,
				c.workspace_id,
				wm.role as workspace_role,
				cm.role as collection_role
			from collections c
			left join workspace_memberships wm
				on wm.workspace_id = c.workspace_id and wm.user_id = ?
			left join collection_memberships cm
				on cm.collection_id = c.id and cm.user_id = ?
			where c.id = ?`,
		)
		.bind(userId, userId, collectionId)
		.first<CollectionAccessRow>();

	if (row === null) {
		return null;
	}

	const workspaceRole = roleFromDatabase(row.workspace_role);
	const collectionRole = roleFromDatabase(row.collection_role);
	const grants: MembershipGrant[] = [];

	if (workspaceRole !== null) {
		grants.push({
			scope: "workspace",
			workspaceId: row.workspace_id,
			role: workspaceRole,
		});
	}
	if (collectionRole !== null) {
		grants.push({
			scope: "collection",
			workspaceId: row.workspace_id,
			collectionId: row.collection_id,
			role: collectionRole,
		});
	}

	return {
		target: {
			workspaceId: row.workspace_id,
			collectionId: row.collection_id,
		},
		grants,
	};
}

export function requireCapability(
	access: ResourceAccess | null,
	capability: Capability,
): ResourceAccess {
	if (access === null || !hasCapability(access.grants, access.target, "view")) {
		throw notFound();
	}

	if (!hasCapability(access.grants, access.target, capability)) {
		throw forbidden();
	}

	return access;
}
