import type {
	ArchiveListQuery,
	CollectionCreateInput,
	CollectionResource,
	CollectionUpdateInput,
	ItemCreateInput,
	ItemListQuery,
	ItemPermissions,
	ItemPlanningSnapshot,
	ItemResource,
	ItemUpdateInput,
	WorkspaceCreateInput,
	WorkspaceResource,
	WorkspaceSummary,
	WorkspaceUpdateInput,
} from "@kharidyar/contracts";
import type {
	Capability,
	ItemPriority,
	ItemStatus,
} from "@kharidyar/domain";

import {
	loadCollectionAccess,
	loadWorkspaceAccess,
	requireCapability,
} from "./authorization";
import { conflict, notFound, resourceArchived } from "./api-errors";
import { itemPermissionsForAccess } from "./item-workflow-permissions";

interface WorkspaceRow {
	id: string;
	name: string;
	archived_at: number | null;
	created_at: number;
	updated_at: number;
}

interface WorkspaceNavigationRow extends WorkspaceRow {
	has_workspace_access: number;
}

interface CollectionRow {
	id: string;
	workspace_id: string;
	name: string;
	description: string | null;
	archived_at: number | null;
	created_at: number;
	updated_at: number;
}

interface CollectionStateRow extends CollectionRow {
	workspace_archived_at: number | null;
}

export interface ItemRow {
	id: string;
	workspace_id: string;
	collection_id: string;
	title: string;
	description: string | null;
	requirements: string | null;
	priority: ItemPriority;
	status: ItemStatus;
	quantity_needed: number;
	group_label: string | null;
	budget_minor: number | null;
	budget_currency: string | null;
	deadline_at: number | null;
	archived_at: number | null;
	created_at: number;
	updated_at: number;
}

