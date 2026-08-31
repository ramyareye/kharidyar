import { describe, expect, it } from "vitest";

import {
	capabilities,
	capabilitiesForRole,
	canManageMembershipRole,
	canRemoveWorkspaceOwner,
	calculatePlannedCost,
  colorPalette,
	comparePlannedCostToBudget,
	DomainValidationError,
	groupLabel,
	hasCapability,
	itemStatusTransition,
	money,
  normalizeHexColor,
	offerTerms,
	plannedPurchaseQuantity,
	quantityPlan,
	resolveCapabilities,
	type MembershipGrant,
	type MembershipRole,
} from "../src";

describe("Item status decisions", () => {
	it("classifies progression, alternate skip, and unusual reversals", () => {
		expect(itemStatusTransition("idea", "decided")).toMatchObject({
			kind: "progression",
			unusual: false,
		});
		expect(itemStatusTransition("researching", "skipped")).toMatchObject({
			kind: "alternate",
			unusual: false,
		});
		expect(itemStatusTransition("purchased", "comparing")).toMatchObject({
			kind: "reversal",
			unusual: true,
		});
		expect(itemStatusTransition("skipped", "idea")).toMatchObject({
			kind: "reversal",
			unusual: true,
		});
	});

	it("does not create a transition for the current status", () => {
		expect(itemStatusTransition("comparing", "comparing")).toBeNull();
	});
});

describe("Collection color preference", () => {
  it("normalizes colors while preserving core and supporting order", () => {
    expect(
      colorPalette({
        core: ["#d8c7ad", "#334455"],
        supporting: ["#F4F0E8"],
      }),
    ).toEqual({
      core: ["#D8C7AD", "#334455"],
      supporting: ["#F4F0E8"],
    });
    expect(normalizeHexColor("  #aabbcc ")).toBe("#AABBCC");
  });

  it("rejects malformed, duplicate, and oversized palettes", () => {
    expect(() => normalizeHexColor("#ABC")).toThrow(DomainValidationError);
    expect(() =>
      colorPalette({ core: ["#ABCDEF"], supporting: ["#abcdef"] }),
    ).toThrow(DomainValidationError);
    expect(() =>
      colorPalette({
        core: Array.from({ length: 7 }, (_, index) => `#00000${index}`),
        supporting: [],
      }),
    ).toThrow(DomainValidationError);
  });
});

const roleOrder: readonly MembershipRole[] = [
	"viewer",
	"commenter",
	"contributor",
	"editor",
	"owner",
];

