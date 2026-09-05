import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(new URL("./migrations", import.meta.url));
const testAuthBindings = {
	MCP_ENABLED: "true",
	MCP_ALLOWED_USER_IDS: "mcp-owner,mcp-other,mcp-viewer",
	AUTH_TRUSTED_ORIGINS: "http://localhost:5173",
	BETTER_AUTH_SECRET: "task-3-test-secret-with-at-least-32-characters",
	BETTER_AUTH_URL: "http://localhost:5173",
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
					bindings: {
						...testAuthBindings,
						TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
					},
				},
			};
		}),
	],
	test: {
		include: ["test/mcp.test.ts"],
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
