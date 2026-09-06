# Handoff: ChatGPT write actions verified on private preview

Updated 2026-09-07. The authorized owner-only preview release of pushed `9a65b41` (`feat: add MCP write actions with approvals and reconnect recovery`), including UI checkpoint `5a921a5`, is complete. **Preview remains `c8bbf5a1-771a-45b3-b643-535fe76851af`; migration 0013 is applied. ChatGPT read/write and approval checks now pass.** The user explicitly deferred Claude. Production is unchanged; paid OpenAI API stays deferred. Only HANDOFF, MCP_ACTIONS and RELEASE documentation is dirty; nothing is staged or committed. No application code or deployment changed during client verification.

## Current outcome

- Added 49 mutation tools and ten supporting read tools plus a private receipt reader over the existing MCP endpoint (70 tools total). Routine adds/edits use current account permissions; archive/deletion, sharing and purchase/decision actions require exact approval in WantKit. Research start also requires approval and an explicit provider. Existing OAuth registrations remain read-only unless replaced by a user-created connection with `wantkit:write` consent.
- Pending approvals bind stored inputs and target snapshots to the requesting user, original OAuth client, session and exact access token. They cannot be approved with an MCP bearer or an extra `confirmed` argument. Permission, changed-target, expiry, revocation and duplicate-attempt checks run on the server. Execution is an at-most-once attempt, not a cross-service rollback guarantee. See [MCP_ACTIONS.md](./MCP_ACTIONS.md) for capabilities, manual gaps, retention and reconnect instructions.
- Added a readable approval screen with currency formatting, localized sensitive-action titles, approve/decline states and expandable record IDs. New connections have an explicit write checkbox and consent text. `/api/auth/error` redirects to bounded reconnect guidance without reflecting provider error details or callback URLs. Standalone connector pages retain document scrolling despite the dashboard viewport shell.
- Added `0013_mcp_actions.sql`, one action table and two indexes with generated Drizzle metadata. The approved preview release applied it successfully; 14 migrations are now recorded. User/Workspace/Collection/Item counts stayed 1/1/1/0 and foreign-key checks passed. No persistent local or production migration and no model call ran during this release.
- Changed the MCP auth/options/server/routes, new action catalog/service/tool registration, new action contracts/schema/approval component, App/Connectors UI, English/Persian messages and MCP integration tests. Documentation includes this handoff, PROJECT, RELEASE, PRIVATE_MCP, UI_REDESIGN and new MCP_ACTIONS. No dependencies or Worker bindings changed.

## Validation and release boundary

**Full `bun run check` passed with 181 tests** (26 domain, 5 localization, 94 Worker, 33 MCP, 16 UI-state, 7 CLI), plus lint, typecheck, Drizzle metadata check, production build and Wrangler deployment dry-run. Log: `/tmp/wantkit-mcp-write-check.log`. `git diff --check` passed. The 33 OAuth/D1 tests cover routine edits, exact concurrent replay, actor/collection boundaries, approval/decline/expiry, token/client/session revocation, changed targets, purchases, comments, sharing/last-owner checks, media parent/cleanup permissions and receipt retention/access. Existing Workers cancellation/auth warnings and the bundle-size warning remain; all suites completed successfully.

Browser approval/decline, write-consent, opt-in credential creation and reconnect checks passed on fictional local data at 1280 px English and 390 px Persian without horizontal overflow. Mobile scrolling reached the approval controls (390 px document width; final scroll 320 of a 1164 px document with an 844 px viewport). The write checkbox defaulted off and posted `allowWrites: true` only after checking it. Initial harness favicon/navigation 404s were recorded; final checked pages rendered and completed the flows. Screenshots and the harness are ignored under `output/playwright/ui-revamp/assistant*`. This is not live write verification in ChatGPT or Claude.

Local sample: `http://127.0.0.1:4174/output/playwright/ui-revamp/assistant.html`; add `?mode=consent`, `?mode=recovery`, or `?locale=fa`. Reload from the sample URL to reset fictional records. Browser automation uses the working escalated Playwright `local-codex-live` session; Argent/CUA transport is unavailable. Live account changes from subsequent client verification are recorded below.

The fresh preview build and exact-config dry-run passed. Its reviewed artifacts were deployed without rebuilding; all live bindings and plain-text settings match the previous release, including the same sole owner's MCP/local-Codex allowlists. All six existing secret names remain provisioned; values were not read or changed. Release smoke and six additional public checks passed: read/write discovery, OAuth issuer/PKCE/private registration, missing/invalid bearer rejection, bounded reconnect redirects, session-protected connector/approval routes and exact deployed JS/CSS hashes. Artifact manifest SHA-256: `a475890301791b642b43394fee4a9af3220ee009154566183f88f70105dd58e7`. Private release evidence is under `/tmp/wantkit-mcp-preview-release/`; never commit it. The ignored generated build currently contains reviewed private preview overrides; a normal build will overwrite them.

## Live client checkpoint — complete for ChatGPT

