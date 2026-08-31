import { describe, expect, it } from "vitest";

import type {
	ItemPermissions,
	ItemPlanningSnapshot,
} from "@kharidyar/contracts";
import {
	availableItemStatuses,
	changedItemSnapshotFields,
	deadlineInputValue,
	deadlineIsoValue,
	isUnusualItemStatusChange,
} from "./item-workflow-state";

const snapshot: ItemPlanningSnapshot = {
	title: "Bed",
	description: null,
	requirements: null,
	priority: "essential",
	status: "idea",
	quantityNeeded: 1,
	groupLabel: "Bedroom",
	budget: null,
	deadlineAt: null,
};

const editor: ItemPermissions = {
	canCreate: true,
	canEdit: true,
	canArchive: true,
	canChangeNonPurchaseStatus: true,
	canMarkPurchased: false,
};

describe("Item workflow UI state", () => {
	it("finds audited detail fields without treating equal values as changes", () => {
		expect(
			changedItemSnapshotFields(snapshot, {
				...snapshot,
				requirements: "Solid wood",
				quantityNeeded: 2,
			}),
		).toEqual(["requirements", "quantityNeeded"]);
	});

	it("offers only capability-allowed statuses", () => {
		expect(availableItemStatuses("idea", editor)).not.toContain("purchased");
		expect(availableItemStatuses("idea", editor)).toContain("decided");
		expect(
			availableItemStatuses("idea", {
				...editor,
				canChangeNonPurchaseStatus: false,
				canMarkPurchased: true,
			}),
		).toEqual(["purchased"]);
	});

	it("warns about reversals while allowing them", () => {
		expect(isUnusualItemStatusChange("purchased", "comparing")).toBe(true);
		expect(isUnusualItemStatusChange("idea", "skipped")).toBe(false);
	});

	it("round-trips the date-only deadline input at canonical noon UTC", () => {
		expect(deadlineInputValue("2026-11-15T12:00:00.000Z")).toBe(
			"2026-11-15",
		);
		expect(deadlineIsoValue("2026-11-15")).toBe(
			"2026-11-15T12:00:00.000Z",
		);
		expect(deadlineIsoValue(" ")).toBeNull();
	});
});
