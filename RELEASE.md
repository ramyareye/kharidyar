# Release runbook

This runbook covers the Cloudflare Worker, static assets, D1 migrations, private Concept-media R2 storage, Cloudflare Images, the research Workflow, Browser Run, smoke verification, code rollback, and D1 recovery. Run commands from the repository root unless a step says otherwise.

Cloudflare Worker versions do not include D1 state. A Worker rollback changes code and bindings only, while D1 Time Travel overwrites the database in place. Treat them as separate recovery controls.

## Environments

| Environment | Worker | D1 database | private R2 bucket | Workflow | Application origin |
| --- | --- | --- | --- | --- | --- |
| Preview | `kharidyar-preview` | `kharidyar-preview` | `kharidyar-concept-media-preview` | `kharidyar-research-preview` | `https://kharidyar-preview.formahsa.workers.dev` |
| Production | `kharidyar` | `kharidyar-production` | `kharidyar-concept-media-production` | `kharidyar-research` | `https://kharidyar.formahsa.workers.dev` |

Local, preview, and production never share a D1 database, R2 bucket, or Workflow. `CLOUDFLARE_ENV` selects and flattens the requested Wrangler environment during the Vite build; the following deployment scripts then deploy that generated configuration.

## One-time environment setup

1. Authenticate and confirm the intended Cloudflare account:

   ```bash
   cd apps/web
   bunx wrangler whoami
   cd ../..
   ```

2. Ensure all six secret names exist in each remote Worker. Never print or commit their values:

   ```text
   AUTH_TRUSTED_ORIGINS
   BETTER_AUTH_SECRET
   BETTER_AUTH_URL
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   TAVILY_API_KEY
   ```

   For an existing Worker, set missing values interactively from `apps/web` with
   `bunx wrangler secret put <NAME> --env <preview|production>`. A new Worker cannot
   receive secrets before its first deployment. Bootstrap it with a mode-`600`
   secrets file outside the repository and use Wrangler's `--secrets-file`
   deployment option after the matching build. Delete the file immediately
   after Cloudflare confirms the deployment; never pass secret values as command-line
   arguments.

3. Register each environment's exact HTTPS Google callback URL:

   ```text
   <application-origin>/api/auth/callback/google
   ```

4. Create the two remote private R2 buckets once, without enabling an `r2.dev` domain or custom public domain:

   ```bash
   cd apps/web
   bunx wrangler r2 bucket create kharidyar-concept-media-preview
   bunx wrangler r2 bucket create kharidyar-concept-media-production
   bunx wrangler r2 bucket list
   cd ../..
   ```

5. Keep the D1 IDs, private R2 bucket names, Images binding, Workflow names, Browser Run binding, allowed research origin, and Worker names in `apps/web/wrangler.json`. Run `bun run cf-typegen` after changing a binding. The application limits each source and normalized image to 10 MiB, 8,192 pixels per side, and 40 megapixels; each Concept to 12 active images; each Workspace to 250 MiB of active media; and each actor/Collection to 20 upload attempts per hour. These values are non-secret environment configuration and may be tuned without a migration.

## Release order

1. Require a clean `main` branch at the intended pushed commit, then run the full local gate and both deployment dry-runs:

   ```bash
   bun run check
   bun run --filter @kharidyar/web check:deploy:preview
   ```

2. Rehearse the release in preview. Record the pre-migration bookmark and active Worker version in the release notes:

   ```bash
   bun run db:bookmark:preview
   bun run db:migrations:list:preview
   bun run db:migrate:preview
   bun run deploy:preview
   bun run release:smoke -- https://kharidyar-preview.formahsa.workers.dev
   ```

   On the first preview release, replace `bun run deploy:preview` with:

   ```bash
   bun run build:preview
   cd apps/web
   bunx wrangler deploy --secrets-file <ABSOLUTE_PATH_TO_PREVIEW_SECRETS>
   cd ../..
   ```

3. Confirm preview behavior manually for Google sign-in and one authenticated planning read. If the release changes Concept media, upload one small image, confirm an authorized read, delete it, and confirm the UI no longer loads it. If the release changes research, also run one bounded provider request. Do not continue while a required preview secret, callback, R2 bucket, or Images binding is missing.

