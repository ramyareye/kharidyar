import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("existing Worker API", () => {
	it("preserves the scaffold response", async () => {
		const response = await exports.default.fetch(
			new Request("http://example.com/api/", {
				headers: { "x-request-id": "caller-controlled" },
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ name: "Cloudflare" });
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
		);
		expect(response.headers.get("permissions-policy")).toBe(
			"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
		);
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("x-xss-protection")).toBe("0");
		expect(response.headers.get("x-request-id")).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(response.headers.get("x-request-id")).not.toBe("caller-controlled");
	});

	it("preserves explicit safe cache and content policies", async () => {
		const response = await exports.default.fetch(
			"http://example.com/api/research-fixtures/products/warm-oak-paper-lamp",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=3600",
		);
		expect(response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
		);
		expect(response.headers.get("x-frame-options")).toBe("DENY");
	});
});
