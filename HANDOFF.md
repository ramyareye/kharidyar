# Handoff: assistant write actions — local only

Updated 2026-09-06. Base is `5a921a5` (`feat: add local Codex research and revamp dashboard UI`), which the user committed and pushed. The latest “go” authorized the ChatGPT/Claude write-tool and reconnect task. **This task is implemented locally, unstaged and uncommitted; it has not been deployed.** The live owner-only preview still has the read-only MCP connector and local Codex research runner. Paid OpenAI API stays deferred.

## Current outcome

- Added 49 mutation tools and ten supporting read tools plus a private receipt reader over the existing MCP endpoint (70 tools total). Routine adds/edits use current account permissions; archive/deletion, sharing and purchase/decision actions require exact approval in WantKit. Research start also requires approval and an explicit provider. Existing OAuth registrations remain read-only unless replaced by a user-created connection with `wantkit:write` consent.
- Pending approvals bind stored inputs and target snapshots to the requesting user, original OAuth client, session and exact access token. They cannot be approved with an MCP bearer or an extra `confirmed` argument. Permission, changed-target, expiry, revocation and duplicate-attempt checks run on the server. Execution is an at-most-once attempt, not a cross-service rollback guarantee. See [MCP_ACTIONS.md](./MCP_ACTIONS.md) for capabilities, manual gaps, retention and reconnect instructions.
- Added a readable approval screen with currency formatting, localized sensitive-action titles, approve/decline states and expandable record IDs. New connections have an explicit write checkbox and consent text. `/api/auth/error` redirects to bounded reconnect guidance without reflecting provider error details or callback URLs. Standalone connector pages retain document scrolling despite the dashboard viewport shell.
- Added `0013_mcp_actions.sql`, one action table and two indexes with generated Drizzle metadata. All migration execution so far is in disposable test databases. No persistent local/preview/production database was migrated, no provider was called, and no commit/push/deploy occurred.
- Changed the MCP auth/options/server/routes, new action catalog/service/tool registration, new action contracts/schema/approval component, App/Connectors UI, English/Persian messages and MCP integration tests. Documentation includes this handoff, PROJECT, RELEASE, PRIVATE_MCP, UI_REDESIGN and new MCP_ACTIONS. No dependencies or Worker bindings changed.

## Validation and release boundary

**Full `bun run check` passed with 181 tests** (26 domain, 5 localization, 94 Worker, 33 MCP, 16 UI-state, 7 CLI), plus lint, typecheck, Drizzle metadata check, production build and Wrangler deployment dry-run. Log: `/tmp/wantkit-mcp-write-check.log`. `git diff --check` passed. The 33 OAuth/D1 tests cover routine edits, exact concurrent replay, actor/collection boundaries, approval/decline/expiry, token/client/session revocation, changed targets, purchases, comments, sharing/last-owner checks, media parent/cleanup permissions and receipt retention/access. Existing Workers cancellation/auth warnings and the bundle-size warning remain; all suites completed successfully.

Browser approval/decline, write-consent, opt-in credential creation and reconnect checks passed on fictional local data at 1280 px English and 390 px Persian without horizontal overflow. Mobile scrolling reached the approval controls (390 px document width; final scroll 320 of a 1164 px document with an 844 px viewport). The write checkbox defaulted off and posted `allowWrites: true` only after checking it. Initial harness favicon/navigation 404s were recorded; final checked pages rendered and completed the flows. Screenshots and the harness are ignored under `output/playwright/ui-revamp/assistant*`. This is not live write verification in ChatGPT or Claude.

Local sample: `http://127.0.0.1:4174/output/playwright/ui-revamp/assistant.html`; add `?mode=consent`, `?mode=recovery`, or `?locale=fa`. Reload from the sample URL to reset fictional records. The browser uses the working escalated Playwright `local-codex-live` session; Argent/CUA transport is unavailable. No live account connection was changed in this task.

The quality gate generates production/default build artifacts with MCP/local Codex disabled. A separately approved preview release must record a D1 recovery bookmark, apply migration 0013, build preview afresh and preserve the reviewed private owner overrides. Then replace read-only connector credentials and independently verify writes/decline/revocation in both actual assistant clients. Production remains unchanged. The final tree has 28 modified/new files, including six documentation files and additive migration metadata; nothing is staged. No staging or deployment is implied by this handoff.

## Next ordered work

1. Commit review and owner-only preview release/live client checks, only when explicitly requested. Follow the exact staged-tree/message approval gate below before any commit.
2. Private floor plans: images or PDFs, with measurements when available, for room needs and research.
3. Image generation using permitted floor plans, room photos and selected products.
4. WantKit chat using the same tools and approval rules. The user wants both chat surfaces, starting with ChatGPT/Claude.

One substantial task per session. Start the next product task only after a new request. The prior compact UI/Settings/scroll work is pushed as `5a921a5` but remains undeployed; its evidence is in [UI_REDESIGN.md](./UI_REDESIGN.md).

## Previous completed task: local Codex preview

The owner-only local Codex preview was approved separately. Migration 0012 and deployment succeeded; one live research call, cancellation, revoked-token rejection and English/Persian UI checks passed. The following records refer to that earlier release, not the current UI changes.

## Outcome and changed files

