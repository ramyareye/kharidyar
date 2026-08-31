import type { ApiErrorCode } from "@kharidyar/contracts";

export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429;
	readonly retryAfterSeconds?: number;

	constructor(
		status: ApiError["status"],
		code: ApiErrorCode,
		message: string,
		options?: { retryAfterSeconds?: number },
	) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.retryAfterSeconds = options?.retryAfterSeconds;
	}
}

export function badRequest(message: string): ApiError {
	return new ApiError(400, "BAD_REQUEST", message);
}

export function conflict(message: string): ApiError {
	return new ApiError(409, "CONFLICT", message);
}

export function forbidden(message = "You do not have permission to do that.") {
	return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "The requested resource was not found.") {
	return new ApiError(404, "NOT_FOUND", message);
}

export function resourceArchived(resource: string): ApiError {
	return new ApiError(
		409,
		"RESOURCE_ARCHIVED",
		`${resource} is archived and must be restored before it can be changed.`,
	);
}
