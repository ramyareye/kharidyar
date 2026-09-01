import type { ItemStatus } from "./planning";

export const decisionEventKinds = [
	"item_details_updated",
	"item_status_changed",
	"planned_candidate_changed",
	"purchase_recorded",
] as const;

export type DecisionEventKind = (typeof decisionEventKinds)[number];

export const itemStatusTransitionKinds = [
	"progression",
	"alternate",
	"reversal",
] as const;

export type ItemStatusTransitionKind =
	(typeof itemStatusTransitionKinds)[number];

const progressOrder: Readonly<Record<Exclude<ItemStatus, "skipped">, number>> = {
	idea: 0,
	researching: 1,
	comparing: 2,
	decided: 3,
	purchased: 4,
};

export interface ItemStatusTransition {
	readonly from: ItemStatus;
	readonly to: ItemStatus;
	readonly kind: ItemStatusTransitionKind;
	readonly unusual: boolean;
}

export function itemStatusTransition(
	from: ItemStatus,
	to: ItemStatus,
): ItemStatusTransition | null {
	if (from === to) {
		return null;
	}

	if (from === "skipped") {
		return { from, to, kind: "reversal", unusual: true };
	}

	if (to === "skipped") {
		return { from, to, kind: "alternate", unusual: false };
	}

	const reversal = progressOrder[to] < progressOrder[from];
	return {
		from,
		to,
		kind: reversal ? "reversal" : "progression",
		unusual: reversal,
	};
}
