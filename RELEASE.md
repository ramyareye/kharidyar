# Release runbook

This runbook covers the Cloudflare Worker, static assets, D1 migrations, the research Workflow, Browser Run, smoke verification, code rollback, and D1 recovery. Run commands from the repository root unless a step says otherwise.

Cloudflare Worker versions do not include D1 state. A Worker rollback changes code and bindings only, while D1 Time Travel overwrites the database in place. Treat them as separate recovery controls.

## Environments

| Environment | Worker | D1 database | Workflow | Application origin |
| --- | --- | --- | --- | --- |
| Preview | `kharidyar-preview` | `kharidyar-preview` | `kharidyar-research-preview` | `https://kharidyar-preview.formahsa.workers.dev` |
| Production | `kharidyar` | `kharidyar-production` | `kharidyar-research` | `https://kharidyar.formahsa.workers.dev` |

Local, preview, and production never share a D1 database or Workflow. `CLOUDFLARE_ENV` selects and flattens the requested Wrangler environment during the Vite build; the following deployment scripts then deploy that generated configuration.

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

4. Keep the D1 IDs, Workflow names, Browser Run binding, allowed research origin, and Worker names in `apps/web/wrangler.json`. Run `bun run cf-typegen` after changing a binding.

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

3. Confirm preview behavior manually for Google sign-in and one authenticated planning read. If the release changes research, also run one bounded provider request. Do not continue while a required preview secret or callback is missing.

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

7. Manually confirm Google sign-in, one authenticated planning read, and—when affected—one bounded provider request. Record the commit, new Worker version, previous Worker version, pre-migration D1 bookmark, operator, timestamp, and smoke result.

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
