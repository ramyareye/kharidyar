import { describe, expect, it } from "vitest";

import {
	calculatePlannedCost,
	comparePlannedCostToBudget,
	DomainValidationError,
	groupLabel,
	money,
	offerTerms,
	plannedPurchaseQuantity,
	quantityPlan,
} from "../src";

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

		expect(comparePlannedCostToBudget(exactCost, money(20_000, "EUR"))).toEqual({
			status: "within_budget",
			differenceMinor: 4_000,
		});
		expect(comparePlannedCostToBudget(exactCost, money(20_000, "USD"))).toEqual({
			status: "currency_mismatch",
		});
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

		expect(comparePlannedCostToBudget(lowerBound, money(20_000, "EUR"))).toEqual({
			status: "lower_bound",
			differenceMinor: 4_000,
		});
	});
});
