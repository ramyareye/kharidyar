# Release runbook

## Compact UI and product thumbnails — 2026-09-09 (preview and production verified)

The user requested release of pushed `37fff6f5070bb894708ffa4d4983e5c04ba9a262`. The final release also includes the two-line gallery-frame correction in `apps/web/src/react-app/ConceptMedia.css`, captured in this follow-up changeset: `position: absolute; inset: 0;` constrains portrait images to the existing aspect-ratio frame. CSS SHA-256: `cef74c735553e4197d2c472949f77a319cfcbfe81ce82c16743fa7ac2984c9d5`.

| Environment | Final active version (100%) | Version before this release | Final manifest SHA-256 |
| --- | --- | --- | --- |
| Preview | `65df91c1-ccec-4f3e-bd8d-c8fa84aed3d3` | `f97fdac6-1d04-40f5-ad7a-ef797c3145bf` | `4ff65940e9e2949e79a9e0ee3663e754b00f4a110c2619ee70b4c6d8351bdb6a` |
| Production | `b91a8917-3290-40a1-b1b7-8de1c1222c06` | `38184797-f0ac-4985-ab62-0fff22e656d2` | `2c91fc69fc725edc413ab8e22ae8ec0150544378633290282f3d54d7c59ad0ee` |

- Production: **https://wantkit.todoless.dev**. Preview was migrated and verified first. Preview intermediate version `3ca1cbbc-129b-41e7-997c-9177817ff485` exposed the portrait clipping during desktop QA; final preview and production include its correction. Production was deployed once, after corrected preview passed.
- Migration `0016_product_images.sql` adds nullable `products.image_url`; it ran exactly once per environment. Both databases now have 17 migrations. Before/after aggregate counts and quick/foreign-key checks pass. Production data was not edited; preview only temporarily set and cleared the image URL on an existing disposable QA product, advancing its update timestamp.
- The 243-test full gate passed for the pushed implementation. Both corrected environment builds, TypeScript checks and artifact dry-runs passed. Signed-in browser checks verified preview thumbnail persistence/clearing, selected-product image display, navigation, and original/draft gallery. Exact image/frame bounds were checked locally at 390/1280px, live preview at 1280px and live production at 466px. Production retains Sofa quantity 1, the QA item quantity 2 and the two active images with Base as cover. Fresh OAuth and second-user live testing were not repeated.
- Both final deployments pass smoke and ten public checks, including exact JS/CSS/logo bytes; the client asset sets match across preview/production. Each artifact freezes 229 source hashes and 30 artifact hashes. Live variables, owner-only integration flags/allowlists, six inherited secrets, all resource bindings and runtime settings remain equal to their respective previous versions. Dashboard-managed routes are omitted from the deployment configuration so the existing domain assignment is retained.
- No research/image generation, import, connector registration or permissions change was performed. Existing products require a direct HTTPS image URL before showing a thumbnail. The signed-in production page is left available to the user.

Recovery: Worker rollback does not revert D1. The new nullable column is additive and should be retained if rolling the Worker back to the version in the table; do not drop it or restore a database merely to revert UI code. Fresh pre-migration production bookmark and metadata are in `/tmp/wantkit-compact-ui-framing-release/production/bookmark-recheck.json`; preview pre-migration evidence is in `/tmp/wantkit-compact-ui-release/preview/`. Final artifact/settings/checks are in `/tmp/wantkit-compact-ui-framing-release/{preview,production}/`. Do not rerun one-shot deployment scripts; inspect the recorded active version first. The CSS-only preview kept the Worker script etag; read-only verification was completed after removing the invalid assumption that every asset change must change that etag.

At deployment time, HANDOFF/RELEASE notes, the two-line CSS fix and the pre-existing wrangler research-origin defaults were unstaged; no assistant commit/push occurred during deployment. This follow-up changeset captures the deployed CSS correction and release notes. The wrangler defaults are excluded and remain unstaged. Historical warning/reconnect notes below describe earlier checkpoints: the normal connection and private image import were subsequently verified, as recorded in HANDOFF.

## WantKit branding — 2026-09-09 (preview and production verified)

The user pushed and requested release of `56c70899849fa9d77c6e4c4b581d06d4739f507a`. Remote main and the previously reviewed branding patch match exactly. This release changes public branding and context-export filenames; it leaves the existing domain, credentials, access settings and data intact.

| Environment | Active version (100%) | Previous version | Manifest SHA-256 |
| --- | --- | --- | --- |
| Preview | `f97fdac6-1d04-40f5-ad7a-ef797c3145bf` | `f6179fdd-d681-4f03-bfe6-12f75b095804` | `40bd8f952b0e1fb04949ec7619c55d7e4e4016ffd233d979b8b552f3a06de54a` |
| Production | `38184797-f0ac-4985-ab62-0fff22e656d2` | `b4303de9-8aeb-460d-813f-6391f75dc5ce` | `a8c196752002a2590d84817bc481b7c66d62d4a029ff8ad7ae27390affa1df5a` |

