import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("existing Worker API", () => {
	it("preserves the scaffold response", async () => {
		const response = await exports.default.fetch("http://example.com/api/");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ name: "Cloudflare" });
	});
});
