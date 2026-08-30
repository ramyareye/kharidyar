# Kharidyar

Kharidyar is a private, collaborative purchase-planning application. Its current web foundation is a React + Vite client backed by a Hono Cloudflare Worker, D1, Drizzle, and Better Auth in a Bun workspace.

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

Before starting the app, configure local authentication as described below and apply the local migrations. Then run:

```bash
bun run db:migrate:local
bun run dev
```

The default local URL is `http://localhost:5173`.

## Authentication setup

Copy the committed example to Better Auth's ignored local-secrets file:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Replace every placeholder in `.dev.vars`. Generate `BETTER_AUTH_SECRET` with a cryptographically secure generator; it must contain at least 32 characters. Keep `BETTER_AUTH_URL` and one entry in the comma-separated `AUTH_TRUSTED_ORIGINS` list equal to the exact application origin.

Create a Google OAuth client of type **Web application** and register this local redirect URI:

```text
http://localhost:5173/api/auth/callback/google
```

Register the equivalent HTTPS URI for each deployed environment: `<BETTER_AUTH_URL>/api/auth/callback/google`. Put its client ID and client secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never commit `.dev.vars`, paste a secret into source code, or expose the client secret to React.

Preview and production require the same five bindings:

```text
AUTH_TRUSTED_ORIGINS
BETTER_AUTH_SECRET
BETTER_AUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Set each value interactively from `apps/web`; use the matching Wrangler environment:

```bash
bunx wrangler secret put <NAME> --env preview
bunx wrangler secret put <NAME> --env production
```

Production origins must use HTTPS. Better Auth then emits secure cookies. Authentication rate limits persist in D1 and use Cloudflare's edge-controlled `CF-Connecting-IP` header rather than a caller-supplied address.

### Future Expo clients

The backend and identity model are compatible with a future Expo iOS/Android app. That task will add `@better-auth/expo`, Expo SecureStore, an app deep-link scheme/trusted origin, and native Google/Apple configuration. Better Auth can use browser OAuth or provider ID tokens on native clients while preserving the same internal User and separate provider Account records.

Apple remains disabled today. Enabling it later requires Apple Developer credentials, an HTTPS callback, the native bundle-ID audience, and explicit linking for an existing Google user. No Expo-only dependency or placeholder mobile app is included in the web MVP.

## Quality commands

Run these from the workspace root:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run check` runs all quality gates and a Wrangler dry run. The Worker tests execute in Cloudflare's Vitest integration, apply the D1 migrations to an isolated local database, protect the existing `GET /api/` response, exercise database constraints, and validate Google/session behavior without contacting Google.

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

Run `bun run cf-typegen` after changing Worker bindings. Deployment requires the appropriate Cloudflare account, D1 resources, and secrets; Tasks 1–3 do not create or mutate remote Cloudflare resources.
