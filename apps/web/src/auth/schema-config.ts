import { betterAuth } from "better-auth";

export const auth = betterAuth({
	appName: "Kharidyar",
	// This config exists only for deterministic schema generation. Task 3 owns
	// request-aware runtime URL and secret configuration.
	baseURL: "http://localhost:5173",
	account: {
		accountLinking: {
			disableImplicitLinking: true,
		},
	},
});
