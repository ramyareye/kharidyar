import { describe, test, expect } from "bun:test";
import { writeFile } from "node:fs/promises";
import {
  childEnvironment,
  codexArguments,
  executeResearch,
  researchPrompt,
  runOnce,
  validOrigin,
} from "./local-codex.mjs";

const job = {
  runId: "run-1",
  leaseToken: "a".repeat(64),
  query: "paper lamp",
  constraints: {
    currency: "EUR",
    maxUnitPriceMinor: null,
    preferredDomains: [],
    requiredTerms: [],
    excludedTerms: [],
  },
  expiresAt: new Date(Date.now() + 240000).toISOString(),
};
const output = {
  providerRequestId: null,
  results: [
    {
      title: "Lamp",
      url: "https://example.com/lamp",
      content: "Price requires checking.",
      score: null,
    },
  ],
};
const result = {
  model: "test-model",
  cliVersion: "codex-cli test",
  searchMode: "live",
  output,
};

describe("Local Codex runner without live model calls", () => {
  test("restricts origins, model arguments, and child environment", () => {
    expect(validOrigin("https://wantkit.example/")).toBe(
      "https://wantkit.example",
    );
    expect(validOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    for (const origin of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/redirect",
      "https://example.com?secret=1",
    ])
      expect(() => validOrigin(origin)).toThrow();
    expect(
      childEnvironment({
        PATH: "/bin",
        HOME: "/home/test",
        OPENAI_API_KEY: "secret",
        WANTKIT_TOKEN: "secret",
        ANTHROPIC_API_KEY: "secret",
      }),
    ).toEqual({ PATH: "/bin", HOME: "/home/test" });
    const args = codexArguments({
      model: "test-model",
      directory: "/tmp/test",
      schemaPath: "schema",
      outputPath: "output",
    });
    for (const flag of [
      "--ignore-user-config",
      "--ephemeral",
      "read-only",
      'forced_login_method="chatgpt"',
      'web_search="live"',
      "shell_tool",
      "apps",
      "plugins",
    ])
      expect(args).toContain(flag);
    expect(() => codexArguments({ model: "bad;command" })).toThrow();
    expect(
      researchPrompt({
        ...job,
        token: "not-in-prompt",
        memory: "private-memory",
      }),
    ).not.toContain("not-in-prompt");
    expect(researchPrompt({ ...job, memory: "private-memory" })).not.toContain(
      "private-memory",
    );
  });
  test("uses ChatGPT login and validates structured output in a temporary directory", async () => {
    const calls = [];
    const value = await executeResearch(job, {
      model: "test-model",
      processRunner: async (_exe, args, options) => {
        calls.push(args);
        if (args[0] === "--version")
          return { stdout: "codex-cli test", stderr: "" };
        if (args[0] === "login")
          return { stdout: "", stderr: "Logged in using ChatGPT" };
        options.onLine(
          JSON.stringify({
            type: "item.completed",
            item: { type: "web_search", id: "search-1" },
          }),
        );
        await writeFile(
          args[args.indexOf("--output-last-message") + 1],
          JSON.stringify(output),
        );
        return { stdout: "", stderr: "" };
      },
    });
    expect(value).toEqual(result);
    expect(calls.filter((args) => args[0] === "exec")).toHaveLength(1);
  });
  test("rejects API-key authentication without running a model", async () => {
    const calls = [];
    await expect(
      executeResearch(job, {
        model: "test-model",
        processRunner: async (_exe, args) => {
          calls.push(args[0]);
          return {
            stdout:
              args[0] === "login"
                ? "Logged in using an API key"
                : "codex-cli test",
            stderr: "",
          };
        },
      }),
    ).rejects.toThrow("own ChatGPT");
    expect(calls).toEqual(["--version", "login"]);
  });
  test("rejects unsafe tool events and excess search events", async () => {
    for (const type of [
      "command_execution",
      "mcp_tool_call",
      "file_change",
      "excess-search",
    ]) {
      await expect(
        executeResearch(job, {
          model: "test-model",
          processRunner: async (_exe, args, options) => {
            if (args[0] === "--version")
              return { stdout: "codex-cli test", stderr: "" };
            if (args[0] === "login")
              return { stdout: "Logged in using ChatGPT", stderr: "" };
            for (let i = 0; i < 9; i++)
              options.onLine(
                JSON.stringify({
                  item: {
                    id: String(i),
                    type: type === "excess-search" ? "web_search" : type,
                  },
                }),
              );
            return { stdout: "", stderr: "" };
          },
        }),
      ).rejects.toThrow();
    }
  });
  test("retries only identical result delivery after a network failure", async () => {
    let calls = 0,
      attempts = 0;
    const sent = [];
    await runOnce(
      {},
      {
        model: "test-model",
        execute: async () => {
          calls++;
          return result;
        },
        request: async (_c, path, body) => {
          if (path.endsWith("/claim")) return { job };
          sent.push(body);
          if (attempts++ === 0) throw new TypeError("network");
          return { accepted: true };
        },
      },
    );
    expect(calls).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
  });
  test("does not start after cancellation or retry an HTTP rejection", async () => {
    let requests = 0;
    const controller = new AbortController();
    controller.abort();
    expect(
      await runOnce(
        {},
        {
          model: "test-model",
          signal: controller.signal,
          request: async () => {
            requests++;
          },
        },
      ),
    ).toBe(false);
    expect(requests).toBe(0);
    await expect(
      runOnce(
        {},
        {
          model: "test-model",
          execute: async () => result,
          request: async (_c, path) => {
            if (path.endsWith("/claim")) return { job };
            requests++;
            const error = new Error("disconnected");
            error.status = 401;
            throw error;
          },
        },
      ),
    ).rejects.toThrow("disconnected");
    expect(requests).toBe(1);
  });
  test("reports invalid output as a failure, without retrying the model", async () => {
    let sent;
    let calls = 0;
    await runOnce(
      {},
      {
        model: "test-model",
        execute: async () => {
          calls++;
          const error = new Error("invalid");
          error.reason = "invalid_output";
          throw error;
        },
        request: async (_c, path, body) =>
          path.endsWith("/claim")
            ? { job }
            : ((sent = body), { accepted: true }),
      },
    );
    expect(calls).toBe(1);
    expect(sent).toMatchObject({ status: "failed", reason: "invalid_output" });
  });
});
