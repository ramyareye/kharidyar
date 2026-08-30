import { badRequest } from "./api-errors";

const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

export function createRawInvitationToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return bytesToBase64Url(bytes);
}

export function parseRawInvitationToken(value: unknown): string {
	if (typeof value !== "string" || !invitationTokenPattern.test(value)) {
		throw badRequest("The invitation token is invalid.");
	}

	return value;
}

export async function hashInvitationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return bytesToHex(new Uint8Array(digest));
}

export function normalizeInvitationEmail(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (
		normalized.length < 3 ||
		normalized.length > 320 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
	) {
		throw badRequest("invitedEmail must be a valid email address.");
	}

	return normalized;
}
