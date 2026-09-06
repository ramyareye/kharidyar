import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { unstable_splitSqlQuery } from "wrangler";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(new URL("./migrations", import.meta.url));
const testAuthBindings = {
	AUTH_TRUSTED_ORIGINS: "http://example.com",
	BETTER_AUTH_SECRET: "task-3-test-secret-with-at-least-32-characters",
	BETTER_AUTH_URL: "http://example.com",
	GOOGLE_CLIENT_ID: "test-google-client-id",
	GOOGLE_CLIENT_SECRET: "test-google-client-secret",
	TAVILY_API_KEY: "test-tavily-api-key",
} as const;

for (const [name, value] of Object.entries(testAuthBindings)) {
	process.env[name] ??= value;
}

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			return {
				wrangler: { configPath: "./wrangler.json" },
				miniflare: {
					d1Databases: { MIGRATION_DB: "local-codex-migration-test" },
					bindings: {
						...testAuthBindings,
						TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
						TEST_SEED_QUERIES: unstable_splitSqlQuery(
							readFileSync(
								new URL("./seed/development.sql", import.meta.url),
								"utf8",
							),
						),
					},
				},
			};
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
		exclude: ["test/mcp.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
