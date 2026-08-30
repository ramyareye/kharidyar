import { DomainValidationError } from "./validation";

declare const quantityNeededBrand: unique symbol;
declare const plannedPurchaseQuantityBrand: unique symbol;

export type QuantityNeeded = number & {
	readonly [quantityNeededBrand]: "QuantityNeeded";
};

export type PlannedPurchaseQuantity = number & {
	readonly [plannedPurchaseQuantityBrand]: "PlannedPurchaseQuantity";
};

function positiveInteger(value: number, field: string): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new DomainValidationError(
			field,
			`${field} must be a positive safe integer`,
		);
	}

	return value;
}

export function quantityNeeded(value: number): QuantityNeeded {
	return positiveInteger(value, "quantityNeeded") as QuantityNeeded;
}

export function plannedPurchaseQuantity(
	value: number,
): PlannedPurchaseQuantity {
	return positiveInteger(
		value,
		"plannedPurchaseQuantity",
	) as PlannedPurchaseQuantity;
}

export interface QuantityPlan {
	readonly needed: QuantityNeeded;
	readonly plannedPurchase: PlannedPurchaseQuantity;
}

export function quantityPlan(
	needed: number,
	plannedPurchase: number,
): QuantityPlan {
	return {
		needed: quantityNeeded(needed),
		plannedPurchase: plannedPurchaseQuantity(plannedPurchase),
	};
}
