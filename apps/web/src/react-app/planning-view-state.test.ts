import { describe, expect, it } from "vitest";

import {
	resolvePlanningViewState,
	type PlanningViewInput,
} from "./planning-view-state";

const readyInput: PlanningViewInput = {
	collectionCount: 1,
	collectionPhase: "ready",
	errorCode: null,
	itemCount: 1,
	itemPhase: "ready",
	selectedCollection: true,
	selectedWorkspace: true,
	workspaceCount: 1,
	workspacePhase: "ready",
};

describe("planning surface state", () => {
	it.each([
		[{ ...readyInput, workspacePhase: "loading" }, "loading-workspaces"],
		[{ ...readyInput, errorCode: "UNAUTHENTICATED" }, "unauthorized"],
		[{ ...readyInput, errorCode: "INTERNAL_ERROR" }, "error"],
		[{ ...readyInput, workspaceCount: 0 }, "empty-workspaces"],
		[{ ...readyInput, collectionPhase: "loading" }, "loading-collections"],
		[{ ...readyInput, collectionCount: 0 }, "empty-collections"],
		[{ ...readyInput, itemPhase: "loading" }, "loading-items"],
		[{ ...readyInput, itemCount: 0 }, "empty-items"],
		[readyInput, "ready"],
	] as const)("resolves %o as %s", (input, expected) => {
		expect(resolvePlanningViewState(input)).toBe(expected);
	});
});