- The missing “test browser” was a headless Chrome session. It was reopened headed; WantKit and ChatGPT are now signed in. Keep using `local-codex-live` with the approved escalated Playwright CLI. Do not ask the user to sign in again without checking current state.
- Created the private ChatGPT plugin **WantKit**, with new **My ChatGPT** credentials and explicit write opt-in. OAuth consent succeeded for `offline_access wantkit:read wantkit:write`; refreshed discovery shows all 70 tools. The older **WantKit Preview** plugin definition remains in ChatGPT with obsolete read-only credentials; use **WantKit**. No credentials were pasted into chat or committed.
- In “Test 1,” ChatGPT created one disposable Collection, **Connector check ChatGPT 2026-09-06**, and one Item, **Connector test lamp**. It created quantity 1, edited to 2 and read it back. The first archive stayed pending; declining through WantKit returned `denied` and left the Item active. Exact replay returned the same denied receipt. A fresh archive request stayed pending until approved through WantKit, then returned `succeeded`. ChatGPT replayed that exact operation once and received the same receipt; independent authenticated reads confirmed quantity 2 and unchanged archive/update timestamps. The test Collection remains active with its one archived Item. No pre-existing planning record, research, sharing or purchase was part of the test.
- ChatGPT's approval link opens an **External site** confirmation; choose **Open link** to reach WantKit. The temporary absence of an HTML `href` was ChatGPT's confirmation behavior, not a broken WantKit route. The completed test conversation is **Create Test Collection** in the visible browser.
- Before the user paused Claude, its replacement connector completed read authorization and read “Test 1,” but its initial grant requested read scope only. A test create was rejected before mutation. Claude's write-scope upgrade handling remains unverified/unfixed and is explicitly deferred; do not resume it as part of this checkpoint.
- The reported local pairing `EEXIST` means this Mac already has a saved config. Its private mode-600 config was checked without printing the token; `/api/local-codex/check` returned 200 for **This Mac**. Reuse it with the runner command below. The new, unused **Reza’s MacBook Pro** pairing remains; no config was replaced and no new local research ran.

Three bounded ChatGPT turns exercised this flow using the owner's subscription. A prior bounded Claude test stopped at the missing write scope. These client calls followed the deployment-only checks above; no paid API, Tavily fallback, local runner loop or additional deployment was started. This verifies the tested ChatGPT paths, not every tool or future provider UI behavior.

## Next ordered work

1. Private floor plans: images or PDFs, with measurements when available, for room needs and research.
2. Image generation using permitted floor plans, room photos and selected products.
3. WantKit chat using the same tools and approval rules. Start with ChatGPT/OpenAI; paid API remains deferred.

Claude compatibility is parked until the user explicitly resumes it. The ChatGPT connector checkpoint is complete; documentation can be committed using the approval gate below. Suggested message: `docs: record verified ChatGPT write connector`.

One substantial task per session. Start the next product task only after a new request. The compact UI/Settings/scroll work from `5a921a5` is included in the new preview; its local evidence is in [UI_REDESIGN.md](./UI_REDESIGN.md).

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

The earlier local-Codex preview version was `4e4a4724-efdf-47c0-9638-d302bfac186e`; it is now the previous version for release `c8bbf5a1-771a-45b3-b643-535fe76851af` at `https://kharidyar-preview.formahsa.workers.dev`. Pre-0013 recovery bookmark: `0000003e-00000000-000050de-4e9272088f0bc1355436ce173b41f119`. Production is unchanged. The deployed preview enables MCP/local Codex for the sole approved owner; checked-in defaults remain disabled. Recovery details and prior test IDs are in [RELEASE.md](./RELEASE.md).

## Recoverable API draft — reference only

Ignored local archive: [`.local-backups/openai-api-draft-2026-09-05.tgz`](./.local-backups/openai-api-draft-2026-09-05.tgz), mode 600. SHA-256: `61b83dc7eca50b72a8eeef15667b031751c533b39cac3aa550015136e911dc8c`. It contains the original interrupted API files/patch and manifest, is not in Git, and must not be applied over active source. Its `0011_openai_research.sql` migration is unsafe; do not run it. The valid committed MCP migration is `0011_flimsy_mojo.sql`; the separately tested local-runner migration is `0012_famous_thunderbolts.sql`.

## Workflow constraints

One substantial task per session; no subagents or parallel audits without explicit request. The approved preview release and bounded ChatGPT client checks are complete. Start further product work or deployment only after a new request. Keep credentials, auth files, cookies, account IDs, test artifacts and logs out of commits.

Before any commit, inspect `git status --short`, `git diff --cached --name-status`, `git diff --cached`, and `git diff --cached --check`. Review every staged file, show the complete staged tree, summary, validation and proposed message, then ask **“Proceed with this exact staged tree and commit message?”** Wait for approval, recheck unchanged staged content, and commit only that tree. Never use blanket add/reset/restore/checkout/clean, amend, force, or hook bypass.