describe("capability authorization", () => {
	it("keeps every role bundle cumulative and record_purchase Owner-only", () => {
		for (const [index, role] of roleOrder.entries()) {
			const granted = capabilitiesForRole(role);
			const previous =
				index === 0 ? [] : capabilitiesForRole(roleOrder[index - 1]!);

			for (const capability of previous) {
				expect(granted.has(capability)).toBe(true);
			}
		}

		for (const role of roleOrder) {
			const granted = capabilitiesForRole(role);
			for (const capability of capabilities) {
				expect(granted.has(capability)).toBe(
					roleCapabilitiesExpected(role, capability),
				);
			}
		}

		expect(capabilitiesForRole("owner").has("record_purchase")).toBe(true);
		for (const role of roleOrder.slice(0, -1)) {
			expect(capabilitiesForRole(role).has("record_purchase")).toBe(false);
		}
	});

	it("applies Workspace grants to current and future Collections", () => {
		const grants: MembershipGrant[] = [
			{ scope: "workspace", workspaceId: "home", role: "contributor" },
		];

		expect(
			hasCapability(
				grants,
				{ workspaceId: "home", collectionId: "existing" },
				"item_create",
			),
		).toBe(true);
		expect(
			hasCapability(
				grants,
				{ workspaceId: "home", collectionId: "created-later" },
				"item_create",
			),
		).toBe(true);
	});

	it("isolates Collection grants from siblings and the parent Workspace", () => {
		const grants: MembershipGrant[] = [
			{
				scope: "collection",
				workspaceId: "home",
				collectionId: "bedroom",
				role: "owner",
			},
		];

		expect(
			hasCapability(
				grants,
				{ workspaceId: "home", collectionId: "bedroom" },
				"settings_edit",
			),
		).toBe(true);
		expect(
			hasCapability(
				grants,
				{ workspaceId: "home", collectionId: "living-room" },
				"view",
			),
		).toBe(false);
		expect(hasCapability(grants, { workspaceId: "home" }, "view")).toBe(false);
	});

	it("combines overlapping grants without creating a deny rule", () => {
		const grants: MembershipGrant[] = [
			{ scope: "workspace", workspaceId: "home", role: "viewer" },
			{
				scope: "collection",
				workspaceId: "home",
				collectionId: "bedroom",
				role: "editor",
			},
		];

		const bedroom = resolveCapabilities(grants, {
			workspaceId: "home",
			collectionId: "bedroom",
		});
		expect(bedroom.has("view")).toBe(true);
		expect(bedroom.has("collection_brief_edit")).toBe(true);
		expect(bedroom.has("record_purchase")).toBe(false);
		expect(
			hasCapability(
				grants,
				{ workspaceId: "home", collectionId: "living-room" },
				"collection_brief_edit",
			),
		).toBe(false);
	});

	it("reserves Owner access management for Workspace-scoped Owners", () => {
		const collectionOwner: MembershipGrant[] = [
			{
				scope: "collection",
				workspaceId: "home",
				collectionId: "bedroom",
				role: "owner",
			},
		];
		const workspaceOwner: MembershipGrant[] = [
			{ scope: "workspace", workspaceId: "home", role: "owner" },
		];
		const bedroom = { workspaceId: "home", collectionId: "bedroom" };

		expect(canManageMembershipRole(collectionOwner, bedroom, "editor")).toBe(
			true,
		);
		expect(canManageMembershipRole(collectionOwner, bedroom, "owner")).toBe(
			false,
		);
		expect(canManageMembershipRole(workspaceOwner, bedroom, "owner")).toBe(
			true,
		);
		expect(canRemoveWorkspaceOwner(1)).toBe(false);
		expect(canRemoveWorkspaceOwner(2)).toBe(true);
	});
});

function roleCapabilitiesExpected(
	role: MembershipRole,
	capability: (typeof capabilities)[number],
): boolean {
	const minimumRoleByCapability: Record<
		(typeof capabilities)[number],
		MembershipRole
	> = {
		view: "viewer",
		export_context: "viewer",
		comment_create: "commenter",
		comment_edit_own: "commenter",
		comment_remove_own: "commenter",
		vote_manage_own: "commenter",
		item_create: "contributor",
		item_edit: "contributor",
		candidate_manage: "contributor",
		product_manage: "contributor",
		offer_manage: "contributor",
		research_manage: "contributor",
		offer_refresh: "contributor",
		research_result_promote: "contributor",
		collection_content_edit: "editor",
		collection_brief_edit: "editor",
		concept_edit: "editor",
		item_archive: "editor",
		candidate_archive: "editor",
		item_status_non_purchase: "editor",
		comment_moderate: "editor",
		research_result_moderate: "editor",
		settings_edit: "owner",
		members_manage_non_owner: "owner",
		invitations_manage: "owner",
		record_purchase: "owner",
		scope_archive: "owner",
		scope_delete: "owner",
	};

	return (
		roleOrder.indexOf(role) >=
		roleOrder.indexOf(minimumRoleByCapability[capability])
	);
}

describe("quantity planning", () => {
	it("keeps Item need and Candidate purchase quantities independent", () => {
		const plan = quantityPlan(4, 2);

		expect(plan.needed).toBe(4);
		expect(plan.plannedPurchase).toBe(2);
	});

	it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid positive quantity %s",
		(value) => {
			expect(() => quantityPlan(value, 1)).toThrow(DomainValidationError);
			expect(() => quantityPlan(1, value)).toThrow(DomainValidationError);
		},
	);
});

