import type { CurrencyCode, MinorAmount, Money } from "./money";
import { currencyCode, minorAmount } from "./money";
import type { PlannedPurchaseQuantity } from "./quantity";
import { checkedAdd, checkedMultiply, DomainValidationError } from "./validation";

export const merchantSalesChannels = ["online", "in_person", "both"] as const;
export type MerchantSalesChannel = (typeof merchantSalesChannels)[number];

export const offerPriceKinds = ["exact", "starting_at", "unknown"] as const;
export type OfferPriceKind = (typeof offerPriceKinds)[number];

export const shippingBases = ["per_line", "per_unit", "unknown"] as const;
export type ShippingBasis = (typeof shippingBases)[number];

export const availabilityStates = [
	"available",
	"unavailable",
	"unknown",
] as const;
export type AvailabilityState = (typeof availabilityStates)[number];

export const offerStaleAfterMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export function isOfferStale(
	lastCheckedAt: number,
	now = Date.now(),
	staleAfter = offerStaleAfterMilliseconds,
): boolean {
	if (
		!Number.isSafeInteger(lastCheckedAt) ||
		lastCheckedAt < 0 ||
		!Number.isSafeInteger(now) ||
		now < 0 ||
		!Number.isSafeInteger(staleAfter) ||
		staleAfter <= 0
	) {
		throw new DomainValidationError(
			"lastCheckedAt",
			"Offer freshness requires non-negative timestamps and a positive threshold",
		);
	}

	return now - lastCheckedAt > staleAfter;
}

export interface OfferTermsInput {
	readonly priceKind: OfferPriceKind;
	readonly unitPriceMinor?: number | null;
	readonly currency?: string | null;
	readonly shippingMinor?: number | null;
	readonly shippingBasis: ShippingBasis;
	readonly availability: AvailabilityState;
}

export interface OfferTerms {
	readonly priceKind: OfferPriceKind;
	readonly unitPriceMinor: MinorAmount | null;
	readonly currency: CurrencyCode | null;
	readonly shippingMinor: MinorAmount | null;
	readonly shippingBasis: ShippingBasis;
	readonly availability: AvailabilityState;
}

export function offerTerms(input: OfferTermsInput): OfferTerms {
	const unitPriceMinor =
		input.unitPriceMinor == null ? null : minorAmount(input.unitPriceMinor);
	const shippingMinor =
		input.shippingMinor == null ? null : minorAmount(input.shippingMinor);
	const currency = input.currency == null ? null : currencyCode(input.currency);

	if (input.priceKind === "unknown" && unitPriceMinor !== null) {
		throw new DomainValidationError(
			"unitPriceMinor",
			"an unknown price cannot include a unit price",
		);
	}

	if (input.priceKind !== "unknown" && (unitPriceMinor === null || currency === null)) {
		throw new DomainValidationError(
			"unitPriceMinor",
			"an exact or starting price requires an amount and currency",
		);
	}

	if (shippingMinor !== null && currency === null) {
		throw new DomainValidationError(
			"shippingMinor",
			"shipping requires the Offer currency",
		);
	}

	return {
		priceKind: input.priceKind,
		unitPriceMinor,
		currency,
		shippingMinor,
		shippingBasis: input.shippingBasis,
		availability: input.availability,
	};
}

export type PlannedCostStatus = "exact" | "lower_bound" | "incomplete";

export interface PlannedCost {
	readonly status: PlannedCostStatus;
	readonly currency: CurrencyCode | null;
	readonly merchandiseMinor: MinorAmount | null;
	readonly shippingMinor: MinorAmount | null;
	readonly totalMinor: MinorAmount | null;
	readonly missing: readonly ("unit_price" | "shipping")[];
}

export function calculatePlannedCost(
	offer: OfferTerms,
	plannedQuantity: PlannedPurchaseQuantity,
): PlannedCost {
	const shippingMinor =
		offer.shippingBasis === "unknown" || offer.shippingMinor === null
			? null
			: minorAmount(
					offer.shippingBasis === "per_unit"
						? checkedMultiply(
								offer.shippingMinor,
								plannedQuantity,
								"shippingMinor",
							)
						: offer.shippingMinor,
				);

	if (offer.unitPriceMinor === null || offer.currency === null) {
		return {
			status: "incomplete",
			currency: offer.currency,
			merchandiseMinor: null,
			shippingMinor,
			totalMinor: null,
			missing:
				shippingMinor === null
					? ["unit_price", "shipping"]
					: ["unit_price"],
		};
	}

	const merchandiseMinor = minorAmount(
		checkedMultiply(
			offer.unitPriceMinor,
			plannedQuantity,
			"merchandiseMinor",
		),
	);

	if (shippingMinor === null) {
		return {
			status: "incomplete",
			currency: offer.currency,
			merchandiseMinor,
			shippingMinor: null,
			totalMinor: null,
			missing: ["shipping"],
		};
	}

	const totalMinor = minorAmount(
		checkedAdd(merchandiseMinor, shippingMinor, "totalMinor"),
	);

	return {
		status: offer.priceKind === "starting_at" ? "lower_bound" : "exact",
		currency: offer.currency,
		merchandiseMinor,
		shippingMinor,
		totalMinor,
		missing: [],
	};
}

export function moneyFromCompleteCost(cost: PlannedCost): Money | null {
	if (cost.totalMinor === null || cost.currency === null) {
		return null;
	}

	return { minor: cost.totalMinor, currency: cost.currency };
}

export interface PlannedCostAggregate {
	readonly status: PlannedCostStatus;
	readonly currency: CurrencyCode;
	readonly merchandiseMinor: MinorAmount;
	readonly shippingMinor: MinorAmount;
	readonly totalMinor: MinorAmount;
	readonly completeLineCount: number;
	readonly incompleteLineCount: number;
	readonly currencyMismatchLineCount: number;
}

export function aggregatePlannedCosts(
	costs: readonly PlannedCost[],
	targetCurrency: string,
): PlannedCostAggregate {
	const currency = currencyCode(targetCurrency);
	let merchandiseMinor = minorAmount(0);
	let shippingMinor = minorAmount(0);
	let totalMinor = minorAmount(0);
	let completeLineCount = 0;
	let incompleteLineCount = 0;
	let currencyMismatchLineCount = 0;
	let hasLowerBound = false;

	for (const cost of costs) {
		if (cost.currency !== null && cost.currency !== currency) {
			currencyMismatchLineCount += 1;
			continue;
		}
		if (
			cost.status === "incomplete" ||
			cost.merchandiseMinor === null ||
			cost.shippingMinor === null ||
			cost.totalMinor === null
		) {
			incompleteLineCount += 1;
			continue;
		}

		completeLineCount += 1;
		hasLowerBound ||= cost.status === "lower_bound";
		merchandiseMinor = minorAmount(
			checkedAdd(merchandiseMinor, cost.merchandiseMinor, "merchandiseMinor"),
		);
		shippingMinor = minorAmount(
			checkedAdd(shippingMinor, cost.shippingMinor, "shippingMinor"),
		);
		totalMinor = minorAmount(
			checkedAdd(totalMinor, cost.totalMinor, "totalMinor"),
		);
	}

	return {
		status:
			costs.length === 0 ||
			incompleteLineCount > 0 ||
			currencyMismatchLineCount > 0
				? "incomplete"
				: hasLowerBound
					? "lower_bound"
					: "exact",
		currency,
		merchandiseMinor,
		shippingMinor,
		totalMinor,
		completeLineCount,
		incompleteLineCount,
		currencyMismatchLineCount,
	};
}
