export const authAccountOptions = {
	accountLinking: {
		enabled: true,
		disableImplicitLinking: true,
	},
} as const;

export const authIpAddressOptions = {
	// Cloudflare overwrites this single-value header at its edge, so application
	// callers cannot choose the address used for auth rate-limit keys.
	ipAddressHeaders: ["cf-connecting-ip"],
};

export const authRateLimitOptions = {
	enabled: true,
	storage: "database",
} as const;

export const authSessionOptions = {
	expiresIn: 60 * 60 * 24 * 7,
	updateAge: 60 * 60 * 24,
} as const;