- The full local quality gate had passed for this exact source. Fresh environment builds and exact-config dry-runs passed; each frozen release contains 225 source hashes and 29 artifact hashes. Preview was verified before production. Smoke and ten public checks pass in both, including new WantKit title/favicon and byte-identical deployed JS/CSS/logo.
- Existing authenticated browser sessions show WantKit and its loaded W mark; preview collection and production Japanese theme load. Production retains Sofa quantity 1 and QA item quantity 2. EN/FA and compact mobile branding were checked locally. Fresh Google sign-in was not repeated; the separate Chrome warning/review remains unresolved and unsubmitted.
- Live variables, sole-owner allowlists, six inherited secret bindings, D1/R2/Images/Browser/Workflow bindings and runtime settings are identical before/after. No secrets file was used, and no credential values were read. Dashboard-managed routing and the custom domain are preserved. No migrations ran: all 16 were already applied, aggregate counts stayed unchanged and quick/FK checks passed.
- Runtime files are committed/pushed. The two existing research-origin defaults in `apps/web/wrangler.json` match live production and remain unstaged with HANDOFF/RELEASE notes. Builds verified that these are the only configuration differences from the pushed source, then restored and compared the exact live deployment configuration. Checked-in integration defaults must not overwrite the owner-only live settings.

Private evidence and timestamps: `/tmp/wantkit-branding-release/{preview,production}/`, including manifests, release results, `bookmark-recheck.json`, before/after metadata/integrity and signed-in checks. The previous versions in the table are the migration-free rollback targets; no database rollback is needed. No Google Console update, reconnect, generation or import belongs to this release. Operator: Codex using the authorized Wrangler account.

## WantKit domain and regional file-host release — 2026-09-09 (deployed and verified)

Production's primary origin is now **https://wantkit.todoless.dev**. The user assigned the domain, completed the Google OAuth update and authorized release. The exact approved commit `1ba9b5753bfdda94c2e8d78be29d115563b836be` was confirmed on remote main, then deployed through preview before production.

| Environment | Active version (100%) | Previous version | Manifest SHA-256 |
| --- | --- | --- | --- |
| Preview | `f6179fdd-d681-4f03-bfe6-12f75b095804` | `8a89c10c-96b5-4044-8ba2-652d388128a9` | `fc9b9c42e421c6e36f78d6da13401ad6324777db573bbc371571e60a35a8d369` |
| Production | `b4303de9-8aeb-460d-813f-6391f75dc5ce` | `40773e6b-469a-48f0-9885-8553b29c03bc` | `308d19df379cf1d97fc3eaf493b5106a27c56f2c43e6d3335eec63dd030f9db9` |

- The regional fix accepts the bounded `sdmntpr<region>.oaiusercontent.com` family, including the observed northcentralus handoff, with exact domain and three-segment path boundaries. Legacy file URLs and all approval, expiry, transfer/decode, private-save and original/cover protections remain. Eighteen regional regression cases and the full **240-test** source gate pass. Provider evidence and the distinction between observed transport and inferred policy are in VISUAL_WORKFLOW.
- Both releases verified 224 source hashes and 28 frozen artifact hashes, dry-ran the exact deployment configuration, and passed smoke plus all nine public checks. Deployed JS/CSS match the frozen builds. Database aggregate counts, quick check and foreign keys pass unchanged before/after release. All 16 migrations were already applied; none ran.
- Production changed only the public origin values in `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS` and `RESEARCH_BROWSER_ALLOWED_ORIGIN`. The trusted list is `https://wantkit.todoless.dev,https://kharidyar.formahsa.workers.dev`. Wrangler uploaded the two origin bindings atomically with code using `--secrets-file`, preserving the other encrypted bindings. Credential values were not accessed or changed. Owner-only integration flags/allowlists, six secret names, storage/database/workflow bindings and runtime settings remain intact.
- The custom domain remains dashboard-managed: frozen configurations intentionally omit `route`/`routes` so deployment preserves the assigned route. The old workers.dev address is retained, but canonical OAuth discovery and approvals now use the custom domain. Google configuration includes authorized domain `todoless.dev`, origin `https://wantkit.todoless.dev` and exact callback `https://wantkit.todoless.dev/api/auth/callback/google`, alongside the existing URLs. Live in-app Google sign-in passes on the custom domain.
- Signed-in production confirms Harlemmer / Japanese theme, Sofa quantity 1, QA Item quantity 2, and the sole active original Base still marked Space/Cover at 3024×4032. The owner's existing read/write assistant registration remains present. Preview retains its three active Concept images and original cover. No new media/model call or native-file retry ran.

Private artifacts, manifests, live metadata, integrity results and signed-in checks are in `/tmp/wantkit-domain-release/{preview,production}/`. Pre-release D1 bookmarks: preview `000000a3-00000000-000050e0-840a43fb399c344794dadff56a965621`; production `0000008b-00000000-000050e0-ef93d2f8b7bb64b537ab7778de802ec9`. No database rollback is needed for this migration-free release. Any code rollback must explicitly preserve or reconcile the new origin settings and Google registration; do not assume a Worker version rollback reverses external OAuth settings.