interface ItemStateRow extends ItemRow {
	collection_archived_at: number | null;
	workspace_archived_at: number | null;
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function nullableTimestamp(value: number | null): string | null {
	return value === null ? null : timestamp(value);
}

function workspaceResource(row: WorkspaceRow): WorkspaceResource {
	return {
		id: row.id,
		name: row.name,
		archivedAt: nullableTimestamp(row.archived_at),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

function workspaceSummary(row: WorkspaceNavigationRow): WorkspaceSummary {
	return {
		id: row.id,
		name: row.name,
		archivedAt: nullableTimestamp(row.archived_at),
		accessScope: row.has_workspace_access === 1 ? "workspace" : "collections",
	};
}

function collectionResource(row: CollectionRow): CollectionResource {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		name: row.name,
		description: row.description,
		archivedAt: nullableTimestamp(row.archived_at),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

export function itemResource(row: ItemRow): ItemResource {
	if ((row.budget_minor === null) !== (row.budget_currency === null)) {
		throw new Error("Stored Item budget is inconsistent");
	}
	if (row.budget_currency !== null && row.budget_currency !== "EUR") {
		throw new Error("Stored Item budget uses an unsupported currency");
	}

	return {
		id: row.id,
		workspaceId: row.workspace_id,
		collectionId: row.collection_id,
		title: row.title,
		description: row.description,
		requirements: row.requirements,
		priority: row.priority,
		status: row.status,
		quantityNeeded: row.quantity_needed,
		groupLabel: row.group_label,
		budget:
			row.budget_minor === null || row.budget_currency === null
				? null
				: { minor: row.budget_minor, currency: row.budget_currency },
		deadlineAt: nullableTimestamp(row.deadline_at),
		archivedAt: nullableTimestamp(row.archived_at),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

function itemPlanningSnapshot(row: ItemRow): ItemPlanningSnapshot {
	const resource = itemResource(row);
	return {
		title: resource.title,
		description: resource.description,
		requirements: resource.requirements,
		priority: resource.priority,
		status: resource.status,
		quantityNeeded: resource.quantityNeeded,
		groupLabel: resource.groupLabel,
		budget: resource.budget,
		deadlineAt: resource.deadlineAt,
	};
}

async function workspaceById(
	database: D1Database,
	workspaceId: string,
): Promise<WorkspaceRow | null> {
	return database
		.prepare(
			`select id, name, archived_at, created_at, updated_at
			from workspaces
			where id = ?1`,
		)
		.bind(workspaceId)
		.first<WorkspaceRow>();
}

async function collectionStateById(
	database: D1Database,
	collectionId: string,
): Promise<CollectionStateRow | null> {
	return database
		.prepare(
			`select
				c.id,
				c.workspace_id,
				c.name,
				c.description,
				c.archived_at,
				c.created_at,
				c.updated_at,
				w.archived_at as workspace_archived_at
			from collections c
			join workspaces w on w.id = c.workspace_id
			where c.id = ?1`,
		)
		.bind(collectionId)
		.first<CollectionStateRow>();
}

async function itemStateById(
	database: D1Database,
	itemId: string,
): Promise<ItemStateRow | null> {
	return database
		.prepare(
			`select
				i.id,
				i.workspace_id,
				i.collection_id,
				i.title,
				i.description,
				i.requirements,
				i.priority,
				i.status,
				i.quantity_needed,
				i.group_label,
				i.budget_minor,
				i.budget_currency,
				i.deadline_at,
				i.archived_at,
				i.created_at,
				i.updated_at,
				c.archived_at as collection_archived_at,
				w.archived_at as workspace_archived_at
			from items i
			join collections c on c.id = i.collection_id
			join workspaces w on w.id = i.workspace_id
			where i.id = ?1`,
		)
		.bind(itemId)
		.first<ItemStateRow>();
}

async function requireWorkspaceCapability(
	database: D1Database,
	userId: string,
	workspaceId: string,
	capability: Capability,
): Promise<void> {
	requireCapability(
		await loadWorkspaceAccess(database, userId, workspaceId),
		capability,
	);
}

async function requireCollectionCapability(
	database: D1Database,
	userId: string,
	collectionId: string,
	capability: Capability,
): Promise<void> {
	requireCapability(
		await loadCollectionAccess(database, userId, collectionId),
		capability,
	);
}

async function requireMutableWorkspace(
	database: D1Database,
	userId: string,
	workspaceId: string,
	capability: Capability,
): Promise<WorkspaceRow> {
	await requireWorkspaceCapability(database, userId, workspaceId, capability);
	const workspace = await workspaceById(database, workspaceId);
	if (workspace === null) {
		throw notFound();
	}
	if (workspace.archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	return workspace;
}

async function requireMutableCollection(
	database: D1Database,
	userId: string,
	collectionId: string,
	capability: Capability,
): Promise<CollectionStateRow> {
	await requireCollectionCapability(database, userId, collectionId, capability);
	const collection = await collectionStateById(database, collectionId);
	if (collection === null) {
		throw notFound();
	}
	if (collection.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	if (collection.archived_at !== null) {
		throw resourceArchived("Collection");
	}
	return collection;
}

async function requireMutableItem(
	database: D1Database,
	userId: string,
	itemId: string,
	capability: Capability,
): Promise<ItemStateRow> {
	const item = await itemStateById(database, itemId);
	if (item === null) {
		throw notFound();
	}
	await requireCollectionCapability(
		database,
		userId,
		item.collection_id,
		capability,
	);
	if (item.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	if (item.collection_archived_at !== null) {
		throw resourceArchived("Collection");
	}
	if (item.archived_at !== null) {
		throw resourceArchived("Item");
	}
	return item;
}

async function requireWorkspaceNavigationAccess(
	database: D1Database,
	userId: string,
	workspaceId: string,
): Promise<WorkspaceRow> {
	const row = await database
		.prepare(
			`select w.id, w.name, w.archived_at, w.created_at, w.updated_at
			from workspaces w
			where w.id = ?1
				and (
					exists (
						select 1 from workspace_memberships wm
						where wm.workspace_id = w.id and wm.user_id = ?2
					)
					or exists (
						select 1
						from collections c
						join collection_memberships cm on cm.collection_id = c.id
						where c.workspace_id = w.id and cm.user_id = ?2
					)
				)`,
		)
		.bind(workspaceId, userId)
		.first<WorkspaceRow>();
	if (row === null) {
		throw notFound();
	}
	return row;
}

export async function listWorkspaces(input: {
	database: D1Database;
	query: ArchiveListQuery;
	userId: string;
}): Promise<readonly WorkspaceSummary[]> {
	// A Collection-only grant gets a minimal parent navigation summary. Reading
	// the Workspace resource or settings still requires a Workspace grant.
	const result = await input.database
		.prepare(
			`select
				w.id,
				w.name,
				w.archived_at,
				w.created_at,
				w.updated_at,
				exists (
					select 1 from workspace_memberships direct_access
					where direct_access.workspace_id = w.id
						and direct_access.user_id = ?2
				) as has_workspace_access
			from workspaces w
			where (?1 = 1 or w.archived_at is null)
				and (
					exists (
						select 1 from workspace_memberships wm
						where wm.workspace_id = w.id and wm.user_id = ?2
					)
					or exists (
						select 1
						from collections c
						join collection_memberships cm on cm.collection_id = c.id
						where c.workspace_id = w.id and cm.user_id = ?2
					)
				)
			order by w.updated_at desc, w.id`,
		)
		.bind(input.query.includeArchived ? 1 : 0, input.userId)
		.all<WorkspaceNavigationRow>();
	return result.results.map(workspaceSummary);
}

export async function createWorkspace(input: {
	actorUserId: string;
	database: D1Database;
	value: WorkspaceCreateInput;
}): Promise<WorkspaceResource> {
	const now = Date.now();
	const workspaceId = crypto.randomUUID();
	await input.database.batch([
		input.database
			.prepare(
				`insert into workspaces (
					id, name, created_by_user_id, created_at, updated_at
				) values (?1, ?2, ?3, ?4, ?4)`,
			)
			.bind(workspaceId, input.value.name, input.actorUserId, now),
		input.database
			.prepare(
				`insert into workspace_memberships (
					id, workspace_id, user_id, role, created_at, updated_at
				) values (?1, ?2, ?3, 'owner', ?4, ?4)`,
			)
			.bind(crypto.randomUUID(), workspaceId, input.actorUserId, now),
	]);

	return workspaceResource({
		id: workspaceId,
		name: input.value.name,
		archived_at: null,
		created_at: now,
		updated_at: now,
	});
}

export async function readWorkspace(input: {
	database: D1Database;
	userId: string;
	workspaceId: string;
}): Promise<WorkspaceResource> {
	await requireWorkspaceCapability(
		input.database,
		input.userId,
		input.workspaceId,
		"view",
	);
	const workspace = await workspaceById(input.database, input.workspaceId);
	if (workspace === null) {
		throw notFound();
	}
	return workspaceResource(workspace);
}

export async function updateWorkspace(input: {
	database: D1Database;
	userId: string;
	value: WorkspaceUpdateInput;
	workspaceId: string;
}): Promise<WorkspaceResource> {
	const current = await requireMutableWorkspace(
		input.database,
		input.userId,
		input.workspaceId,
		"settings_edit",
	);
	const now = Date.now();
	const updated = await input.database
		.prepare(
			`update workspaces
			set name = ?1, updated_at = ?2
			where id = ?3
				and archived_at is null
				and exists (
					select 1 from workspace_memberships actor
					where actor.workspace_id = workspaces.id
						and actor.user_id = ?4
						and actor.role = 'owner'
				)
			returning id, name, archived_at, created_at, updated_at`,
		)
		.bind(
			input.value.name ?? current.name,
			now,
			input.workspaceId,
			input.userId,
		)
		.first<WorkspaceRow>();
	if (updated === null) {
		await requireMutableWorkspace(
			input.database,
			input.userId,
			input.workspaceId,
			"settings_edit",
		);
		throw conflict("The Workspace changed. Please retry.");
	}
	return workspaceResource(updated);
}

export async function setWorkspaceArchived(input: {
	archived: boolean;
	database: D1Database;
	userId: string;
	workspaceId: string;
}): Promise<WorkspaceResource> {
	await requireWorkspaceCapability(
		input.database,
		input.userId,
		input.workspaceId,
		"scope_archive",
	);
	const current = await workspaceById(input.database, input.workspaceId);
	if (current === null) {
		throw notFound();
	}
	if ((current.archived_at !== null) === input.archived) {
		return workspaceResource(current);
	}

	const now = Date.now();
	const updated = await input.database
		.prepare(
			`update workspaces
			set archived_at = ?1, updated_at = ?2
			where id = ?3
				and (
					(?5 = 1 and archived_at is null)
					or (?5 = 0 and archived_at is not null)
				)
				and exists (
					select 1 from workspace_memberships actor
					where actor.workspace_id = workspaces.id
						and actor.user_id = ?4
						and actor.role = 'owner'
				)
			returning id, name, archived_at, created_at, updated_at`,
		)
		.bind(
			input.archived ? now : null,
			now,
			input.workspaceId,
			input.userId,
			input.archived ? 1 : 0,
		)
		.first<WorkspaceRow>();
	if (updated !== null) {
		return workspaceResource(updated);
	}

	await requireWorkspaceCapability(
		input.database,
		input.userId,
		input.workspaceId,
		"scope_archive",
	);
	const refreshed = await workspaceById(input.database, input.workspaceId);
	if (refreshed === null) {
		throw notFound();
	}
	if ((refreshed.archived_at !== null) === input.archived) {
		return workspaceResource(refreshed);
	}
	throw conflict("The Workspace changed. Please retry.");
}

export async function listCollections(input: {
	database: D1Database;
	query: ArchiveListQuery;
	userId: string;
	workspaceId: string;
}): Promise<readonly CollectionResource[]> {
	await requireWorkspaceNavigationAccess(
		input.database,
		input.userId,
		input.workspaceId,
	);
	const result = await input.database
		.prepare(
			`select
				c.id,
				c.workspace_id,
				c.name,
				c.description,
				c.archived_at,
				c.created_at,
				c.updated_at
			from collections c
			where c.workspace_id = ?1
				and (?2 = 1 or c.archived_at is null)
				and (
					exists (
						select 1 from workspace_memberships wm
						where wm.workspace_id = c.workspace_id and wm.user_id = ?3
					)
					or exists (
						select 1 from collection_memberships cm
						where cm.collection_id = c.id and cm.user_id = ?3
					)
				)
			order by c.updated_at desc, c.id`,
		)
		.bind(
			input.workspaceId,
			input.query.includeArchived ? 1 : 0,
			input.userId,
		)
		.all<CollectionRow>();
	return result.results.map(collectionResource);
}

export async function createCollection(input: {
	database: D1Database;
	userId: string;
	value: CollectionCreateInput;
	workspaceId: string;
}): Promise<CollectionResource> {
	await requireMutableWorkspace(
		input.database,
		input.userId,
		input.workspaceId,
		"settings_edit",
	);
	const now = Date.now();
	const collectionId = crypto.randomUUID();
	const created = await input.database
		.prepare(
			`insert into collections (
				id, workspace_id, name, description, created_by_user_id,
				created_at, updated_at
			)
			select ?1, w.id, ?2, ?3, ?4, ?5, ?5
			from workspaces w
			where w.id = ?6
				and w.archived_at is null
				and exists (
					select 1 from workspace_memberships actor
					where actor.workspace_id = w.id
						and actor.user_id = ?4
						and actor.role = 'owner'
				)
			returning id, workspace_id, name, description, archived_at,
				created_at, updated_at`,
		)
		.bind(
			collectionId,
			input.value.name,
			input.value.description ?? null,
			input.userId,
			now,
			input.workspaceId,
		)
		.first<CollectionRow>();
	if (created === null) {
		await requireMutableWorkspace(
			input.database,
			input.userId,
			input.workspaceId,
			"settings_edit",
		);
		throw conflict("The Workspace changed. Please retry.");
	}
	return collectionResource(created);
}

export async function readCollection(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<CollectionResource> {
	await requireCollectionCapability(
		input.database,
		input.userId,
		input.collectionId,
		"view",
	);
	const collection = await collectionStateById(
		input.database,
		input.collectionId,
	);
	if (collection === null) {
		throw notFound();
	}
	return collectionResource(collection);
}

export async function updateCollection(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
	value: CollectionUpdateInput;
}): Promise<CollectionResource> {
	const current = await requireMutableCollection(
		input.database,
		input.userId,
		input.collectionId,
		"collection_content_edit",
	);
	const now = Date.now();
	const hasName = "name" in input.value;
	const hasDescription = "description" in input.value;
	const updated = await input.database
		.prepare(
			`update collections
			set
				name = case when ?1 = 1 then ?2 else name end,
				description = case when ?3 = 1 then ?4 else description end,
				updated_at = ?5
			where id = ?6
				and archived_at is null
				and exists (
					select 1 from workspaces w
					where w.id = collections.workspace_id and w.archived_at is null
				)
				and (
					exists (
						select 1 from workspace_memberships actor_workspace
						where actor_workspace.workspace_id = collections.workspace_id
							and actor_workspace.user_id = ?7
							and actor_workspace.role in ('editor', 'owner')
					)
					or exists (
						select 1 from collection_memberships actor_collection
						where actor_collection.collection_id = collections.id
							and actor_collection.user_id = ?7
							and actor_collection.role in ('editor', 'owner')
					)
				)
			returning id, workspace_id, name, description, archived_at,
				created_at, updated_at`,
		)
		.bind(
			hasName ? 1 : 0,
			input.value.name ?? current.name,
			hasDescription ? 1 : 0,
			input.value.description ?? null,
			now,
			input.collectionId,
			input.userId,
		)
		.first<CollectionRow>();
	if (updated === null) {
		await requireMutableCollection(
			input.database,
			input.userId,
			input.collectionId,
			"collection_content_edit",
		);
		throw conflict("The Collection changed. Please retry.");
	}
	return collectionResource(updated);
}

export async function setCollectionArchived(input: {
	archived: boolean;
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<CollectionResource> {
	await requireCollectionCapability(
		input.database,
		input.userId,
		input.collectionId,
		"scope_archive",
	);
	const current = await collectionStateById(input.database, input.collectionId);
	if (current === null) {
		throw notFound();
	}
	if ((current.archived_at !== null) === input.archived) {
		return collectionResource(current);
	}
	if (current.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}

	const now = Date.now();
	const updated = await input.database
		.prepare(
			`update collections
			set archived_at = ?1, updated_at = ?2
			where id = ?3
				and (
					(?5 = 1 and archived_at is null)
					or (?5 = 0 and archived_at is not null)
				)
				and exists (
					select 1 from workspaces w
					where w.id = collections.workspace_id and w.archived_at is null
				)
				and (
					exists (
						select 1 from workspace_memberships actor_workspace
						where actor_workspace.workspace_id = collections.workspace_id
							and actor_workspace.user_id = ?4
							and actor_workspace.role = 'owner'
					)
					or exists (
						select 1 from collection_memberships actor_collection
						where actor_collection.collection_id = collections.id
							and actor_collection.user_id = ?4
							and actor_collection.role = 'owner'
					)
				)
			returning id, workspace_id, name, description, archived_at,
				created_at, updated_at`,
		)
		.bind(
			input.archived ? now : null,
			now,
			input.collectionId,
			input.userId,
			input.archived ? 1 : 0,
		)
		.first<CollectionRow>();
	if (updated !== null) {
		return collectionResource(updated);
	}

	await requireCollectionCapability(
		input.database,
		input.userId,
		input.collectionId,
		"scope_archive",
	);
	const refreshed = await collectionStateById(input.database, input.collectionId);
	if (refreshed === null) {
		throw notFound();
	}
	if ((refreshed.archived_at !== null) === input.archived) {
		return collectionResource(refreshed);
	}
	if (refreshed.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	throw conflict("The Collection changed. Please retry.");
}

export async function listItems(input: {
	collectionId: string;
	database: D1Database;
	query: ItemListQuery;
	userId: string;
}): Promise<{
	items: readonly ItemResource[];
	page: { limit: number; offset: number; hasMore: boolean };
	permissions: ItemPermissions;
}> {
	const access = requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			input.collectionId,
		),
		"view",
	);
	const limit = input.query.limit ?? 50;
	const offset = input.query.offset ?? 0;
	const conditions = ["i.collection_id = ?1"];
	const bindings: unknown[] = [input.collectionId];
	if (!input.query.includeArchived) {
		conditions.push("i.archived_at is null");
	}
	if (input.query.status !== undefined) {
		bindings.push(input.query.status);
		conditions.push(`i.status = ?${bindings.length}`);
	}
	if (input.query.groupLabel !== undefined) {
		bindings.push(input.query.groupLabel);
		conditions.push(`i.group_label = ?${bindings.length}`);
	}
	bindings.push(limit + 1);
	const limitParameter = bindings.length;
	bindings.push(offset);
	const offsetParameter = bindings.length;

	const result = await input.database
		.prepare(
			`select
				i.id,
				i.workspace_id,
				i.collection_id,
				i.title,
				i.description,
				i.requirements,
				i.priority,
				i.status,
				i.quantity_needed,
				i.group_label,
				i.budget_minor,
				i.budget_currency,
				i.deadline_at,
				i.archived_at,
				i.created_at,
				i.updated_at
			from items i
			where ${conditions.join(" and ")}
			order by i.created_at desc, i.id
			limit ?${limitParameter} offset ?${offsetParameter}`,
		)
		.bind(...bindings)
		.all<ItemRow>();
	const hasMore = result.results.length > limit;
	return {
		items: result.results.slice(0, limit).map(itemResource),
		page: { limit, offset, hasMore },
		permissions: itemPermissionsForAccess(access),
	};
}

export async function createItem(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
	value: ItemCreateInput;
}): Promise<ItemResource> {
	await requireMutableCollection(
		input.database,
		input.userId,
		input.collectionId,
		"item_create",
	);
	const itemId = crypto.randomUUID();
	const now = Date.now();
	const budgetMinor = input.value.budget?.minor ?? null;
	const budgetCurrency = input.value.budget?.currency ?? null;
	const deadlineAt =
		input.value.deadlineAt === undefined || input.value.deadlineAt === null
			? null
			: Date.parse(input.value.deadlineAt);
	const created = await input.database
		.prepare(
			`insert into items (
				id, workspace_id, collection_id, title, description, requirements, priority,
				status, quantity_needed, group_label, budget_minor,
				budget_currency, deadline_at, created_by_user_id,
				created_at, updated_at
			)
			select
				?1, c.workspace_id, c.id, ?2, ?3, ?4, ?5,
				'idea', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12
			from collections c
			join workspaces w on w.id = c.workspace_id
			where c.id = ?13
				and c.archived_at is null
				and w.archived_at is null
				and (
					exists (
						select 1 from workspace_memberships actor_workspace
						where actor_workspace.workspace_id = c.workspace_id
							and actor_workspace.user_id = ?11
							and actor_workspace.role in ('contributor', 'editor', 'owner')
					)
					or exists (
						select 1 from collection_memberships actor_collection
						where actor_collection.collection_id = c.id
							and actor_collection.user_id = ?11
							and actor_collection.role in ('contributor', 'editor', 'owner')
					)
				)
			returning
				id, workspace_id, collection_id, title, description, requirements, priority,
				status, quantity_needed, group_label, budget_minor,
				budget_currency, deadline_at, archived_at, created_at, updated_at`,
		)
		.bind(
			itemId,
			input.value.title,
			input.value.description ?? null,
			input.value.requirements ?? null,
			input.value.priority ?? "nice_to_have",
			input.value.quantityNeeded ?? 1,
			input.value.groupLabel ?? null,
			budgetMinor,
			budgetCurrency,
			deadlineAt,
			input.userId,
			now,
			input.collectionId,
		)
		.first<ItemRow>();
	if (created === null) {
		await requireMutableCollection(
			input.database,
			input.userId,
			input.collectionId,
			"item_create",
		);
		throw conflict("The Collection changed. Please retry.");
	}
	return itemResource(created);
}

export async function readItem(input: {
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemResource> {
	const item = await itemStateById(input.database, input.itemId);
	if (item === null) {
		throw notFound();
	}
	await requireCollectionCapability(
		input.database,
		input.userId,
		item.collection_id,
		"view",
	);
	return itemResource(item);
}

export async function updateItem(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: ItemUpdateInput;
}): Promise<ItemResource> {
	const current = await requireMutableItem(
		input.database,
		input.userId,
		input.itemId,
		"item_edit",
	);
	const next: ItemRow = {
		...current,
		title: input.value.title ?? current.title,
		description:
			"description" in input.value
				? (input.value.description ?? null)
				: current.description,
		requirements:
			"requirements" in input.value
				? (input.value.requirements ?? null)
				: current.requirements,
		priority: input.value.priority ?? current.priority,
		quantity_needed: input.value.quantityNeeded ?? current.quantity_needed,
		group_label:
			"groupLabel" in input.value
				? (input.value.groupLabel ?? null)
				: current.group_label,
		budget_minor:
			"budget" in input.value
				? (input.value.budget?.minor ?? null)
				: current.budget_minor,
		budget_currency:
			"budget" in input.value
				? (input.value.budget?.currency ?? null)
				: current.budget_currency,
		deadline_at:
			"deadlineAt" in input.value
				? input.value.deadlineAt == null
					? null
					: Date.parse(input.value.deadlineAt)
				: current.deadline_at,
	};
	const before = itemPlanningSnapshot(current);
	const after = itemPlanningSnapshot(next);
	if (JSON.stringify(before) === JSON.stringify(after)) {
		return itemResource(current);
	}

	const eventId = crypto.randomUUID();
	const now = Math.max(Date.now(), current.updated_at + 1);
	next.updated_at = now;
	const results = await input.database.batch([
		input.database
			.prepare(
				`insert into decision_events (
					id, item_id, kind, actor_user_id, before_snapshot_json,
					after_snapshot_json, created_at
				)
				select ?1, i.id, 'item_details_updated', ?2, ?3, ?4, ?5
				from items i
				join collections c on c.id = i.collection_id
				join workspaces w on w.id = i.workspace_id
				where i.id = ?6
					and i.updated_at = ?7
					and i.archived_at is null
					and c.archived_at is null
					and w.archived_at is null
					and (
						exists (
							select 1 from workspace_memberships actor_workspace
							where actor_workspace.workspace_id = i.workspace_id
								and actor_workspace.user_id = ?2
								and actor_workspace.role in ('contributor', 'editor', 'owner')
						)
						or exists (
							select 1 from collection_memberships actor_collection
							where actor_collection.collection_id = i.collection_id
								and actor_collection.user_id = ?2
								and actor_collection.role in ('contributor', 'editor', 'owner')
						)
					)`,
			)
			.bind(
				eventId,
				input.userId,
				JSON.stringify(before),
				JSON.stringify(after),
				now,
				input.itemId,
				current.updated_at,
			),
		input.database
			.prepare(
				`update items
				set title = ?1,
					description = ?2,
					requirements = ?3,
					priority = ?4,
					quantity_needed = ?5,
					group_label = ?6,
					budget_minor = ?7,
					budget_currency = ?8,
					deadline_at = ?9,
					updated_at = ?10
				where id = ?11
					and updated_at = ?12
					and exists (
						select 1 from decision_events event
						where event.id = ?13 and event.item_id = items.id
					)
				returning
					id, workspace_id, collection_id, title, description, requirements, priority,
					status, quantity_needed, group_label, budget_minor,
					budget_currency, deadline_at, archived_at, created_at, updated_at`,
			)
			.bind(
				next.title,
				next.description,
				next.requirements,
				next.priority,
				next.quantity_needed,
				next.group_label,
				next.budget_minor,
				next.budget_currency,
				next.deadline_at,
				now,
				input.itemId,
				current.updated_at,
				eventId,
			),
	]);
	const updated = results[1]?.results[0] as ItemRow | undefined;
	if (results[0]?.meta.changes !== 1 || updated === undefined) {
		await requireMutableItem(
			input.database,
			input.userId,
			input.itemId,
			"item_edit",
		);
		throw conflict("The Item changed. Please retry.");
	}
	return itemResource(updated);
}

export async function setItemArchived(input: {
	archived: boolean;
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemResource> {
	const current = await itemStateById(input.database, input.itemId);
	if (current === null) {
		throw notFound();
	}
	await requireCollectionCapability(
		input.database,
		input.userId,
		current.collection_id,
		"item_archive",
	);
	if ((current.archived_at !== null) === input.archived) {
		return itemResource(current);
	}
	if (current.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	if (current.collection_archived_at !== null) {
		throw resourceArchived("Collection");
	}

	const now = Date.now();
	const updated = await input.database
		.prepare(
			`update items
			set archived_at = ?1, updated_at = ?2
			where id = ?3
				and (
					(?5 = 1 and archived_at is null)
					or (?5 = 0 and archived_at is not null)
				)
				and exists (
					select 1
					from collections c
					join workspaces w on w.id = c.workspace_id
					where c.id = items.collection_id
						and c.archived_at is null
						and w.archived_at is null
				)
				and (
					exists (
						select 1 from workspace_memberships actor_workspace
						where actor_workspace.workspace_id = items.workspace_id
							and actor_workspace.user_id = ?4
							and actor_workspace.role in ('editor', 'owner')
					)
					or exists (
						select 1 from collection_memberships actor_collection
						where actor_collection.collection_id = items.collection_id
							and actor_collection.user_id = ?4
							and actor_collection.role in ('editor', 'owner')
					)
				)
			returning
				id, workspace_id, collection_id, title, description, requirements, priority,
				status, quantity_needed, group_label, budget_minor,
				budget_currency, deadline_at, archived_at, created_at, updated_at`,
		)
		.bind(
			input.archived ? now : null,
			now,
			input.itemId,
			input.userId,
			input.archived ? 1 : 0,
		)
		.first<ItemRow>();
	if (updated !== null) {
		return itemResource(updated);
	}

	const refreshed = await itemStateById(input.database, input.itemId);
	if (refreshed === null) {
		throw notFound();
	}
	await requireCollectionCapability(
		input.database,
		input.userId,
		refreshed.collection_id,
		"item_archive",
	);
	if ((refreshed.archived_at !== null) === input.archived) {
		return itemResource(refreshed);
	}
	if (refreshed.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	if (refreshed.collection_archived_at !== null) {
		throw resourceArchived("Collection");
	}
	throw conflict("The Item changed. Please retry.");
}
