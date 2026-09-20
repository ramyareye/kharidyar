import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { protectApiResponse, requestLogFields } from "../src/worker/api-protection-middleware";
import { healthResponse } from "../src/worker/health";
import type { WorkerAppEnv } from "../src/worker/session-middleware";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function testApp() {
	return new Hono<WorkerAppEnv>().use("*", protectApiResponse);
}

describe("request observability", () => {
	it("correlates a response with its version and route without logging private inputs", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValue(0.05);
		const app = testApp().post("/api/items/:itemId", (c) => {
			c.set("actorId", "private-user-id");
			return c.json({ saved: true }, 201);
		});
		const response = await app.request("https://example.com/api/items/private-item-id?token=query-secret", {
			method: "POST",
			headers: {
				"x-request-id": "untrusted-id",
				cookie: "session=cookie-secret",
				authorization: "Bearer token-secret",
			},
			body: "private-note",
		}, { ...env, CF_VERSION_METADATA: { id: "release-id", tag: "release-tag", timestamp: "" } });

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith({
			event: "http_request_completed",
			requestId: response.headers.get("x-request-id"),
			releaseId: "release-id",
			releaseTag: "release-tag",
			method: "POST",
			route: "/api/items/:itemId",
			status: 201,
			durationMs: expect.any(Number),
			slow: false,
			sampleRate: 0.1,
		});
		expect(response.headers.get("x-request-id")).not.toBe("untrusted-id");
		const serialized = JSON.stringify(log.mock.calls);
		for (const secret of ["private-user-id", "private-item-id", "query-secret", "cookie-secret", "token-secret", "private-note", "untrusted-id"]) {
			expect(serialized).not.toContain(secret);
		}
	});

	it("records handled server failures as errors while preserving response protections", async () => {
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		const app = testApp().get("/api/failure", () => { throw new Error("private-database-details"); });
		app.onError((_error, c) => c.json({ error: "Unavailable" }, 503));
		const response = await app.request("https://example.com/api/failure", {}, env);
		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(errors).toHaveBeenCalledOnce();
		expect(errors.mock.calls[0]?.[0]).toMatchObject({
			event: "http_request_completed", status: 503, requestId: response.headers.get("x-request-id"), sampleRate: 1,
		});
		expect(JSON.stringify(errors.mock.calls)).not.toContain("private-database-details");
	});

	it("records rejected and unmatched requests without leaking their path", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		const app = testApp().get("/api/private", (c) => c.json({ error: "Sign in" }, 401));
		await app.request("https://example.com/api/private", {}, env);
		await app.request("https://example.com/private-path-secret", {}, env);
		expect(log.mock.calls.map(([entry]) => entry.status)).toEqual([401, 404]);
		expect(log.mock.calls.every(([entry]) => entry.sampleRate === 1)).toBe(true);
		expect(JSON.stringify(log.mock.calls)).not.toContain("private-path-secret");
	});

	it("adds version metadata to existing error fields", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const app = testApp().get("/api/context", (c) => c.json(requestLogFields(c)));
		const response = await app.request("https://example.com/api/context", {}, {
			...env, CF_VERSION_METADATA: { id: "version-123", tag: "commit-abc", timestamp: "" },
		});
		expect(await response.json()).toMatchObject({ releaseId: "version-123", releaseTag: "commit-abc" });
	});

	it("marks slow responses for filtering without changing their status", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(2_205);
		const response = await testApp().get("/api/slow", (c) => c.text("ok"))
			.request("https://example.com/api/slow", {}, env);
		expect(response.status).toBe(200);
		expect(log.mock.calls[0]?.[0]).toMatchObject({ durationMs: 2_105, slow: true, sampleRate: 1 });
	});

	it("samples routine responses at ten percent without dropping response headers or bodies", async () => {
		const log = vi.spyOn(console, "info").mockImplementation(() => {});
		vi.spyOn(Math, "random").mockReturnValueOnce(0.099).mockReturnValueOnce(0.1).mockReturnValueOnce(0.99);
		const app = testApp().get("/api/routine", (c) => c.json({ ok: true }));
		const requestIds = [];
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const response = await app.request("https://example.com/api/routine", {}, env);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(response.headers.get("x-content-type-options")).toBe("nosniff");
			expect(response.headers.get("x-request-id")).toBeTruthy();
			requestIds.push(response.headers.get("x-request-id"));
		}
		expect(new Set(requestIds).size).toBe(3);
		expect(log).toHaveBeenCalledOnce();
		expect(log.mock.calls[0]?.[0]).toMatchObject({ requestId: requestIds[0], status: 200, sampleRate: 0.1 });
	});
});

describe("public health check", () => {
	it("checks the real database binding and returns only a minimal no-store response", async () => {
		vi.spyOn(console, "info").mockImplementation(() => {});
		const response = await testApp().get("/api/health", healthResponse)
			.request("https://example.com/api/health", {}, env);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("returns 503 without exposing database failures", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(env.DB, "prepare").mockImplementation(() => { throw new Error("private-database-details"); });
		const response = await testApp().get("/api/health", healthResponse)
			.request("https://example.com/api/health", {}, env);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: "degraded" });
	});

	it("returns 503 when the database does not respond within two seconds", async () => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => {});
		const statement = env.DB.prepare("SELECT 1 AS ok");
		vi.spyOn(statement, "first").mockReturnValue(new Promise(() => {}));
		vi.spyOn(env.DB, "prepare").mockReturnValue(statement);
		const pending = testApp().get("/api/health", healthResponse)
			.request("https://example.com/api/health", {}, env);
		await vi.advanceTimersByTimeAsync(2_000);
		const response = await pending;
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: "degraded" });
	});
});