4. Record the production recovery points before changing production:

   ```bash
   bun run db:bookmark:production
   bun run deployments:production
   bun run versions:production
   bun run db:migrations:list:production
   ```

5. Apply migrations before code only when the reviewed migration is backward-compatible with the active Worker. Otherwise use an expand/deploy/contract sequence. Wrangler captures a D1 backup and rolls back the individual migration file if that file fails:

   ```bash
   bun run db:migrate:production
   bun run db:migrations:list:production
   ```

6. Deploy the production build and immediately run the unauthenticated release smoke:

   ```bash
   bun run deploy:production
   bun run release:smoke -- https://kharidyar.formahsa.workers.dev
   ```

7. Manually confirm Google sign-in, one authenticated planning read, and—when affected—one private Concept upload/read/delete cycle and one bounded provider request. Record the commit, new Worker version, previous Worker version, pre-migration D1 bookmark, operator, timestamp, and smoke result.

## Worker rollback

Only roll back to a version compatible with the current D1 schema and existing bindings. Never assume a Worker rollback also restores D1.

1. Find the exact known-good version:

   ```bash
   bun run deployments:production
   bun run versions:production
   ```

2. From `apps/web`, roll back and attach the incident reason:

   ```bash
   bunx wrangler rollback <VERSION_ID> --name kharidyar --message "<INCIDENT_REASON>"
   ```

3. Run the release smoke and the affected authenticated flow. If the target code predates a destructive or contract-changing migration, do not use it; deploy a forward fix that supports the current schema.

## D1 recovery

D1 Time Travel is always enabled on the production storage backend. Recovery is destructive, cancels in-flight queries, and must be reserved for a confirmed data incident—not an ordinary application rollback.

1. Stop writes operationally and record the current bookmark so the restore itself can be undone.
2. Resolve the desired bookmark or RFC3339 timestamp with `wrangler d1 time-travel info`.
3. From `apps/web`, restore production only after independently checking the database name and recovery point:

   ```bash
   bunx wrangler d1 time-travel restore kharidyar-production --bookmark <BOOKMARK>
   ```

4. Record the `previous_bookmark` returned by Cloudflare, run aggregate integrity checks and `PRAGMA foreign_key_check`, then run the release smoke and affected authenticated flow.
5. If the recovery point was wrong, use the returned `previous_bookmark` to undo the restore.

Exercise the restore procedure against preview or a disposable database. Do not restore production merely to prove the command works.

## Concept-media retention and recovery

R2 bytes and D1 metadata have deliberately different recovery behavior:

- A successful image upload is normalized to a new opaque private R2 object. Source bytes are never stored.
- Replacing a base image or deleting an image immediately tombstones the D1 row and deletes its R2 object. Removing a Concept does the same for every active image.
- A failed R2 deletion remains a private, unreachable object and is retried by later authorized media reads. Logs contain only a safe event code and image ID.
- D1 retains the lifecycle tombstone; the UI and content route cannot read it. There is no application-level image trash, media backup, or restore operation.
- D1 Time Travel does not restore deleted R2 bytes. Conversely, restoring D1 to an earlier point can recreate metadata whose object no longer exists. After a D1 restore, audit active `concept_images` keys against R2 before reopening writes; missing objects must remain unavailable and be reconciled explicitly.
- Any future backup, retention, or AI-derived-image policy requires a separate privacy review before it changes this deletion guarantee.

## 2026-09-05: Concept-media preview release

