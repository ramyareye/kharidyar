# Private local Codex research

Deployed and verified on the private owner-only preview, 2026-09-06. One live research call passed using ChatGPT login, Codex CLI `0.153.0` and model `gpt-6-astra`. Cancellation, disconnect and English/Persian UI checks passed. Checked-in flags remain disabled; production is unchanged. See [RELEASE.md](./RELEASE.md) for the exact preview version and recovery record.

Each person pairs their own computer to their own WantKit login. The computer pulls only explicitly queued research; it does not expose an agent, shell, or tunnel. This complements the read-only [ChatGPT/Claude MCP connector](./PRIVATE_MCP.md).

## Enable the private pilot

The approved preview has already applied `apps/web/migrations/0012_famous_thunderbolts.sql`. For a future separately approved environment, first record its D1 recovery bookmark. This migration adds pairings/jobs and widens the Research Run provider constraint. It preserves Sources, Results and Promotions across the parent-table rebuild; a populated D1 test checks preservation and rollback with foreign keys enabled. Do not apply the archived OpenAI draft migration.

For future approved preview deployments, build preview, then enable `LOCAL_CODEX_ENABLED="true"` and set `LOCAL_CODEX_ALLOWED_USER_IDS` to the explicitly approved WantKit user IDs in the private preview configuration. Restore the reviewed preview MCP override and preserve all authentication settings. Do not commit account IDs. The deployed preview enables MCP and the runner for the same sole owner; production and checked-in defaults remain disabled. The later UI quality check regenerated ignored build artifacts for production with disabled defaults. Run a fresh preview build/dry-run with the intended private flags before any approved deployment.

This Mac is already paired as **This Mac**, with mode-600 configuration at `~/.config/wantkit/codex-connection.json`. Start it from this repository with `bun run local:codex run --model gpt-6-astra`, then select **My local Codex** → **This Mac** in the Collection research dialog. No runner loop is left running after verification.

## Pair your computer

From a local clone of this repository with its Bun dependencies installed:

1. Sign into Codex using `codex login` and your own ChatGPT account. API-key login is rejected by this runner.
2. Sign into the enabled WantKit preview. Open **Connected assistants**, name your local runner, and create a pairing. Reveal its token only to paste into the terminal prompt below; never paste it into a chat.
3. Run:

   ```sh
   bun run local:codex pair --origin https://kharidyar-preview.formahsa.workers.dev
   ```

   Paste the token at the hidden prompt. It is not a command-line argument or environment variable. The CLI writes a new mode-600 file at `~/.config/wantkit/codex-connection.json`; it refuses an existing file. A custom file can be selected with `WANTKIT_CONNECTION_FILE`.
4. Start the runner with a model available to your Codex account:

   ```sh
   bun run local:codex run --model YOUR_CODEX_MODEL
   ```

   Replace `YOUR_CODEX_MODEL` with your selected model ID. Use `--once` to check for one queued job and exit. `WANTKIT_CODEX_BIN` can select an installed Codex executable if it is not on PATH.
5. In the Collection research dialog, select **Local Codex**, choose your paired computer, enter the query and filters, and start research. Inspect the returned source links and suggestions before using the existing promotion controls. Retrying names the selected provider explicitly; it never silently falls back to a paid API.

To replace a pairing, disconnect it in WantKit, remove only its local `codex-connection.json` file, and run `pair` again. Ctrl+C stops polling and terminates the current child process. Use **Cancel** in WantKit to cancel the queued/running job too. Disconnect cancels active jobs and rejects further runner requests. Pairings expire after at most 30 days and also depend on the original WantKit login session remaining valid; sign-out/session expiry requires pairing again.

## Data, limits and failure behavior

- Only the explicit query and filters are placed in the research prompt. Codex sends them to OpenAI. WantKit does not obtain Codex credentials, assistant chats, memories, or browser cookies. The returned research is saved in the Collection under existing access rules. ChatGPT-login usage consumes the person's included allowance; extra API billing may be avoided within that allowance, but this is neither offline nor unlimited free AI.
- The CLI uses a temporary directory, ephemeral execution, ignored user configuration, read-only sandboxing, ChatGPT-only authentication and an explicit model. Shell, local execution, apps, plugins, hooks, agents and memory features are disabled. API keys and pairing credentials are excluded from the child environment. The CLI rejects reported command/MCP/file-write events and removes its temporary output afterward. This is a private pilot for a trusted local owner, not a sandbox for arbitrary multi-tenant code.
- One active job per pairing; 10-minute queue lifetime; four-minute lease; at most three minutes for the CLI operation. Lease checks run every five seconds. A disconnected computer cannot receive an immediate cancellation, so an already-started provider request may consume allowance before the runner stops. The server rejects results after cancellation or access loss.
- The prompt requests at most eight search/open actions. The runner stops after eight distinct reported web-search items and caps captured process output at 1 MB. A single reported item can represent provider-internal activity; this is not a monetary or token budget guarantee. At most five validated HTTPS results and a 32 KiB completion are accepted. There is no automatic model retry; only identical completion delivery may retry once after a network error.
- Sources/model/version/search mode are reported by the local runner and labelled as unverified. No server-side retailer extraction is added. Prices and availability remain unknown in structured suggestions until reviewed; the server never automatically creates Candidates, marks Items purchased, or imports account-wide context.
- Offline jobs, expired login, quota/provider failure, invalid output and timeout are surfaced as failed Research Runs. Start/pair the runner and retry explicitly. A local index of saved content can help find existing records but cannot independently discover fresh listings; this implementation uses Codex live web search. Tavily stays available as an explicit alternative.

References checked during implementation: [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [web search](https://learn.chatgpt.com/docs/web-search), [configuration](https://learn.chatgpt.com/docs/config-file/config-sample), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

## Verification

`bun run check` passed: 161 tests, lint, TypeScript, Drizzle metadata, production build and deployment dry-run. New coverage comprises 13 Worker authorization/lifecycle tests, one populated D1 migration test and seven CLI tests using simulated process/model responses. The approved preview migration preserved existing counts and clean foreign keys; release smoke passed.

Exactly one live call completed in about 24 seconds and saved one source/result for a Dutch-retailer lamp query. Provenance identifies `gpt-6-astra`, `codex-cli 0.153.0`, live search and locally reported/unverified output. No automatic planning records were created. A separate test used no model: offline expiry passed, cancellation rejected lease/completion with `409`, and disconnect rejected the old pairing token with `401`. English desktop and Persian mobile setup/research/results passed without horizontal overflow or final console errors. Saved provider text and the persisted runner error remain in English. Future public/multi-user rollout requires its own review; the pilot approval does not cover it.
