import { ApiError } from "./api-errors";

export const invitationPreviewRateLimit = {
	limit: 10,
	windowMilliseconds: 60_000,
} as const;

export const invitationAcceptanceRateLimit = {
	limit: 10,
	windowMilliseconds: 60_000,
} as const;

export const researchCreationRateLimit = {
	limit: 5,
	windowMilliseconds: 60_000,
} as const;

interface RateLimitRow {
	count: number;
	window_started_at: number;
}

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function privateRateLimitKey(
	secret: string,
	action: string,
	identity: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${action}:${identity}`),
	);
	return bytesToHex(new Uint8Array(signature));
}

export async function enforceCollaborationRateLimit(input: {
	action:
		| "invitation_acceptance"
		| "invitation_preview"
		| "research_creation";
	database: D1Database;
	identity: string;
	limit: number;
	now: number;
	secret: string;
	windowMilliseconds: number;
}): Promise<void> {
	const key = await privateRateLimitKey(
		input.secret,
		input.action,
		input.identity,
	);
	const resetBefore = input.now - input.windowMilliseconds;
	const row = await input.database
		.prepare(
			`insert into collaboration_rate_limits (
				key, count, window_started_at, updated_at
			) values (?1, 1, ?2, ?2)
			on conflict(key) do update set
				count = case
					when window_started_at <= ?3 then 1
					else count + 1
				end,
				window_started_at = case
					when window_started_at <= ?3 then ?2
					else window_started_at
				end,
				updated_at = ?2
			returning count, window_started_at`,
		)
		.bind(key, input.now, resetBefore)
		.first<RateLimitRow>();

	if (row === null) {
		throw new Error("Rate limit update returned no result");
	}

	if (row.count > input.limit) {
		const retryAfterSeconds = Math.max(
			1,
			Math.ceil(
				(row.window_started_at + input.windowMilliseconds - input.now) / 1_000,
			),
		);
		throw new ApiError(
			429,
			"RATE_LIMITED",
			input.action === "research_creation"
				? "Too many research requests. Please try again later."
				: "Too many invitation requests. Please try again later.",
			{ retryAfterSeconds },
		);
	}
}
