import type {
	ItemPermissions,
	ItemPlanningSnapshot,
} from "@kharidyar/contracts";
import {
	itemStatuses,
	itemStatusTransition,
	type ItemStatus,
} from "@kharidyar/domain";

export const itemSnapshotFields = [
	"title",
	"description",
	"requirements",
	"priority",
	"status",
	"quantityNeeded",
	"groupLabel",
	"budget",
	"deadlineAt",
] as const;

export type ItemSnapshotField = (typeof itemSnapshotFields)[number];

export function changedItemSnapshotFields(
	before: ItemPlanningSnapshot,
	after: ItemPlanningSnapshot,
): ItemSnapshotField[] {
	return itemSnapshotFields.filter(
		(field) =>
			JSON.stringify(before[field]) !== JSON.stringify(after[field]),
	);
}

export function availableItemStatuses(
	current: ItemStatus,
	permissions: ItemPermissions,
): ItemStatus[] {
	return itemStatuses.filter(
		(status) =>
			status !== current &&
			(status === "purchased"
				? permissions.canMarkPurchased
				: permissions.canChangeNonPurchaseStatus),
	);
}

export function isUnusualItemStatusChange(
	current: ItemStatus,
	next: ItemStatus,
): boolean {
	return itemStatusTransition(current, next)?.unusual ?? false;
}

export function deadlineInputValue(value: string | null): string {
	return value?.slice(0, 10) ?? "";
}

export function deadlineIsoValue(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? `${trimmed}T12:00:00.000Z` : null;
}
