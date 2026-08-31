import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/react-app/**/*.test.{ts,tsx}"],
	},
});
