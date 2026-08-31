import {
	itemPlanningSnapshotSchema,
	type DecisionEventResource,
	type ItemPermissions,
	type ItemResource,
	type ItemStatusChangeInput,
	type ItemStatusDecisionEvent,
} from "@kharidyar/contracts";
import {
	itemStatusTransition,
	type DecisionEventKind,
	type ItemStatus,
	type ItemStatusTransitionKind,
} from "@kharidyar/domain";

import { conflict, notFound, resourceArchived } from "./api-errors";
import { loadCollectionAccess, requireCapability } from "./authorization";
import {
	itemResource,
	type ItemRow,
} from "./core-workspace-service";
import { itemPermissionsForAccess } from "./item-workflow-permissions";

interface ItemWorkflowRow extends ItemRow {
	collection_archived_at: number | null;
	workspace_archived_at: number | null;
}

interface DecisionEventRow {
	id: string;
	item_id: string;
	kind: DecisionEventKind;
	actor_user_id: string;
	actor_name: string;
	actor_image: string | null;
	before_snapshot_json: string | null;
	after_snapshot_json: string | null;
	from_status: ItemStatus | null;
	to_status: ItemStatus | null;
	transition_kind: ItemStatusTransitionKind | null;
	note: string | null;
	created_at: number;
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function decisionEventResource(row: DecisionEventRow): DecisionEventResource {
	const base = {
		id: row.id,
		itemId: row.item_id,
		actor: {
			id: row.actor_user_id,
			name: row.actor_name,
			image: row.actor_image,
		},
		createdAt: timestamp(row.created_at),
	};

	if (row.kind === "item_details_updated") {
		if (
			row.before_snapshot_json === null ||
			row.after_snapshot_json === null
		) {
			throw new Error("Stored Item details decision is incomplete");
		}
		return {
			...base,
			kind: row.kind,
			before: itemPlanningSnapshotSchema.parse(
				JSON.parse(row.before_snapshot_json),
			),
			after: itemPlanningSnapshotSchema.parse(
				JSON.parse(row.after_snapshot_json),
			),
		};
	}

	if (
		row.kind !== "item_status_changed" ||
		row.from_status === null ||
		row.to_status === null ||
		row.transition_kind === null
	) {
		throw new Error("Stored Item status decision is incomplete");
	}

	return {
		...base,
		kind: row.kind,
		fromStatus: row.from_status,
		toStatus: row.to_status,
		transitionKind: row.transition_kind,
		unusual: row.transition_kind === "reversal",
		note: row.note,
	};
}

async function itemWorkflowRow(
	database: D1Database,
	itemId: string,
): Promise<ItemWorkflowRow | null> {
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
		.first<ItemWorkflowRow>();
}

async function decisionEvents(
	database: D1Database,
	itemId: string,
): Promise<DecisionEventResource[]> {
	const result = await database
		.prepare(
			`select
				e.id,
				e.item_id,
				e.kind,
				e.actor_user_id,
				u.name as actor_name,
				u.image as actor_image,
				e.before_snapshot_json,
				e.after_snapshot_json,
				e.from_status,
				e.to_status,
				e.transition_kind,
				e.note,
				e.created_at
			from decision_events e
			join user u on u.id = e.actor_user_id
			where e.item_id = ?1
			order by e.created_at desc, e.id desc
			limit 100`,
		)
		.bind(itemId)
		.all<DecisionEventRow>();
	return result.results.map(decisionEventResource);
}

async function decisionEventById(
	database: D1Database,
	eventId: string,
): Promise<DecisionEventResource | null> {
	const row = await database
		.prepare(
			`select
				e.id,
				e.item_id,
				e.kind,
				e.actor_user_id,
				u.name as actor_name,
				u.image as actor_image,
				e.before_snapshot_json,
				e.after_snapshot_json,
				e.from_status,
				e.to_status,
				e.transition_kind,
				e.note,
				e.created_at
			from decision_events e
			join user u on u.id = e.actor_user_id
			where e.id = ?1`,
		)
		.bind(eventId)
		.first<DecisionEventRow>();
	return row === null ? null : decisionEventResource(row);
}

export async function readItemWorkflow(input: {
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<{
	item: ItemResource;
	events: DecisionEventResource[];
	permissions: ItemPermissions;
}> {
	const item = await itemWorkflowRow(input.database, input.itemId);
	if (item === null) {
		throw notFound();
	}
	const access = requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			item.collection_id,
		),
		"view",
	);
	return {
		item: itemResource(item),
		events: await decisionEvents(input.database, input.itemId),
		permissions: itemPermissionsForAccess(access),
	};
}

export async function changeItemStatus(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: ItemStatusChangeInput;
}): Promise<{ item: ItemResource; event: ItemStatusDecisionEvent }> {
	const current = await itemWorkflowRow(input.database, input.itemId);
	if (current === null) {
		throw notFound();
	}
	const requiredCapability =
		input.value.status === "purchased"
			? "record_purchase"
			: "item_status_non_purchase";
	requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			current.collection_id,
		),
		requiredCapability,
	);
	if (current.workspace_archived_at !== null) {
		throw resourceArchived("Workspace");
	}
	if (current.collection_archived_at !== null) {
		throw resourceArchived("Collection");
	}
	if (current.archived_at !== null) {
		throw resourceArchived("Item");
	}

	const transition = itemStatusTransition(
		current.status,
		input.value.status,
	);
	if (transition === null) {
		throw conflict("The Item already has this status.");
	}

	const eventId = crypto.randomUUID();
	const now = Math.max(Date.now(), current.updated_at + 1);
	const results = await input.database.batch([
		input.database
			.prepare(
				`insert into decision_events (
					id, item_id, kind, actor_user_id, from_status, to_status,
					transition_kind, note, created_at
				)
				select
					?1, i.id, 'item_status_changed', ?2, i.status, ?3,
					?4, ?5, ?6
				from items i
				join collections c on c.id = i.collection_id
				join workspaces w on w.id = i.workspace_id
				where i.id = ?7
					and i.status = ?8
					and i.updated_at = ?9
					and i.archived_at is null
					and c.archived_at is null
					and w.archived_at is null
					and (
						exists (
							select 1 from workspace_memberships actor_workspace
							where actor_workspace.workspace_id = i.workspace_id
								and actor_workspace.user_id = ?2
								and (
									(?3 = 'purchased' and actor_workspace.role = 'owner')
									or
									(?3 <> 'purchased' and actor_workspace.role in ('editor', 'owner'))
								)
						)
						or exists (
							select 1 from collection_memberships actor_collection
							where actor_collection.collection_id = i.collection_id
								and actor_collection.user_id = ?2
								and (
									(?3 = 'purchased' and actor_collection.role = 'owner')
									or
									(?3 <> 'purchased' and actor_collection.role in ('editor', 'owner'))
								)
						)
					)`,
			)
			.bind(
				eventId,
				input.userId,
				input.value.status,
				transition.kind,
				input.value.note ?? null,
				now,
				input.itemId,
				current.status,
				current.updated_at,
			),
		input.database
			.prepare(
				`update items
				set status = ?1, updated_at = ?2
				where id = ?3
					and status = ?4
					and updated_at = ?5
					and exists (
						select 1 from decision_events event
						where event.id = ?6 and event.item_id = items.id
					)
				returning
					id, workspace_id, collection_id, title, description, requirements,
					priority, status, quantity_needed, group_label, budget_minor,
					budget_currency, deadline_at, archived_at, created_at, updated_at`,
			)
			.bind(
				input.value.status,
				now,
				input.itemId,
				current.status,
				current.updated_at,
				eventId,
			),
	]);
	const updated = results[1]?.results[0] as ItemRow | undefined;
	if (results[0]?.meta.changes !== 1 || updated === undefined) {
		const refreshed = await itemWorkflowRow(input.database, input.itemId);
		if (refreshed === null) {
			throw notFound();
		}
		requireCapability(
			await loadCollectionAccess(
				input.database,
				input.userId,
				refreshed.collection_id,
			),
			requiredCapability,
		);
		throw conflict("The Item changed. Please review its current status.");
	}

	const event = await decisionEventById(input.database, eventId);
	if (event === null || event.kind !== "item_status_changed") {
		throw new Error("The Item status decision could not be read");
	}
	return { item: itemResource(updated), event };
}
