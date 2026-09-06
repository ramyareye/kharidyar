import type { D1Migration } from "cloudflare:test";

declare global {
	namespace Cloudflare {
		interface Env {
			TEST_MIGRATIONS: D1Migration[];
			TEST_SEED_QUERIES: string[];
			MIGRATION_DB: D1Database;
		}
	}
}

export {};
