import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";

import { createDatabase } from "../db/client";
import {
	account,
	rateLimit,
	session,
	user,
	verification,
} from "../db/schema/auth";
import {
	authAccountOptions,
	authIpAddressOptions,
	authRateLimitOptions,
	authSessionOptions,
} from "./shared-options";

export interface AuthBindings {
	AUTH_TRUSTED_ORIGINS: string;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	DB: D1Database;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
}

export interface AuthRuntimeConfig {
	baseURL: string;
	googleClientId: string;
	googleClientSecret: string;
	secret: string;
	trustedOrigins: string[];
	useSecureCookies: boolean;
}

const authSchema = { account, rateLimit, session, user, verification };

function requiredBinding(name: keyof AuthBindings, value: string): string {
	const normalized = value.trim();
	if (normalized.length === 0) {
		throw new Error(`Missing required authentication binding: ${name}`);
	}

	return normalized;
}

function webOrigin(value: string, field: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${field} must be an absolute URL`);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`${field} must use http or https`);
	}

	if (
		url.username !== "" ||
		url.password !== "" ||
		url.pathname !== "/" ||
		url.search !== "" ||
		url.hash !== ""
	) {
		throw new Error(`${field} must contain an origin only`);
	}

	return url.origin;
}

export function readAuthRuntimeConfig(
	bindings: AuthBindings,
): AuthRuntimeConfig {
	const baseURL = webOrigin(
		requiredBinding("BETTER_AUTH_URL", bindings.BETTER_AUTH_URL),
		"BETTER_AUTH_URL",
	);
	const secret = requiredBinding(
		"BETTER_AUTH_SECRET",
		bindings.BETTER_AUTH_SECRET,
	);
	if (secret.length < 32) {
		throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
	}

	const trustedOrigins = bindings.AUTH_TRUSTED_ORIGINS.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0)
		.map((origin) => webOrigin(origin, "AUTH_TRUSTED_ORIGINS"));

	if (!trustedOrigins.includes(baseURL)) {
		throw new Error("AUTH_TRUSTED_ORIGINS must include BETTER_AUTH_URL");
	}

	return {
		baseURL,
		googleClientId: requiredBinding(
			"GOOGLE_CLIENT_ID",
			bindings.GOOGLE_CLIENT_ID,
		),
		googleClientSecret: requiredBinding(
			"GOOGLE_CLIENT_SECRET",
			bindings.GOOGLE_CLIENT_SECRET,
		),
		secret,
		trustedOrigins: [...new Set(trustedOrigins)],
		useSecureCookies: new URL(baseURL).protocol === "https:",
	};
}

export function createAuth(bindings: AuthBindings) {
	const config = readAuthRuntimeConfig(bindings);
	const database = createDatabase(bindings.DB);

	return betterAuth({
		account: authAccountOptions,
		advanced: {
			ipAddress: authIpAddressOptions,
			useSecureCookies: config.useSecureCookies,
		},
		appName: "Kharidyar",
		baseURL: config.baseURL,
		database: drizzleAdapter(database, {
			provider: "sqlite",
			schema: authSchema,
			transaction: false,
		}),
		rateLimit: authRateLimitOptions,
		secret: config.secret,
		session: authSessionOptions,
		socialProviders: {
			google: {
				clientId: config.googleClientId,
				clientSecret: config.googleClientSecret,
			},
		},
		trustedOrigins: config.trustedOrigins,
	});
}

export type KharidyarAuth = ReturnType<typeof createAuth>;
export type KharidyarSession = KharidyarAuth["$Infer"]["Session"];
