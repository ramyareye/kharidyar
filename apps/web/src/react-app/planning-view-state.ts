import type { ApiErrorCode } from "@kharidyar/contracts";

export type LoadPhase = "idle" | "loading" | "ready";

export type PlanningViewState =
	| "empty-collections"
	| "empty-items"
	| "empty-workspaces"
	| "error"
	| "loading-collections"
	| "loading-items"
	| "loading-workspaces"
	| "ready"
	| "unauthorized";

export interface PlanningViewInput {
	collectionCount: number;
	collectionPhase: LoadPhase;
	errorCode: ApiErrorCode | null;
	itemCount: number;
	itemPhase: LoadPhase;
	selectedCollection: boolean;
	selectedWorkspace: boolean;
	workspaceCount: number;
	workspacePhase: LoadPhase;
}

export function resolvePlanningViewState({
	collectionCount,
	collectionPhase,
	errorCode,
	itemCount,
	itemPhase,
	selectedCollection,
	selectedWorkspace,
	workspaceCount,
	workspacePhase,
}: PlanningViewInput): PlanningViewState {
	if (workspacePhase !== "ready") {
		return "loading-workspaces";
	}

	if (errorCode === "UNAUTHENTICATED") {
		return "unauthorized";
	}

	if (errorCode) {
		return "error";
	}

	if (workspaceCount === 0) {
		return "empty-workspaces";
	}

	if (!selectedWorkspace || collectionPhase !== "ready") {
		return "loading-collections";
	}

	if (collectionCount === 0) {
		return "empty-collections";
	}

	if (!selectedCollection || itemPhase !== "ready") {
		return "loading-items";
	}

	if (itemCount === 0) {
		return "empty-items";
	}

	return "ready";
}