- Deployed at `2026-09-05T11:07:56.662357Z` by Codex using the product owner's authorized Wrangler session.
- Git commit: `7fc8165dd8c36d06cc348be38f920ae9d61e3f07` (`feat: add private concept media foundation`); working tree was clean before deployment.
- Environment: [preview](https://kharidyar-preview.formahsa.workers.dev), Worker `kharidyar-preview`. Production was not migrated or deployed in this release.
- Previous Worker version: `dd7ab70a-db7a-4c03-836a-d05507716f09`.
- New Worker version: `0610503c-6972-4d3e-bc65-928e3de0e6e3`, confirmed at 100% traffic.
- Pre-migration D1 bookmark: `0000000b-00000000-000050dd-46486ad7e484e695c969bc1a88ccbbc6`.
- Migration applied: `0010_minor_leech.sql`; no pending preview migrations remain.
- Integrity: existing aggregate counts preserved (1 User, 0 Workspaces, 0 Collections, 0 Items); 0 Concept Images after migration, 11 applied migrations, and no foreign-key violations.
- Preflight: preview build and Wrangler dry run passed; all six required remote secret names were present. The preview R2 bucket was empty, with public `r2.dev` access disabled and no custom domains.
- Live checks: release smoke passed for the document, public API, security headers, and session boundary. Anonymous Concept-image list, content, upload, and delete requests all returned private, non-cacheable JSON `401` responses.
- Authenticated check: the product owner confirmed the preview sign-in and image upload/read/delete cycle on 2026-09-05 and approved the production release. This is user-reported validation, separate from the automated boundary checks above.
- Provider research check: not repeated; this release changes Concept media, not research.
- Recovery: migration 0010 is additive, so the previous Worker is schema-compatible for a code-only rollback. Retain the table and existing data when rolling back code; D1 restore requires the separate recovery procedure above. D1 Time Travel does not recover deleted R2 image bytes.

## 2026-09-05: Concept-media production release

- Deployed at `2026-09-05T11:44:26.411682Z` by Codex using the product owner's authorized Wrangler session, after the preview confirmation.
- Git commit: `7fc8165dd8c36d06cc348be38f920ae9d61e3f07` (`feat: add private concept media foundation`), matching pushed `main` and the preview-tested application code. Only `PROJECT.md` and `RELEASE.md` release notes were uncommitted; no application, dependency, migration, or configuration changes were included beyond that commit.
- Environment: [production](https://kharidyar.formahsa.workers.dev), Worker `kharidyar`.
- Previous Worker version: `5938210e-5144-4bd7-8d0a-fec679d2d690`.
- New Worker version: `c18f6d9d-0f55-44a6-ab2a-eecedae899bc`, confirmed at 100% traffic.
- Pre-migration D1 bookmark: `0000004a-00000000-000050dd-251fd5da9f95b32cbf563b189b522b3d`.
- Migration applied: `0010_minor_leech.sql`; no pending production migrations remain.
- Integrity: aggregate counts preserved (1 User, 1 Workspace, 1 Collection, 1 Item); 0 Concept Images immediately after migration, 11 applied migrations, and no foreign-key violations.
- Preflight: production TypeScript/build and Wrangler dry run passed; generated bindings explicitly matched the production D1, R2 bucket, Workflow, and Images binding. All six required remote secret names were present; their values were neither read nor changed. The production R2 bucket was empty, with public `r2.dev` access disabled and no custom domains.
- Live checks: release smoke passed for the document, public API, security headers, and session boundary. Anonymous Concept-image list, content, upload, and delete requests all returned private, non-cacheable JSON `401` responses. Google sign-in initiation returned the expected Google destination with the production callback, without logging OAuth credentials.
- Authenticated production check: the product owner confirmed the requested production sign-in, planning read, and image upload/read/delete test as done on 2026-09-05. This is user-reported validation, separate from the automated checks above. The Concept-media release is complete.
- Provider research check: not repeated because research behavior was unchanged.
- Recovery: the additive migration is compatible with the previous Worker for code-only rollback. Preserve the media table and any new records; use the separate D1 recovery procedure only for a confirmed data incident. D1 restore cannot recover deleted R2 bytes.

### Next ordered steps

The Concept-media release documentation was committed/pushed as `a96aa4e`, and private MCP as `8baa32b`. The local Codex owner-only preview is deployed and verified. The user subsequently committed/pushed the local runner and compact UI as `5a921a5`; the new UI has not been deployed. See the latest entries below.

1. The compact UI and runner source checkpoint is pushed as `5a921a5`. Deploy the UI only after an explicit request; future commits retain the exact staged-tree/message approval gate. See [HANDOFF.md](./HANDOFF.md).
2. Subsequent tasks: ChatGPT/Claude write tools and reconnect recovery; private floor plans; image generation; WantKit chat. Work on one at a time after a new request. Paid OpenAI API and Expo remain deferred.

### 2026-09-05: Private MCP implementation — local only

- Added ten permission-checked read tools, personal OAuth registration/S256/consent/disconnect, revocation and session checks, limits, and English/Persian setup screens. No public directory publication, assistant memory import, MCP write tools, or AI provider calls.
- New migration `0011_flimsy_mojo.sql` adds seven OAuth tables/indexes, with matching generated schema metadata. It does not alter/drop existing planning tables. Applied only in isolated tests; persistent local, preview and production databases remain unchanged.
- `MCP_ENABLED="false"` and an empty allowlist remain in all checked-in environments. Dependencies, auth/service/routes, UI, migration, Worker configuration/types, tests and docs are unstaged. No commit or deployment was performed.
- Full `bun run check` passed: 140 tests, lint, typecheck, migration metadata, production build and deployment dry-run. Fake-account browser checks covered registration, secret reveal/dismissal, consent, provider selection and disconnect in English and Persian. Setup and remaining live checks: [PRIVATE_MCP.md](./PRIVATE_MCP.md).
- Before MCP work, baseline reconciliation preserved the interrupted API draft in a verified local archive and removed its unsafe `0011_openai_research.sql` from active paths. Baseline validation passed all 127 existing tests. Recovery details remain in the handoff.
- Proposed next release is preview only, after explicit approval, with a D1 bookmark, additive migration and allowlist limited to approved WantKit users. A code rollback can retain the added OAuth tables; permanent revocation requires deleting registrations. Disabling the flag stops access but does not erase stored grants or assistant-retained conversations.

## 2026-09-05: Private MCP preview deployment

- Explicitly approved by the product owner after reviewing the local implementation. Deployed the uncommitted MCP tree based on `a96aa4e`; no staging or commit. The existing release runbook's clean-commit default was superseded by that specific preview approval.
- Environment: preview only, Worker `kharidyar-preview`, [preview app](https://kharidyar-preview.formahsa.workers.dev). Deployed at `2026-09-05T19:21:51.183424Z`, operator Codex using the authorized Wrangler account.
- Previous version: `0610503c-6972-4d3e-bc65-928e3de0e6e3`. New version: `b51b0cd5-d575-4d39-8d8f-e24ef2232677`, confirmed at 100% traffic.
- Pre-migration D1 bookmark: `00000011-00000016-000050dd-a93197d80e1e66a5478a1d42b8c6ecf4`. Applied only `0011_flimsy_mojo.sql` (27 statements; seven additive OAuth tables). Twelve total migrations now applied.
- Preserved before/after counts: 1 User, 1 Workspace, 1 Collection, 0 Items, 1 Concept Image; zero foreign-key violations. OAuth client count was zero immediately after migration.
- Enabled MCP for the sole verified preview WantKit user through the ignored generated deployment configuration. Checked-in configuration remains disabled with an empty allowlist in every environment; production was neither migrated nor deployed. A normal rebuild restores those safe defaults, so later pilot deploys must deliberately reapply the reviewed preview-only override.
- Preflight: existing full check/140 tests, fresh preview build and exact-config dry-run passed; all six existing remote secret names were present. No existing secret values were read or changed.
- Post-deployment release smoke passed. Protected-resource/issuer metadata matched preview and advertised S256; anonymous MCP returned non-cacheable `401` with the expected OAuth discovery challenge. Authenticated setup page loads for the owner. ChatGPT Pro private setup created “WantKit Preview” and opened WantKit consent, then browser control disconnected. An aggregate-only check before successful consent found 1 registration, 0 consents and 0 active access/refresh tokens. The user's window stayed open; the 21:59 Amsterdam screenshot showed `invalid_signature` for the original consent link, which expired at 21:39. Synthetic checks through installed BetterAuth serialization/verification confirmed correct fresh/expired signature handling. After restarting sign-in from the existing plugin, the user confirmed ChatGPT successfully read Workspace “Test 1.” No code change or redeployment was needed. This is a user-reported live read; other tool reads and live disconnect/revocation remain unverified. Claude is pending because the user signed in only to ChatGPT.
- Source manifest SHA-256: `4221032db2e405b2b5cbc7bbaa93a4641de72af9e615b7397e8b1303a18b53b4`; Worker bundle SHA-256: `a2d932f204957776e6e946ca749c5a0f7c3b65893a44365492ff295949c47683`. Manifest is local at `/tmp/wantkit-mcp-preview-source-manifest.json`; deployment/smoke logs use `/tmp/wantkit-mcp-preview-*.log`. The manifest covers application/package files, not the subsequent documentation updates or ignored preview allowlist.
- Recovery: the previous code version can retain the additive tables. Disabling MCP stops access; delete a registration to revoke it permanently. Do not roll back D1 or delete planning/image data to disable the connector.

## Release record template

```text
UTC timestamp:
Operator:
Git commit:
Environment:
Previous Worker version:
New Worker version:
Pre-migration D1 bookmark:
Migrations applied:
Smoke result:
Authenticated check:
Provider check, if affected:
Rollback/recovery notes:
```

References: [Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/), [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).


## 2026-09-06 local Codex runner — pre-deployment checkpoint

- Based on pushed MCP commit `8baa32b`; local runner changes are uncommitted and unstaged. The user reports both ChatGPT and Claude read connections worked. Claude later displayed `invalid_client` / `client_id is required` after disconnect; reconnect UX remains a follow-up.
- Added private per-user/session pairings, outbound claimed research jobs, a bounded ChatGPT-login CLI runner, permission/cancellation checks, provider/provenance integration and English/Persian setup/provider controls. Paid OpenAI API remains deferred.
- Migration `0012_famous_thunderbolts.sql` adds pairings/jobs and widens the provider constraint. A real isolated D1 test preserves nonempty Research Requests, Runs, Sources, Results, Promotions and planning rows, with foreign keys enabled; simulated late failure also rolls back safely. No persistent local or remote migration was applied.
- `bun run check` passed: **161 tests**, lint, TypeScript, Drizzle checks, production build and Wrangler deployment dry-run. Log: `/tmp/wantkit-local-codex-check.log`. Existing runtime/auth warnings and the frontend chunk-size warning remain. Local Codex `0.153.0` reports ChatGPT login. No live model call ran.
- Browser UI verification could not complete because Argent reported `Transport closed` and the isolated Playwright session did not remain connected. Do not infer live compatibility from mocked process tests.
- No commit, push, deployment, new public tunnel or provider credential transfer occurred. Local Codex defaults are disabled in every environment. The production dry-run regenerated ignored deployment config; do a fresh preview build and explicitly restore the private MCP/local-runner preview flags before an approved preview deployment. Current deployed preview/production remain untouched.
- Next: finish English/Persian UI checks and, after approval, deploy/migrate the private preview and run one representative local research/cancel/review flow. See [LOCAL_CODEX.md](./LOCAL_CODEX.md).

## 2026-09-06: Private local Codex preview verified

- The product owner's “go” explicitly approved the proposed private-preview deployment and one bounded live research call. This entry supersedes the pending state above. Operator: Codex using the authorized Wrangler/browser sessions. No staging, commit, push, production migration/deployment or public agent tunnel occurred.
- Deployed uncommitted application changes based on pushed `8baa32b` to [preview](https://kharidyar-preview.formahsa.workers.dev), Worker `kharidyar-preview`. New version: `4e4a4724-efdf-47c0-9638-d302bfac186e`; previous version: `b51b0cd5-d575-4d39-8d8f-e24ef2232677`. The recorded live call ran from `2026-09-05T22:48:24.037Z` to `2026-09-05T22:48:48.240Z`; final mobile verification completed on 2026-09-06.
- Pre-migration preview D1 bookmark: `0000001d-00000000-000050dd-3aecd1dc3e048cd0b8f3eab5f0ace517`. Applied `0012_famous_thunderbolts.sql` (23 statements); 13 total migrations. Before/after counts were identical: 1 User, 1 Workspace, 1 Collection, 0 Items and 0 Research Requests/Runs/Sources/Results/Promotions. `PRAGMA foreign_key_check` returned no violations. Only preview was migrated.
- Preflight: full 161-test quality gate, fresh preview build and exact-config Wrangler dry-run passed. All six existing remote secret names were present; secret values were not read or changed. Post-deployment release smoke passed for the document, public API and session boundary.
- The deployed preview configuration enabled both MCP and local Codex for the same sole approved preview owner. No account IDs are committed; checked-in flags remain disabled/empty in all environments. A normal build overwrites the ignored private override. Verify the target account and deliberately reapply reviewed preview flags before a future approved deployment.
- Exactly one actual model execution used the person's existing ChatGPT login, model `gpt-6-astra` and `codex-cli 0.153.0`. Request `faba41c3-5ddb-4808-9478-534650d362f8`, Run `9a8fd878-1177-4a36-9808-6e76736561a3`: completed in about 24 seconds and saved one cited lamp source/result. Provenance records live search, locally reported output and `independentlyVerified: false`; structured price/availability stayed unknown. No automatic Item/Candidate/Offer/promotion, Tavily fallback or paid API call occurred.
- Separate no-model lifecycle check: Run `d9179caf-be03-4517-a190-40d210c3873c` expired after ten minutes offline with `local_runner_unavailable`. Retry `8b5790ee-8927-49e2-b5ee-8c313ac961f9` was claimed and cancelled through the UI; subsequent lease and completion requests both returned `409`. Disconnecting the temporary verification pairing made its token return `401`.
- Replaced the temporary pairing with **This Mac** and saved standard mode-600 configuration at `~/.config/wantkit/codex-connection.json`. A final claim confirmed no pending jobs, without invoking a model. Temporary credential copies were removed. No polling process remains running; start with `bun run local:codex run --model gpt-6-astra`. The pairing depends on the original WantKit session remaining valid.
- Browser checks passed for English desktop at 1440 px and Persian mobile at 390 px: connector setup, provider/pairing selection, completed/cancelled research, unverified-source notice and result review. No horizontal overflow; mobile dialog client/scroll width both 356 px. Final browser console reported no errors or warnings. Provider-authored text and the saved runner error remain in English. No promotion was performed because this collection has no Items. Ignored screenshots are under `output/playwright/local-codex-*.png`; the signed-in browser was left in English at desktop size.
- Browser tooling: Argent/CUA transport was unavailable; the separate Playwright session worked with the approved CLI run outside the filesystem sandbox. Sandbox connection failure causes that CLI to unlink its session socket. Do not repeat sandboxed browser calls against the signed-in session.
- Source manifest SHA-256: `7184c443fc6fd29ee46bc4ec63d823b6acc6512b93c041e66e0e6a3552ab71e6`, local file `/tmp/wantkit-local-preview-source-manifest.json`. It covers application/package files, not later docs or ignored preview flags. Logs use `/tmp/wantkit-local-preview-*`; cancellation and final pairing logs contain only status metadata. An optional final D1 aggregate recheck was rejected by the current CLI account (`7403`); no new final aggregate audit is claimed. The earlier migration integrity and live application results above passed.
- Recovery: disable the local flag or revoke the pairing to stop new access. Preserve pairings/jobs and saved research when rolling back code. The old Worker does not understand new local-provider runs, so prefer a forward fix; do not assume the previous Worker is behaviorally compatible with populated local results. D1 recovery is a separate destructive action requiring approval, not a normal connector-disconnect operation.
- Next: commit preparation only when requested, using the repository's exact staged-tree/message approval gate. Claude reconnect UX and subsequent roadmap tasks remain separate.

## 2026-09-06: Compact web UI — local only

- Implemented the user's compact SaaS direction with the existing React controls: sidebar Workspace/Collection navigation, Items/Brief & images/Budget views, search/group filters, action disclosures, mobile navigation, readable type and shared dialog close buttons. No dependency, Worker behavior, binding or schema change belongs to this UI task.
- Full `bun run check` passed with 161 tests, lint, TypeScript, schema metadata, production build and Wrangler dry-run. Final mobile adjustments passed repeated lint/typecheck/localization and browser checks. Logs are in `/tmp/wantkit-ui-revamp/`.
- A fictional in-memory sample passed create/edit, filtering, view switching, navigation and focus checks. English/Persian mobile views and a Persian 320 px research dialog had no horizontal overflow. This does not claim a deployed/backend integration test or participant usability study. See [UI_REDESIGN.md](./UI_REDESIGN.md) for sample and screenshots.
- No staging, commit, push, deployment, persistent data change or model call. The previous runner changes remain unstaged alongside the UI. The quality gate replaced ignored build artifacts with production/default configuration; a future approved preview release needs a fresh preview build and reviewed private MCP/runner overrides. Existing deployments remain unchanged.
- Confirmed next scope: ChatGPT/Claude actions first, routine adds/edits with confirmation for deletion, sharing and purchase decisions; then floor plans as images/PDFs with available measurements, image generation and in-app chat. Current MCP remains read-only. Paid API integration stays deferred.
- Follow-up UI polish moved account/language/connector/sign-out controls to bottom-of-sidebar Settings and kept only the name in the header. Desktop now has one main content scroller, a separately scrollable navigation list and an anchored footer; mobile retains document scrolling. Dialog/menu focus return preserves position and view changes reset desktop content scroll. Build/typecheck, lint, localization/UI-state tests and local browser scroll/settings checks passed. No commit, push or deployment; ready for the exact staged-tree approval checkpoint before AI writes.


## 2026-09-06: Private assistant actions — not released

- The prior local runner/compact UI checkpoint was committed and pushed by the user as `5a921a5`; the UI remains undeployed. The user subsequently committed and pushed the write extension as `9a65b41` (`feat: add MCP write actions with approvals and reconnect recovery`); local HEAD and origin/main match. It has not been deployed.
- Adds explicit `wantkit:write` consent, 49 mutation tools, ten supporting reads and a receipt reader. Sensitive actions wait for exact WantKit browser approval, with original-grant, current-permission, target-snapshot and duplicate-attempt checks. Routine changes retain existing service rules. Reconnect errors get bounded, localized recovery guidance.
- New additive migration `0013_mcp_actions.sql` adds one table and two indexes. It has only run in disposable test databases. No dependency/binding change, persistent migration, model call, commit, push or deployment belongs to this task.
- Full `bun run check` passed: 181 tests including 33 OAuth/D1 MCP tests, lint, typecheck, schema metadata, production build and deployment dry-run. English/Persian local sample approval/decline, write consent/setup, recovery, width and scrolling checks passed. No actual-client write flow was exercised. Evidence and existing warnings: [HANDOFF.md](./HANDOFF.md); coverage and credential upgrade: [MCP_ACTIONS.md](./MCP_ACTIONS.md).
- Before an approved owner-only preview release: record a fresh D1 bookmark and applied-migration state; review/apply 0013; rebuild preview; verify the established owner-only MCP/local-runner flags; review dry-run; deploy only with explicit approval. Production-check artifacts use disabled defaults and are not a ready preview configuration. Then reauthorize new write credentials and validate both actual assistant clients.

## 2026-09-06: Compact UI and assistant actions — private preview deployed

- The user's “go” authorized this preview release, superseding the pending entry above. Source: pushed `9a65b41ca6be7f1c253b355e963659f0fbe8a85f`, including UI checkpoint `5a921a5`. New preview Worker version: `c8bbf5a1-771a-45b3-b643-535fe76851af`; previous: `4e4a4724-efdf-47c0-9638-d302bfac186e`. Origin: `https://kharidyar-preview.formahsa.workers.dev`. No production changes, commit, push or model call occurred in this release task.
- Verified the authorized Cloudflare account with project Wrangler `4.127.1`. Captured pre-migration D1 bookmark `0000003e-00000000-000050de-4e9272088f0bc1355436ce173b41f119`. Only `0013_mcp_actions.sql` was pending; applied successfully (four commands including migration bookkeeping). Fourteen migrations are now recorded; none remain pending. Before/after User/Workspace/Collection/Item counts are 1/1/1/0, foreign-key checks are clear, and the new action table is empty.
- The source had already passed the 181-test quality gate. Fresh preview build and exact-config dry-run passed; existing Zod annotation/chunk-size warnings remain. Restored the four private connector/runner variables from the preceding live version into the ignored generated config, verified one identical allowed owner and all preview bindings, and deployed those exact artifacts without rebuilding. Post-deployment bindings and variables match the previous version. All six existing secret names are present; values were not read or changed. No new credentials were created.
- Release smoke passed for the document, public API and authentication boundary. Additional live checks passed for explicit read/write discovery, correct OAuth issuer and S256 PKCE, no public registration endpoint, missing/invalid bearer rejection, bounded reconnect recovery redirects, session-required connector/approval endpoints, and JS/CSS bytes matching the reviewed build.
- At this deployment checkpoint, actual-client writes were pending sign-in and no live connection or planning record had changed. The subsequent authenticated ChatGPT checks are recorded below; public smoke and fictional UI tests alone do not establish client compatibility.
- Private evidence: `/tmp/wantkit-mcp-preview-release/` (configuration/version records, migration/bookmark/integrity, smoke logs and artifact manifest). Manifest SHA-256: `a475890301791b642b43394fee4a9af3220ee009154566183f88f70105dd58e7`. Do not commit private allowlists or logs. Only HANDOFF, MCP_ACTIONS and RELEASE documentation is dirty; nothing is staged.
- Recovery: migration 0013 is additive and compatible with the preceding local-Codex Worker. Code rollback can leave its action table in place. Revoke a write connection to stop that grant, or disable MCP to stop new connector access; pending approvals recheck the original grant. D1 restore is separate and destructive, requiring explicit approval. Never restore D1 merely to remove a connector or roll back the UI.

## 2026-09-07: ChatGPT write connector verified

- The user chose ChatGPT/OpenAI and deferred Claude. Preview source/version and production remain unchanged. No application code, migration, deployment, staging, commit or push occurred during this client check; only HANDOFF, MCP_ACTIONS and RELEASE documentation changed.
- Fixed the invisible test-browser setup by reopening `local-codex-live` as headed Chrome. The owner signed in to WantKit and ChatGPT. Created the private ChatGPT plugin **WantKit**, using new opt-in **My ChatGPT** credentials, the displayed callback, `client_secret_post` and `offline_access`. Consent returned 200 with read/write scopes; Refresh loaded all 70 actions. The obsolete **WantKit Preview** definition remains; use the new **WantKit** plugin. Secrets stayed out of chat and repository files.
- Three bounded turns in **Create Test Collection** created one disposable Collection and Item in “Test 1,” edited quantity from 1 to 2, and read it back. The first archive receipt `18ee96d2-685a-4eff-955c-fef0b04f1e4a` stayed pending until declined through WantKit; direct readback confirmed the Item remained active. Exact replay returned the same denied receipt.
- A fresh request with operation ID `chatgpt-preview-archive-approve-20260907` returned pending receipt `2be7a3d3-ccdf-4015-bb05-8c2a161aeb48`. Browser approval returned 200/succeeded and archived only the test Item. ChatGPT replayed the exact request once and read its receipt. Independent authenticated reads confirmed quantity 2 and unchanged archive/update timestamp `2026-09-06T22:13:33.140Z` (2026-09-07 Amsterdam). Final Collection count is two, including exactly one **Connector check ChatGPT 2026-09-06**, containing its archived **Connector test lamp**. No research, sharing or purchase was requested.
- ChatGPT's approval label first opens its **External site** confirmation; **Open link** reaches the correct WantKit review page. No URL/rendering fix was needed.
- Before Claude was paused, its replacement connector read “Test 1” successfully but requested only read scope; a create attempt was rejected before mutation. Its write-scope upgrade behavior is deferred, not verified. No Claude compatibility code was changed.
- The local CLI `EEXIST` report was an existing saved pairing, not an invalid token. A private, redacted check returned 200 for **This Mac**; the mode-600 config was preserved. Start `bun run local:codex run --model gpt-6-astra` from the repository and select **This Mac** for local research. No runner loop or new local research was started. The unused **Reza’s MacBook Pro** pairing remains.
- Existing 181-test/full-check results still apply to unchanged application source; live checks above cover the actual ChatGPT path. Other tools, Claude writes, floor plans and image generation are not claimed as tested. Next ordered product task: private floor plans, only after a new request. Suggested documentation commit: `docs: record verified ChatGPT write connector`.
