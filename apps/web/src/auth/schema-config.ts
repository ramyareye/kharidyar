import { betterAuth } from "better-auth/minimal";

import {
	authAccountOptions,
	authRateLimitOptions,
	authSessionOptions,
} from "./shared-options";

export const auth = betterAuth({
	appName: "Kharidyar",
	// This config exists only for deterministic schema generation. Task 3 owns
	// request-aware runtime URL and secret configuration.
	baseURL: "http://localhost:5173",
	secret: "schema-generation-only-secret-change-me-1234567890",
	account: authAccountOptions,
	rateLimit: authRateLimitOptions,
	session: authSessionOptions,
	socialProviders: {
		google: {
			clientId: "schema-generation-client-id",
			clientSecret: "schema-generation-client-secret",
		},
	},
});
