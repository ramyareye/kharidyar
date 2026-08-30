import {
	assertSafeNonNegativeInteger,
	DomainValidationError,
} from "./validation";

declare const currencyCodeBrand: unique symbol;
declare const minorAmountBrand: unique symbol;

export type CurrencyCode = string & {
	readonly [currencyCodeBrand]: "CurrencyCode";
};

export type MinorAmount = number & {
	readonly [minorAmountBrand]: "MinorAmount";
};

export interface Money {
	readonly minor: MinorAmount;
	readonly currency: CurrencyCode;
}

export function currencyCode(value: string): CurrencyCode {
	if (!/^[A-Z]{3}$/.test(value)) {
		throw new DomainValidationError(
			"currency",
			"currency must be a three-letter uppercase code",
		);
	}

	return value as CurrencyCode;
}

export function minorAmount(value: number): MinorAmount {
	assertSafeNonNegativeInteger(value, "minorAmount");
	return value as MinorAmount;
}

export function money(minor: number, currency: string): Money {
	return {
		minor: minorAmount(minor),
		currency: currencyCode(currency),
	};
}