- New `packages/contracts/src/local-codex.ts`, DB `schema/local-codex.ts`, Worker `local-codex-{auth,jobs,routes}.ts`, CLI `apps/web/scripts/local-codex.mjs`, and `LocalCodexPanel.tsx`. Pairings use one-time tokens stored as hashes, are owned by a user and login session, and are revocable. Jobs are claimed once through outbound authenticated polling and checked against current permissions before dispatch, lease checks and completion.
- Updated Research contracts/services/routes and planning UI/API for explicit local-Codex/Tavily choice, atomic queuing/completion, cancellation, saved unverified provenance and existing human-confirmed promotion. No shared provider account, automatic paid API fallback or automatic planning mutation.
- Added migration `0012_famous_thunderbolts.sql` and matching metadata. It adds pairing/job tables and widens the Run provider constraint, preserving cascading Sources/Results/Promotions through backups inside D1's migration transaction. New Worker/CLI/migration tests cover the boundaries.
- Updated root CLI/test scripts, isolated test bindings, generated Worker types, English/Persian copy, connector styling and disabled-by-default local flags. Setup: [LOCAL_CODEX.md](./LOCAL_CODEX.md). Roadmap/release/MCP handoff updated.

## Validation

- Full `bun run check` passed: **161 tests** (26 domain, 5 localization, 94 Worker including 14 new local-runner/migration tests, 13 MCP, 16 UI-state, 7 CLI), lint, typecheck, Drizzle check, production build and Wrangler deployment dry-run. Log: `/tmp/wantkit-local-codex-check.log`. Sandbox localhost restrictions required an approved unrestricted retry.
- Real isolated D1 migration tests checked populated record preservation, clean foreign keys and rollback. Approved preview migration 0012 also preserved all pre-existing aggregate counts and passed `foreign_key_check`; 13 migrations are applied.
- Exactly one live model call ran using the existing ChatGPT login, `codex-cli 0.153.0`, model `gpt-6-astra`. It completed in about 24 seconds and saved one cited, explicitly unverified lamp result in “Test 1” → “Col 1 - Japanese.” No Item, Candidate, Offer or promotion was created; no Tavily/API fallback ran.
- A separate no-model test expired after ten minutes offline, then its claimed retry was cancelled through the UI. Lease and late-completion requests returned `409`. Disconnecting the temporary pairing made its token return `401`.
- Playwright verified English desktop (1440 px) and Persian mobile (390 px) setup/research/results. No horizontal overflow; mobile dialog client/scroll width both 356 px; final browser console had no errors or warnings. Saved source text and the persisted runner error remain in their original English. Ignored screenshots: `output/playwright/local-codex-{result-en,settings-fa-mobile,research-fa-mobile,result-fa-mobile}.png`.
- Argent/CUA returned `Transport closed`. The Playwright fallback worked when every CLI call ran outside the filesystem sandbox: a sandbox connection error otherwise unlinks its Unix socket. Keep using the approved `local-codex-live` CLI session with escalation; the browser remains signed in, restored to English/desktop.
- After the final retry-label and wrapping polish, lint, typecheck, localization tests and `git diff --check` passed again.
- Existing Worker/auth warnings and the frontend chunk-size warning remain. An optional final aggregate D1 recheck on 2026-09-06 was rejected by the current Wrangler account (`7403`); earlier before/after migration integrity passed. Revalidate Wrangler's account before any future cloud operation.

## Ready to use on this Mac

“This Mac” is paired under the user's WantKit session. Its CLI config is `~/.config/wantkit/codex-connection.json` (mode 600); temporary token/config copies were removed. No runner loop is left running. From this repository, start:

```sh
bun run local:codex run --model gpt-6-astra
```

Then select **My local Codex** and **This Mac** in Collection → Live research. Keep the terminal running. Signing out of the original WantKit session invalidates the pairing. Do not expose or commit the config.

Preview is `4e4a4724-efdf-47c0-9638-d302bfac186e` at `https://kharidyar-preview.formahsa.workers.dev`; previous version was `b51b0cd5-d575-4d39-8d8f-e24ef2232677`. Production is unchanged. The deployed preview enables MCP/local Codex for the sole approved owner; checked-in defaults remain disabled. Current ignored build artifacts were regenerated for production with disabled defaults. A future approved preview deployment requires a fresh preview build and deliberate restoration of the reviewed private flags. Recovery bookmark, manifest and test IDs are in [RELEASE.md](./RELEASE.md).

## Recoverable API draft — reference only

Ignored local archive: [`.local-backups/openai-api-draft-2026-09-05.tgz`](./.local-backups/openai-api-draft-2026-09-05.tgz), mode 600. SHA-256: `61b83dc7eca50b72a8eeef15667b031751c533b39cac3aa550015136e911dc8c`. It contains the original interrupted API files/patch and manifest, is not in Git, and must not be applied over active source. Its `0011_openai_research.sql` migration is unsafe; do not run it. The valid committed MCP migration is `0011_flimsy_mojo.sql`; the separately tested local-runner migration is `0012_famous_thunderbolts.sql`.

## Workflow constraints

One substantial task per session; no subagents or parallel audits without explicit request. The approved preview deployment and single live call are complete; no further deployment or model call is authorized by this checkpoint. Keep credentials, auth files, cookies, account IDs, test artifacts and logs out of commits.

Before any commit, inspect `git status --short`, `git diff --cached --name-status`, `git diff --cached`, and `git diff --cached --check`. Review every staged file, show the complete staged tree, summary, validation and proposed message, then ask **“Proceed with this exact staged tree and commit message?”** Wait for approval, recheck unchanged staged content, and commit only that tree. Never use blanket add/reset/restore/checkout/clean, amend, force, or hook bypass.
