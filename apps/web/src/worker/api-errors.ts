export type ApiErrorCode =
	| "BAD_REQUEST"
	| "CONFLICT"
	| "FORBIDDEN"
	| "INVITATION_EMAIL_MISMATCH"
	| "INVITATION_EXPIRED"
	| "INVITATION_INVALID"
	| "INVITATION_REVOKED"
	| "NOT_FOUND"
	| "RATE_LIMITED"
	| "UNAUTHENTICATED";

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

export function forbidden(message = "You do not have permission to do that.") {
	return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "The requested resource was not found.") {
	return new ApiError(404, "NOT_FOUND", message);
}
