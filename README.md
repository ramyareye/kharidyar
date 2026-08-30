# Kharidyar

Kharidyar is a private, collaborative purchase-planning application. The repository currently contains the original React + Vite + Hono + Cloudflare Workers scaffold, reorganized as a Bun workspace.

The approved product specification, domain model, architecture, and roadmap are in [`PROJECT.md`](./PROJECT.md). Repository workflow and approval rules are in [`AGENTS.md`](./AGENTS.md).

## Workspace layout

```text
apps/
  web/          React SPA and Hono Worker
packages/
  contracts/    Runtime-independent API contracts
  domain/       Runtime-independent domain rules and types
```

The web app keeps its Cloudflare and Vite configuration in `apps/web`. Future packages and applications are created only when a roadmap task gives them a real consumer.

## Setup

Use the Bun version declared by the root `packageManager` field:

```bash
bun install
```

Start the existing web scaffold from the workspace root:

```bash
bun run dev
```

The default local URL is `http://localhost:5173`.

## Quality commands

Run these from the workspace root:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run check` runs all quality gates and a Wrangler dry run. The Worker tests execute in Cloudflare's Vitest integration, apply the D1 migrations to an isolated local database, protect the existing `GET /api/` response, and exercise database constraints.

## Database workflow

The D1 binding, Drizzle schema, Better Auth schema, migrations, and seed live in `apps/web`. Run database commands from the workspace root:

```bash
bun run db:check
bun run db:generate
bun run db:migrate:local
bun run db:migrations:list:local
bun run db:seed:local
```

`bun run db:generate` first regenerates Better Auth's Drizzle tables and then creates a reviewable SQL migration for all schema changes. Do not edit `apps/web/src/db/schema/auth.ts` or generated migration metadata by hand. Review the generated SQL before applying or committing it.

`bun run db:migrate:local` is safe to rerun; already-applied migrations are a no-op. `bun run db:seed:local` loads fixed, idempotent development data into the local database only. It includes an Item that needs four chairs and a Candidate plan that buys two, preserving the distinction between need units and Offer units.

Preview and production use distinct D1 resources. Configure the Cloudflare account/resources for those environments before the first remote migration or deployment; the commands above never mutate a remote database. After changing any binding, regenerate Worker types with `bun run cf-typegen`.

## Cloudflare commands

```bash
bun run cf-typegen
bun run deploy
```

Run `bun run cf-typegen` after changing Worker bindings. Deployment requires the appropriate Cloudflare account and secrets; Task 2 does not create or mutate remote Cloudflare resources.