The source configuration's default and production research origins and current runbook examples now match the deployed domain. These follow-up configuration/documentation changes are unstaged/uncommitted; runtime commit `1ba9b57` is already pushed. Future releases must still preserve the private owner overrides because checked-in integration defaults remain disabled.

Next: update/reconnect the existing **WantKit Production** ChatGPT app to `https://wantkit.todoless.dev/api/mcp`, preserving its owner registration where supported. Chrome remains under the user's control. Then obtain fresh approval and import the existing generated image once; do not replay the expired run or regenerate. The production image round trip is still pending that native import.

## Production image test — 2026-09-08 (generation passed; import rejected)

After the user enabled Chrome file access, the approved preview room photo uploaded once as production Base/Space `a32bf603-5c86-497a-b64e-46690389f177` and became the cover. The exact production review was approved, MCP image reading succeeded, and ChatGPT generated one **Calm Japandi Kitchen and Dining Nook** image using built-in generation. A single native import with operation ID `prod-japandi-room-import-20260908-1` returned `CHATGPT_FILE_URL_REJECTED`: host `sdmntprnorthcentralus.oaiusercontent.com`, path `/<redacted>/<redacted>/<redacted>`. The deployed validator supports the previously observed centralus host only, alongside the legacy file route. No import retry or regeneration occurred; the generated image remains in ChatGPT.

Action `54faa7de-5cf5-4d6c-a5bc-153b762b8469`; run `7fafa556-f22b-4123-94df-4dae377f1604`; original deadline 2026-09-08 14:23:27 UTC. Independent full reload shows one active image, Base still cover, unchanged Items, and identical Base bytes (SHA-256 `aa51cef39f65d8c5642788167fe7eff56029aa3db131fe761cb2d748addc8ece`). No draft was saved. This is not a successful production image round trip. Safe evidence: `/tmp/wantkit-production-release/image-test-result.json`; generated image and tool report: `https://chatgpt.com/c/6aa01002-84cc-83eb-b428-bbe9771b8186`. No runtime change, migration, deployment, staging, commit or push ran. The remaining work is regional host validation followed by a fresh-approved import of the existing image.

## Production ChatGPT write test — 2026-09-08 (passed)

The user authorized one disposable Item creation/edit test. WantKit Production created exactly one **QA connector write check 2026-09-08** Item (`5164692f-d302-416c-8528-17d5884999fb`) in Harlemmer / Japanese theme, then changed quantity 1 → 2 and description to **Create and edit verified through WantKit Production. Disposable test; no purchase intended.** Creation/update operation IDs were `prod-write-check-create-20260908-1` and `prod-write-check-update-20260908-1`. The connector read-back succeeded without failures.

An independent full reload of production confirms exactly two Items: the QA Item at quantity 2 and the unchanged Sofa at quantity 1. The QA detail history records both description values and quantity 1 → 2 under the owner; status remains Idea and priority nice-to-have. The QA Item is retained for inspection. No other planning record, deletion/archive, candidate/offer, purchase, sharing, research or image operation was part of this test. Evidence remains in the private ChatGPT conversation `https://chatgpt.com/c/6aa01002-84cc-83eb-b428-bbe9771b8186` and the live Item history. No runtime change, deployment, staging, commit or push occurred; only HANDOFF/RELEASE notes are dirty. Next is a separately authorized production image test with an explicitly selected Base photo.

## Production ChatGPT connection — 2026-09-08 (connected; read test passed)

Created **WantKit Production** in ChatGPT with one new owner OAuth registration pointing to `https://kharidyar.formahsa.workers.dev/api/mcp`. Used the confirmed callback `https://chatgpt.com/connector_platform_oauth_redirect`, `client_secret_post` and read/write/renewal scopes. Credentials went directly between visible setup forms and were then hidden; no secret was saved in chat or files. Both existing preview connections were preserved. Refresh loaded 77 tools.

The live read-only test successfully listed Harlemmer, opened Japanese theme and read Sofa (Idea, nice-to-have, quantity 1). The initial page size 100 was rejected by the maximum-25 validation; ChatGPT corrected it and subsequent production reads succeeded. Evidence: the private ChatGPT conversation `https://chatgpt.com/c/6aa01002-84cc-83eb-b428-bbe9771b8186` (Summarize WantKit Item). This verifies connection and reads only; no planning/media mutation, research job, image generation/import or local-runner pairing ran. A disposable write check is next, followed by a separately selected production Base image test. No runtime change, deployment, Git staging, commit or push occurred; HANDOFF/RELEASE remain the only dirty files.

## Owner-only production release — 2026-09-08 (deployed and verified)

