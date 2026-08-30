import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(new URL("./migrations", import.meta.url));

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			return {
				wrangler: { configPath: "./wrangler.json" },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
					},
				},
			};
		}),
	],
	test: {
		setupFiles: ["./test/apply-migrations.ts"],
	},
});
