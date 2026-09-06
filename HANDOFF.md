# Handoff: compact web UI ready for local review

Updated 2026-09-06. Current base is pushed MCP commit `8baa32b` on `main`. The user confirmed ChatGPT could read Workspace “Test 1” and later reported Claude worked. Claude then showed `invalid_client` / `client_id is required` after disconnect. These are user-reported results, not independent browser verification.

The compact web UI task is implemented and verified locally. Workspaces/Collections now use sidebar navigation; Items, Brief & images and Budget have separate views. Readable controls, item search, action disclosures and mobile navigation replace the oversized layout. **No staging, commit, push or deployment during the UI task.** Current MCP remains read-only and local Codex remains research-only. Paid OpenAI API stays deferred.

## Current UI outcome

- Changed `PlanningDashboard.tsx`, `ui.tsx`, `planning-forms.tsx`, `App.tsx`, shared/page CSS and English/Persian messages; added `Dashboard.css` and [UI_REDESIGN.md](./UI_REDESIGN.md). No new dependency, schema or backend behavior in this task.
- Review the running fictional sample at `http://127.0.0.1:4174/output/playwright/ui-revamp/index.html`. It uses real components with in-memory records; reload resets changes. The standalone Vite server is left running on port 4174. Harness/screenshots are ignored under `output/playwright/ui-revamp/`.
- Full `bun run check` passed: 161 tests, lint, typecheck, schema metadata, production build and Wrangler dry-run. Final mobile changes passed repeated lint, typecheck, five localization tests and browser checks. Logs: `/tmp/wantkit-ui-revamp/`; `git diff --check` passed.
- English/Persian desktop/mobile checks passed, including the Persian research dialog at 320 px without horizontal overflow. Sample creation/editing, filters, views, mobile navigation and menu/dialog focus return passed. This was a local component sample, not a live backend test or usability study with older participants.
- Follow-up polish: header now keeps only the user's name beside the brand. Connected assistants, language, account identity and sign-out moved into bottom-of-sidebar Settings. Desktop content scrolls inside a viewport-sized shell; navigation lists scroll independently with the footer anchored, while mobile retains document scrolling. Removed global smooth scrolling and prevented dialog/menu focus restoration from moving the content. View/Collection changes reset desktop content to the top.
- Follow-up validation: build/typecheck, lint, five localization tests, 16 UI-state tests and diff checks passed. Browser checks preserved exact pre/post-dialog scroll positions on desktop and mobile, confirmed language switching and connector link target, and checked a synthetic 30-entry sidebar plus settings in a 400 px-high desktop window. New screenshots: `settings-desktop.png` and `settings-fa-mobile.png`. No sign-out or connector navigation was performed against a live account. Ready for commit review before starting the AI write task; no commit/push/deploy was authorized or performed by this follow-up.
- The working tree has 48 changed/new files, including the previous uncommitted runner work; nothing is staged. Keep those prior changes intact. The production build regenerated ignored deployment configuration with default disabled flags; it is not the private-preview deployment configuration.

## Next ordered work

1. Review/release the UI only when requested, using the existing commit/deployment approval boundaries.
2. ChatGPT/Claude write tools and friendly reconnect recovery. User preference: routine adds/edits apply; deletion, sharing and purchase decisions require concrete confirmation. Map app capabilities and gaps before claiming complete chat control.
3. Private floor plans: images or PDFs, with measurements when available, for room needs and research.
4. Image generation using permitted floor plans, room photos and selected products.
5. WantKit chat using the same tools and approval rules. User wants both surfaces, starting with ChatGPT/Claude.

Start only the next explicitly requested task. Details and confirmed answers: [UI_REDESIGN.md](./UI_REDESIGN.md).

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
