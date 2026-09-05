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

1. Review and commit `PROJECT.md` and `RELEASE.md` through the repository's exact staged-tree approval gate; the production test confirmation is recorded.
2. Begin the selected OpenAI research-adapter task after resolving its cost and retention/privacy approvals. The product owner's remaining order is recorded in `PROJECT.md`: OpenAI research, AI Concept visualization, ChatGPT MCP, then web UI revamp; Expo is deferred. No future feature has started.

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