The user explicitly approved production release with AI connections restricted to their account. Deployed pushed runtime commit `dfe243a09f9a745472b115a527a2a52244f83bc9` to **[production](https://kharidyar.formahsa.workers.dev)** as **`40773e6b-469a-48f0-9885-8553b29c03bc`**, at 100% traffic. Previous version: `c18f6d9d-0f55-44a6-ab2a-eecedae899bc`. The release command completed at `2026-09-08T13:04:16.498Z`; signed-in checks followed.

- Applied exactly `0011_flimsy_mojo.sql`, `0012_famous_thunderbolts.sql`, `0013_mcp_actions.sql`, `0014_floor_plans.sql` and `0015_visual_runs.sql`. All 16 migrations are now recorded. Fresh pre-migration D1 bookmark: `00000062-00000000-000050e0-aa7962618634da863daa492f95487b69`. Quick check passed before/after migration; foreign-key checks passed before/after migration and after deployment.
- Existing data counts remained Users/Workspaces/Collections/Items/Concept-image rows **1/1/1/1/2**, with Candidates/Products/Offers/Merchants and the five research tables all empty. The signed-in image view confirms zero active images; the two existing rows are retained historical records. No planning/media mutation or provider call ran during this release.
- Enabled `MCP_ENABLED`, `CHATGPT_VISUALS_ENABLED` and `LOCAL_CODEX_ENABLED`. Both user allowlists contain only the independently verified production owner, Reza Babaei. Existing eight variables, six secret names and all resource bindings are preserved. No secret values were accessed or changed. Private config uses the production account identity, not a copied preview allowlist. Checked-in defaults remain disabled, so future release commands must preserve the reviewed private settings.
- Source remains exactly `dfe243a`: 224 source hashes and 28 frozen artifact hashes verified. The prior 225-test full gate, production-order populated migration/rollback rehearsal and fresh owner-only dry-run passed. Manifest SHA-256: `80de1886c6b46fe268a945dfff86c5a86c70283a31db582270a5c2ad5271696d`. Only uncommitted RELEASE/HANDOFF notes were present; no application source differed from pushed main. No Git commit/push ran in this release.
- Release smoke and all nine public checks pass: correct production discovery/issuer, private registration, bearer rejection, bounded reconnect errors, authenticated-only settings/approvals/floor plans/private images/image tools, and published JS/CSS matching the frozen artifact. Signed-in Google login, existing Harlemmer / Japanese theme / Sofa read, budget (€0 known subtotal; one unplanned Item), new Floor plans view, Brief & images and owner-only Connected assistants controls pass.
- Production has no registered assistants yet. No ChatGPT credentials or local pairings were created, and no production image round trip/local runner job was attempted. Fresh production upload/delete was not repeated; the image round trip remains live-verified in preview. Production connector setup and its first bounded integration test are the next task, on explicit request.

Private evidence and frozen settings are in `/tmp/wantkit-production-release/`. Preserve the six existing secrets and sole-owner allowlists on future deployments. The prior Worker is recorded for incident review; any rollback must account for new provider records, and it will not reverse D1 migrations. This release changed documentation only, still unstaged/uncommitted under the user's exact commit-approval gate.

## Production readiness — 2026-09-08 (prepared, not deployed)

Read-only production inspection and local release preparation completed for pushed runtime commit `dfe243a09f9a745472b115a527a2a52244f83bc9`. **Production remains unchanged** at Worker `kharidyar`, version `c18f6d9d-0f55-44a6-ab2a-eecedae899bc`, 100% traffic. Production deployment/migrations require the next explicit release instruction.

- Public release smoke passes; the browser displays Google sign-in. No fresh authenticated production check is claimed. D1 `quick_check` is `ok`, foreign-key issues are zero. Counts: Users/Workspaces/Collections/Items/Concept-image rows **1/1/1/1/2**; Candidates/Products/Offers/Merchants and all five research tables are empty.
- Applied migrations: 0000–0010. Pending, in order: `0011_flimsy_mojo.sql` (OAuth), `0012_famous_thunderbolts.sql` (local Codex and research-provider constraint), `0013_mcp_actions.sql`, `0014_floor_plans.sql`, `0015_visual_runs.sql`. Four are additive; 0012 rebuilds research runs and backs up/restores dependent research records. The existing populated preservation/late-error rollback regression passed, as did a disposable local D1 rehearsal starting at 0010 and applying all five in order with fictional populated research, promotions and planning data. The archived OpenAI-research draft is not part of this migration set.
- Production resources and six existing secret names match the prepared configuration; secret values were not read or changed. The baseline preserves all eight live variables and adds disabled MCP/local-Codex/ChatGPT-visual flags with empty allowlists. The user's choice between this off baseline and owner-only integrations is still pending. Owner-only configuration must use independently verified production identity, followed by a new dry-run/manifest; preview IDs must not be copied.
- Reviewed runtime differences: compatibility date stays `2025-10-08`; the new source adds `unhandled_rejection_after_microtask_checkpoint` and Worker routing for `/.well-known/*`. D1/R2/Workflow/BROWSER/IMAGES remain bound to the existing production resources, and the research browser origin remains the production URL.
- All 224 source hashes match the preview release validated by the 225-test full gate. Fresh production build and exact frozen-config dry-run pass; existing build warnings are non-failing. Frozen artifact: 28 files under `/tmp/wantkit-production-readiness/artifact/`; manifest SHA-256 `b0e546650fb59b534a2fb778de8e05a548919da02c9cf2570bb449689a744e56`. The manifest explicitly records that production deployment is not authorized and launch settings remain pending.
- Readiness recovery bookmark: `00000060-00000000-000050e0-75d11ff4361bb4d4af90a85e2e2ae618`. Capture a fresh bookmark immediately before an authorized migration. Migration-first rollout is compatible with the existing schema usage; Worker rollback does not undo D1, and old code must not be assumed to support records from newly enabled providers. Follow the rollback/recovery sections below and current [D1 migration](https://developers.cloudflare.com/d1/reference/migrations/) and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) guidance.

Next: settle the launch integration setting, then explicitly authorize production release. Before release, resolve the two uncommitted documentation files under the exact-tree approval gate and recheck live version, source/artifact hashes, migrations and recovery point. Private readiness evidence remains under `/tmp/wantkit-production-readiness/`; no production data export, model call, image mutation or secret change occurred.

## Buying-flow fixes — 2026-09-08 (preview deployed and verified)

The user's “go” authorized this preview deployment and the bounded buying-flow verification. Deployed clean, pushed `main` commit `dfe243a09f9a745472b115a527a2a52244f83bc9` as **`8a89c10c-96b5-4044-8ba2-652d388128a9`**, at 100% preview traffic. Previous version: `afe31098-ea13-4df1-93dd-b2d31d49692b`. Production is unchanged.

- Fixes: new Candidates default to Item quantity; direct Candidate switching clears the old selection before setting the new one within the same history transaction; selected plan quantities can be changed through **Save quantity**. English/Persian guidance directs these edits to the plan controls while preserving notes/rank editing.
- Validation: the reviewed commit exactly matches the staged content validated by the **225-test** full gate, lint/types, Drizzle check, production build/dry-run and local browser checks. Fresh preview build and exact-config dry-run passed. All 28 frozen artifact files and 224 source hashes matched before deployment; all artifact hashes matched afterward. Manifest SHA-256: `535c470a02331d902f9815c226efd6dddd1326118b37913541d51b15842b87dd`.
- Preserved all thirteen live variables, six secret names, resource/runtime settings and sole-owner allowlists. No migration ran; all sixteen are applied. D1 bookmark before release: `00000096-00000000-000050e0-a9e2eb87bd00eed9d2bee8b63c6aaad3`. Before/after deployment counts remained Users/Workspaces/Collections/Items/Floor plans/Concept-image rows/Visual runs/Candidates/Products/Offers/Merchants **1/1/3/2/1/4/5/2/2/2/1**; quick/FK checks passed. These counts include earlier retained QA records and image tombstones.
- Release smoke and all nine public checks passed, including deployed JS/CSS bytes matching the frozen build. In the existing signed-in preview, **Launch check 2026-09-08** (`1ebc4dea-3baa-441d-8f75-bc69bafb3c76`) switched directly from cotton to linen and back without clearing first. Cotton planned quantity changed 2 → 3 through **Save quantity**, producing €65 total (€20 × 3 + €5 once per line) and €35 remaining from the €100 Collection budget. Notes saved successfully afterward; quantity and notes persisted after a full reload. Item quantity stayed 2 and Add Candidate defaulted to 2. This verifies the real UI/API/D1 path; failed-save rollback and no-Offer quantity editing remain locally verified cases.
- The fictional QA Collection remains available with cotton planned at 3 units. No purchase, research/model call or media mutation ran. Private evidence/config: `/tmp/wantkit-buying-release/` (manifest, source files, artifact, versions/settings, integrity/bookmark, deploy/smoke/public logs and `live-buying-flow.json`). Do not commit private artifacts. Only RELEASE/HANDOFF documentation changed in this release task; those edits remain uncommitted.

Next ordered task, on explicit request: production launch-readiness and release preparation. No production deployment is implied by this preview release.

## Native-file import — 2026-09-08 (live verification passed)

After the host fix below, the user reports one successful native import of the existing Japandi image, no regeneration and a completed run. Read-only connector inspection confirms output `f5bdc73c-aa2f-42e1-9fb4-ef08055280a5`, role `edited`, cover `false`, provider `chatgpt`, Base `903d51c2-0e31-4e27-b34a-b30818c9e79f` and run `b82c67fa-f53f-471e-9c34-e7c5cd4606e7`. A fresh authenticated preview page loads the 1087×1447 private WebP (223,136 bytes), shows the AI-draft label and keeps the original Base as cover. All three active images decode.

This completes the reported import-failure check for this room-photo case. No new deployment, media mutation, migration or production change ran during verification. Preview remains at the last released `afe31098-ea13-4df1-93dd-b2d31d49692b`; the prior 219-test gate still covers its runtime. This documentation-only checkpoint passes `git diff --check`; the existing 34-entry tree remains unstaged/uncommitted. Historical release counts below predate the user's successful import. No further retry or log tail is needed; await the user's next task.

## Native-file host fix — 2026-09-08 (preview deployed)

The native-file diagnostic identified an unsupported `sdmntprcentralus.oaiusercontent.com` URL with three opaque path segments. The validator now accepts that exact reviewed origin/path shape in addition to the legacy file route. The fix and updated MCP description deployed as **`afe31098-ea13-4df1-93dd-b2d31d49692b`**, at 100% owner-only preview traffic. Previous version: `effd254c-76ee-4fcf-ab9a-d2a45a356972`. This resolves the reproduced host guard failure; the live ChatGPT signed-file download/save still needs a fresh approved attempt using the existing image.

- Three regressions failed before the change and pass after it; full `bun run check` passes **219 tests**, lint/types, Drizzle metadata, build and dry-run. Local MCP import saves a private WebP draft, preserves Base/cover, replays without another fetch and stores no signed URL. Spoofed/unreviewed origins and redirects remain denied. Tests use fictional image bytes; public DNS/HTTPS verification fetched only the host root, not a private image.
- Frozen artifact manifest SHA-256: `ec7dd76eeadf564fe8e94d78f1044d0e8efd0f752c4c28e58c2d1de7339f5047`. All 28 artifact and 223 source hashes matched. Source comparison to the prior release found only `chatgpt-files.ts`, `mcp-visual-tools.ts` and `mcp.test.ts`. Fresh preview build and exact-config dry-run passed before the single deploy.
- Thirteen variables, six secret names, resources/runtime and sole-owner access lists are preserved. No migration ran; all sixteen applied. Counts stayed 1/1/2/1/1/3/4 (Users/Workspaces/Collections/Items/Floor plans/Concept-image rows/Visual runs); quick/FK checks pass. Pre-release bookmark: `0000008a-00000000-000050e0-59def6a1e548cc85d5512cf075f1f896`.
- Release smoke and nine public checks pass, with unchanged frontend bytes. No app-media write, generation, private-file download, staging, commit, push or production change ran. Source remains uncommitted at detached `5673dd6`.
- Private evidence/config: `/tmp/wantkit-native-host-release/`, including `artifact/worker/wrangler.json`, manifests, before/after settings/integrity and `release-result.json`. Test/public-host evidence: `/tmp/wantkit-native-host-fix/`. Do not commit these directories.

Next: fresh approval and one native import of the existing generated image. A log tail was unnecessary for this explicit host-guard failure; use bounded/redacted diagnostics if a later download/save stage fails.

## Import URL diagnostic — 2026-09-08 (preview deployed)

Continued the user's reported native-file import failure with a redacted diagnostic, deployed as **`effd254c-76ee-4fcf-ab9a-d2a45a356972`** at 100% owner-only preview traffic. The previous version is `38af8b8d-a143-4b6c-a03c-14f6f07bbdeb`. The original URL compatibility failure remains unresolved; this release makes the hidden native-file URL's rejection reason and safe shape visible to the caller. No generation/import retry, production change, migration, staging or commit ran.

- Runtime delta: only `chatgpt-files.ts`; tests add two regressions in `mcp.test.ts`. URL acceptance is unchanged. The new error omits credentials, query strings, fragments and path values, returns bounded reason/scheme/hostname/path-pattern metadata, and adds no logging or persisted diagnostics. Later download failures no longer reuse the URL-location error.
- Full `bun run check` passed **216 tests**, lint/types, Drizzle metadata, build and dry-run. A fresh preview build and exact-config dry-run passed. All 28 frozen artifact hashes and 223 source hashes matched. Source comparison to the prior release found only the helper/test changes. Manifest SHA-256: `0a9d4ef39d1ab4e43607a67c10632eedce7116eb19c7326fb6143efa585b62fd`.
- All thirteen live variables, six secret names, resource/runtime settings and sole-owner allowlists are preserved. All sixteen migrations already exist. Counts before/after stayed 1/1/2/1/1/3/3 (Users/Workspaces/Collections/Items/Floor plans/Concept-image rows/Visual runs); quick/FK checks pass. A combined D1 query returned `7403`; individual read-only queries passed. Recovery bookmark: `00000080-00000002-000050df-516ef81713d0c2aedbd6c1f736dd5ace`.
- Release smoke and nine public checks pass, including byte-identical frontend assets. Signed-in preview confirms Base still cover, only two active images, and both decode at 3024×4032. No user image was downloaded through the import path. The exact failed run was separately verified to have no import reservation/output.
- Evidence and frozen config: `/tmp/wantkit-import-diagnostic-release/`, especially `artifact/worker/wrangler.json`, `manifest.json`, `release-result.json`, before/after metadata and integrity, `public-checks.json`; test evidence `/tmp/wantkit-import-url-debug/`. Do not commit private artifacts. Source remains unstaged/uncommitted at `5673dd6`.

Next: fresh approval for the same source/design, then one native-file import of the existing generated image. Capture `CHATGPT_FILE_URL_REJECTED` if returned; do not regenerate or invent/rehost a URL. Investigate the observed native location before changing the allowlist.

## Image-read refresh fix — 2026-09-07 (preview deployed)

The user requested release of the reviewed fix with “go”. The frozen uncommitted snapshot deployed without rebuilding as **`38af8b8d-a143-4b6c-a03c-14f6f07bbdeb`**, at 100% owner-only preview traffic. Previous version: `01415659-d99d-4e5c-b169-78b757d835b6`. This continues the explicitly requested uncommitted preview workflow; no staging, commit or push ran. Production is unchanged.

The fix permits token refresh only within the original OAuth authorization, user, client and session; the original deadline and both-token revocation checks remain enforced. The three image result tools now publish explicit output schemas. No migration, binding, secret, timeout or access-list change was needed. All thirteen live plain-text variables, six secret names and resource/runtime settings match before and after deployment, including the existing sole-owner allowlists and `CHATGPT_VISUALS_ENABLED=true`.

- Frozen config: `/tmp/wantkit-visual-refresh-release/artifact/worker/wrangler.json`. Manifest SHA-256: `220686f2fe553db5fa111ad4a30ae47302325798361fb23b4731db981ffc9fb6`. All 28 artifact and 223 source hashes matched; compiled refresh checks and output schemas were verified. Only `visual-service.ts`, `mcp-visual-tools.ts`, `mcp.test.ts` and `packages/contracts/src/visuals.ts` differ from the previous application snapshot. The first packaging attempt used a nonexistent `dist/worker` path and stopped; packaging from the observed `dist/kharidyar` build directory and the exact-config dry-run then passed before deployment.
- Recovery: previous Worker version above; pre-release D1 bookmark `00000078-00000012-000050df-f82add33d30ca9a003c007e473597cf3`. No migrations ran; all sixteen are already applied. Users/Workspaces/Collections/Items/Floor plans/Concept-image rows/Visual runs stayed **1/1/2/1/1/3/2**. `quick_check=ok`; no foreign-key violations. Counts include retained image tombstones.
- Validation: prior full 214-test quality gate, fresh preview build and frozen-config dry-run pass. Live release smoke and nine public checks pass, including exact JS/CSS hashes and private access boundaries. The signed-in browser loaded the new client asset and both existing Base/Reference images decoded at 3024×4032. This verifies authenticated media reads, not a ChatGPT image transfer or generation/import round trip.
- Private evidence: `/tmp/wantkit-visual-refresh-release/`, including `manifest.json`, `source-files.json`, `version-before.json`, `version-after.json`, `integrity-before.json`, `integrity-after.json`, `deploy.log`, `smoke.log`, `public-checks.json` and `release-result.json`. Do not commit logs/private configs. Source remains unstaged/uncommitted at detached HEAD `5673dd6`.

Next: retry the user’s ChatGPT photo-edit flow with a fresh approval. Do not replay the expired runs. Source/byte visibility, generation and generated-file import must each succeed before claiming the full round trip. See [HANDOFF.md](./HANDOFF.md) and [VISUAL_WORKFLOW.md](./VISUAL_WORKFLOW.md).

## Private ChatGPT image preview — 2026-09-07 (deployed)

The user approved migration 0015 and deployment of the exact frozen uncommitted preview artifact, including an exception to the clean/pushed `main` rule below. It deployed without rebuilding as **`01415659-d99d-4e5c-b169-78b757d835b6`**, at 100% preview traffic. Previous version: `ac5a87e9-e712-4a1c-a625-8b54bbfe4354`. Source HEAD remains `5673dd6` in a detached worktree; no staging, commit or push ran.

- Frozen config: `/tmp/wantkit-visual-preview-prep/artifact/worker/wrangler.json`; Worker modules/assets and migration SQL remain under that private artifact directory. Manifest SHA-256: `4dcc80a972268e234e378c60eb5c63695e3295afeb2d9e044912491f3389c976`. All 28 artifact hashes and 223 non-documentation source hashes matched before release. Source snapshot SHA-256: `17d9f8728d09c3d9b3d3833fd57ea399ec1a3ac9ae20b26384ef058a7a3a7ee1`.
- D1 recovery bookmark before migration: `00000069-00000000-000050df-4f8b3a852db263080bdd94d0c59ede2f`. Only `0015_visual_runs.sql` was pending and applied; its SHA-256 is `ad21f30d4f0a250593afed0ea7298475415db30388c08abfcb00ccc2d5765ebb`. Sixteen migrations are now recorded with none pending. Users/Workspaces/Collections/Items/Floor plans stayed **1/1/2/1/1**; `visual_runs` is empty with all four indexes, `quick_check=ok` and no foreign-key violations.
- Live before/after version records confirm all twelve existing plain-text variables, six secret names, D1/R2/Images/Browser/Workflow bindings and compatibility settings are preserved. Both assistant/local-runner allowlists still contain the same sole owner. The only added runtime variable is `CHATGPT_VISUALS_ENABLED=true`. Checked-in defaults remain false; no secret values were read or changed.
- Validation: prior full 205-test gate, fresh preview build and exact-config dry-run passed before approval. Live release smoke and nine public checks pass: OAuth discovery/private registration, missing/invalid bearer rejection, bounded reconnect routing, session protection, exact frozen JS/CSS asset hashes, private floor-plan/Concept-image boundaries and anonymous rejection of all four image tool calls. The existing signed-in browser session reloads the Collection and saved floor-plan notes; its private 1×1 fixture decodes successfully. No new image or model call was created during release verification.
- The deployed artifact contains the four gated image tools and the enabled flag selects the locally verified 77-tool catalog. This conversation still exposes the cached 73-tool connector catalog; refreshed authenticated client discovery and generated-file support are **not yet live-verified**. Verify those in the next bounded ChatGPT image task.
- Release evidence: `/tmp/wantkit-visual-preview-release/` (private directory/files), including `bookmark-before.json`, `version-before.json`, `version-after.json`, `integrity-before.json`, `integrity-after.json`, `migration-apply.log`, `deploy.log`, `smoke.log`, `public-checks.json` and `manifest.json`. Do not commit private configs or evidence.

The previous Worker version can be restored while leaving the additive table intact; never drop the table or delete data as an automatic rollback. Migration 0015 must precede any deployment of this image-pilot source, even with its flag disabled, because existing media reads/quota checks consult the table.

Next ordered task, on explicit request: one direct ChatGPT image-read → built-in generation → generated-file import → private reload test with fictional non-person inputs. Do not claim that round trip from deployment, fixture tests or catalog registration. See [VISUAL_WORKFLOW.md](./VISUAL_WORKFLOW.md) for limits and acceptance. Production remains unchanged.


This runbook covers the Cloudflare Worker, static assets, D1 migrations, private Concept-media R2 storage, Cloudflare Images, the research Workflow, Browser Run, smoke verification, code rollback, and D1 recovery. Run commands from the repository root unless a step says otherwise.

Cloudflare Worker versions do not include D1 state. A Worker rollback changes code and bindings only, while D1 Time Travel overwrites the database in place. Treat them as separate recovery controls.

## 2026-09-07 private floor plans — preview deployed

The user pushed `d065bd3` and approved the prepared preview release after refreshing Cloudflare login. Migration `0014_floor_plans.sql` applied successfully and the exact reviewed artifact deployed as **`ac5a87e9-e712-4a1c-a625-8b54bbfe4354`**. Previous version: `c8bbf5a1-771a-45b3-b643-535fe76851af`. No rebuild ran between artifact verification and deployment.

Pre-migration recovery bookmark: `0000005b-00000000-000050df-f8275c4e127bd5bcdceca28ca8363f5e`. Preview now has fifteen migrations. User/Workspace/Collection/Item counts stayed 1/1/2/1; the new floor_plans table was empty and foreign-key checks passed. The initial six-term aggregate query hit D1's compound SELECT limit; the split read-only check succeeded. Existing R2/Images/D1/Workflow/Browser bindings, runtime settings, sole-owner MCP/local-Codex allowlists and six secret names matched before and after. No credentials or secret values changed.

The 191-test implementation gate and fresh preview build/dry-run passed before release. Live release smoke plus seven public checks passed, including exact JS/CSS asset hashes and anonymous floor-plan access rejection. Evidence is private under `/tmp/wantkit-floor-preview-release/`; manifest SHA-256 is `8f7d4050ea4d8cca14bcc02e28aebcdae51057b6981ee9aa5de81647aaea90e1`. After the user signed into the Codex browser, the synthetic **Preview upload check 2026-09-07** was uploaded into **Connector check ChatGPT 2026-09-06**. PNG-to-WebP normalization, private thumbnail loading, note editing and persistence after reload passed. The single test plan remains for ChatGPT verification. Live PDF upload, deletion and ChatGPT floor-plan calls have not run. Do not conflate local integration coverage with live-client verification.

Production is unchanged and requires separate approval. The released server exposes 73 MCP tools after client refresh. This release sends saved plan labels/notes only; drawing interpretation and image generation remain deferred. Details and additive rollback boundary: [FLOOR_PLANS.md](./FLOOR_PLANS.md). Current next step: [HANDOFF.md](./HANDOFF.md).

## Environments

| Environment | Worker | D1 database | private R2 bucket | Workflow | Application origin |
| --- | --- | --- | --- | --- | --- |
| Preview | `kharidyar-preview` | `kharidyar-preview` | `kharidyar-concept-media-preview` | `kharidyar-research-preview` | `https://kharidyar-preview.formahsa.workers.dev` |
| Production | `kharidyar` | `kharidyar-production` | `kharidyar-concept-media-production` | `kharidyar-research` | `https://wantkit.todoless.dev` |

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
   bun run release:smoke -- https://wantkit.todoless.dev
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
