import { badRequest } from "./api-errors";

export async function readJsonObject(
	request: Request,
): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw badRequest("The request body must be valid JSON.");
	}

	if (body === null || typeof body !== "object" || Array.isArray(body)) {
		throw badRequest("The request body must be a JSON object.");
	}

	return body as Record<string, unknown>;
}

export function requiredIdentifier(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > 200 ||
		!/^[-A-Za-z0-9_:]+$/.test(value)
	) {
		throw badRequest(`${field} is invalid.`);
	}

	return value;
}