describe("Offer planned costs", () => {
	it("uses Candidate purchase units without inferring pack coverage", () => {
		const quantities = quantityPlan(4, 2);
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: "exact",
				unitPriceMinor: 5_999,
				currency: "EUR",
				shippingMinor: 500,
				shippingBasis: "per_line",
				availability: "available",
			}),
			quantities.plannedPurchase,
		);

		expect(cost).toMatchObject({
			status: "exact",
			merchandiseMinor: 11_998,
			shippingMinor: 500,
			totalMinor: 12_498,
		});
	});

	it("multiplies only per-unit shipping", () => {
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: "exact",
				unitPriceMinor: 1_000,
				currency: "EUR",
				shippingMinor: 250,
				shippingBasis: "per_unit",
				availability: "available",
			}),
			plannedPurchaseQuantity(3),
		);

		expect(cost.shippingMinor).toBe(750);
		expect(cost.totalMinor).toBe(3_750);
	});

	it("keeps starting prices as lower bounds", () => {
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: "starting_at",
				unitPriceMinor: 2_299,
				currency: "EUR",
				shippingMinor: 0,
				shippingBasis: "per_line",
				availability: "unknown",
			}),
			plannedPurchaseQuantity(1),
		);

		expect(cost.status).toBe("lower_bound");
		expect(cost.totalMinor).toBe(2_299);
	});

	it("does not silently treat unknown shipping as zero", () => {
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: "exact",
				unitPriceMinor: 10_000,
				currency: "EUR",
				shippingBasis: "unknown",
				availability: "available",
			}),
			plannedPurchaseQuantity(2),
		);

		expect(cost).toMatchObject({
			status: "incomplete",
			merchandiseMinor: 20_000,
			shippingMinor: null,
			totalMinor: null,
			missing: ["shipping"],
		});
	});

	it("does not fabricate a total for an unknown price", () => {
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: "unknown",
				currency: "EUR",
				shippingMinor: 500,
				shippingBasis: "per_line",
				availability: "unknown",
			}),
			plannedPurchaseQuantity(1),
		);

		expect(cost).toMatchObject({
			status: "incomplete",
			merchandiseMinor: null,
			shippingMinor: 500,
			totalMinor: null,
			missing: ["unit_price"],
		});
	});
});

describe("group and budget primitives", () => {
	it("normalizes a lightweight group label", () => {
		expect(groupLabel("  Bedroom  ")).toBe("Bedroom");
	});

	it("compares only complete, same-currency totals", () => {
		const exactCost = calculatePlannedCost(
			offerTerms({
				priceKind: "exact",
				unitPriceMinor: 8_000,
				currency: "EUR",
				shippingMinor: 0,
				shippingBasis: "per_line",
				availability: "available",
			}),
			plannedPurchaseQuantity(2),
		);

		expect(comparePlannedCostToBudget(exactCost, money(20_000, "EUR"))).toEqual(
			{
				status: "within_budget",
				differenceMinor: 4_000,
			},
		);
		expect(comparePlannedCostToBudget(exactCost, money(20_000, "USD"))).toEqual(
			{
				status: "currency_mismatch",
			},
		);
	});

	it("does not call a starting-price lower bound within budget", () => {
		const lowerBound = calculatePlannedCost(
			offerTerms({
				priceKind: "starting_at",
				unitPriceMinor: 8_000,
				currency: "EUR",
				shippingMinor: 0,
				shippingBasis: "per_line",
				availability: "available",
			}),
			plannedPurchaseQuantity(2),
		);

		expect(
			comparePlannedCostToBudget(lowerBound, money(20_000, "EUR")),
		).toEqual({
			status: "lower_bound",
			differenceMinor: 4_000,
		});
	});
});
