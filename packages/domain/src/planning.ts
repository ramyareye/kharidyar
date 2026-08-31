import type { Money } from "./money";
import type { PlannedCost } from "./offer";
import { DomainValidationError } from "./validation";

export const itemPriorities = ["essential", "soon", "nice_to_have"] as const;
export type ItemPriority = (typeof itemPriorities)[number];

export const itemStatuses = [
	"idea",
	"researching",
	"comparing",
	"decided",
	"purchased",
	"skipped",
] as const;
export type ItemStatus = (typeof itemStatuses)[number];

declare const groupLabelBrand: unique symbol;

export type GroupLabel = string & {
	readonly [groupLabelBrand]: "GroupLabel";
};

export function groupLabel(value: string): GroupLabel {
	const normalized = value.trim();
	if (normalized.length === 0 || normalized.length > 80) {
		throw new DomainValidationError(
			"groupLabel",
			"groupLabel must contain 1 to 80 characters",
		);
	}

	return normalized as GroupLabel;
}

export type BudgetComparison =
	| {
			readonly status: "within_budget" | "over_budget" | "lower_bound";
			readonly differenceMinor: number;
	  }
	| { readonly status: "incomplete" | "currency_mismatch" };

export function comparePlannedCostToBudget(
	cost: PlannedCost,
	budget: Money,
): BudgetComparison {
	if (cost.status === "incomplete" || cost.totalMinor === null) {
		return { status: "incomplete" };
	}

	if (cost.currency !== budget.currency) {
		return { status: "currency_mismatch" };
	}

	const differenceMinor = Math.abs(cost.totalMinor - budget.minor);
	if (cost.status === "lower_bound" && cost.totalMinor <= budget.minor) {
		return { status: "lower_bound", differenceMinor };
	}

	return {
		status:
			cost.totalMinor <= budget.minor ? "within_budget" : "over_budget",
		differenceMinor,
	};
}
