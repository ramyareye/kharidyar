export class DomainValidationError extends Error {
	readonly field: string;

	constructor(field: string, message: string) {
		super(message);
		this.name = "DomainValidationError";
		this.field = field;
	}
}

export function assertSafeNonNegativeInteger(
	value: number,
	field: string,
): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new DomainValidationError(
			field,
			`${field} must be a non-negative safe integer`,
		);
	}
}

export function checkedAdd(left: number, right: number, field: string): number {
	const result = left + right;
	assertSafeNonNegativeInteger(result, field);
	return result;
}

export function checkedMultiply(
	left: number,
	right: number,
	field: string,
): number {
	const result = left * right;
	assertSafeNonNegativeInteger(result, field);
	return result;
}
