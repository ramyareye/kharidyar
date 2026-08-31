import { validator } from "hono/validator";

import { badRequest } from "./api-errors";

interface SafeParseSuccess<T> {
	readonly success: true;
	readonly data: T;
}

interface SafeParseFailure {
	readonly success: false;
	readonly error: {
		readonly issues: readonly {
			readonly message: string;
			readonly path: readonly PropertyKey[];
		}[];
	};
}

interface ContractSchema<T> {
	safeParse(value: unknown): SafeParseSuccess<T> | SafeParseFailure;
}

export function parseContract<T>(schema: ContractSchema<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (result.success) {
		return result.data;
	}

	const issue = result.error.issues[0];
	const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
	throw badRequest(`Invalid request. ${field}${issue?.message ?? "Check the supplied fields."}`);
}

export function jsonContractValidator<T>(schema: ContractSchema<T>) {
	return validator("json", (value) => parseContract(schema, value));
}

export function queryContractValidator<T>(schema: ContractSchema<T>) {
	return validator("query", (value) => parseContract(schema, value));
}
