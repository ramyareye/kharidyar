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
  i18n/         Persian/English catalogs and locale formatting
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

Preview and production require the same six secrets:

```text
AUTH_TRUSTED_ORIGINS
BETTER_AUTH_SECRET
BETTER_AUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
TAVILY_API_KEY
```

Set each value interactively from `apps/web`; use the matching Wrangler environment:

```bash
bunx wrangler secret put <NAME> --env preview
bunx wrangler secret put <NAME> --env production
```

Production origins must use HTTPS. Better Auth then emits secure cookies. Authentication rate limits persist in D1 and use Cloudflare's edge-controlled `CF-Connecting-IP` header rather than a caller-supplied address.

Every API response receives a server-generated request ID, defensive browser headers, and `no-store` caching unless a route explicitly declares a safe public cache policy. Static assets receive a compatible Content Security Policy and browser headers through `public/_headers`. Immutable Context Snapshot creation is limited to ten attempts per actor and Collection per hour to bound accidental or abusive storage growth.

`TAVILY_API_KEY` enables live provider research. The initial adapter deliberately uses Tavily Basic search with no generated answer, raw page content, or images and returns at most five results per run. The non-secret `RESEARCH_BROWSER_ALLOWED_ORIGIN` is configured in `wrangler.json`; keep it equal to the exact first-party application origin. Browser Run extraction is limited to the app's controlled `/api/research-fixtures/products/<slug>` path until a retailer explicitly permits automated extraction.

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

`bun run check` runs all quality gates and a Wrangler dry run. The Worker tests execute in Cloudflare's Vitest integration, apply the D1 migrations to an isolated local database, protect the existing `GET /api/` response, exercise database constraints, and validate Google/session, scoped authorization, transactional invitations, typed Workspace/Collection/Item APIs, structured Collection Briefs, text Concepts, Item workflow permissions, Merchant-backed Product/Offer comparison, honest planned-cost rollups, immutable partial-purchase snapshots, Import Drafts, provider-research Workflows, and permission-filtered Context Snapshots without contacting Google, Tavily, retailer pages, or an AI provider. Runtime-independent tests also cover locale policy, RTL/LTR direction, formatting, palette rules, status-transition classification, Offer freshness and cost aggregation, research retention, and the web shell's critical-state resolvers.

## Core API

Authenticated Hono RPC routes expose Workspace, Collection, and Item create/read/update/archive/restore operations under `/api`. Collection-scoped routes also read/update the structured Brief and read/create/update/remove the optional text Concept. `GET /api/items/:itemId/workflow` returns the complete Item, capability-derived actions, and Decision Event history; `POST /api/items/:itemId/status` is the only ordinary status mutation path. Shared Zod contracts live in `packages/contracts`; server-generated IDs and database-derived parent relationships prevent clients from asserting ownership. Item lists support status/group filtering, archived-history inclusion, and bounded pagination.

Commerce routes expose Item-scoped Candidate comparison, canonical Product editing, Workspace-private Merchant creation, multiple Offers with append-only Price Checks, planned Candidate/Offer selection, Owner-only purchase snapshots, and Collection planned-cost rollups. Product, Merchant, Offer, Candidate, and purchase permissions are derived from database scope; caller-supplied parent identifiers never establish access.

Collection-only collaborators receive a minimal parent Workspace navigation summary. They remain unable to read Workspace details or access sibling Collections.

Collection Context routes create immutable, schema-versioned snapshots only after checking the actor's `export_context` capability. Snapshot reads and Markdown exports are creator-only and recheck current Collection access, so a revoked collaborator cannot retain access through an old snapshot URL. The Context Builder includes only records reachable from the requested Collection and deliberately excludes emails, credentials, session and invitation tokens, raw provider payloads, and image bytes.

## Web planning studio

Authenticated users can create, edit, archive, and restore Workspaces, Collections, and Items through the responsive web UI. Item planning includes notes, requirements, priority, quantity, optional group, optional EUR budget, and optional deadline; selection is reflected in the URL so refreshes reopen the same Workspace and Collection.

The Item detail dialog keeps full planning facts beside explicit status controls and newest-first human-authored history. Status never changes automatically. Editors can record non-purchase status decisions, while only Owners can mark an Item purchased under the current policy. Backward transitions remain possible but are warned before confirmation and labeled as reversals in history. Detail changes and status changes atomically append immutable Decision Events in D1.

The comparison dialog supports several Products per Item and several retailer Offers per Product. It keeps unit price, price kind, shipping amount/basis, availability qualifiers, source, freshness, and total distinct; users explicitly choose the Candidate, Offer, and purchase quantity used by the plan. Collection and group summaries include only those planned lines, retain lower-bound/incomplete states, list missing plans, and compare complete compatible totals with the Collection budget. Partial purchases create immutable exact-price snapshots and never automatically complete an Item.

The Live Research desk creates asynchronous Research Requests backed by a Cloudflare Workflow and the bounded Tavily adapter. It shows queued/running/partial/completed/failed/cancelled states, source links and retrieval times, and 30-day suggestion snapshots. Results stay advisory: dismiss/restore is reversible, while promotion requires explicit direct-Product-URL confirmation and creates ordinary Product, Candidate, Merchant, Offer, Price Check, and provenance records exactly once. Research can never plan a Candidate, decide an Item, or record a purchase. Manual automated Offer refresh is available only for the exact first-party Browser Run allowlist; all retailer Offers remain manually editable.

The AI Context dialog builds a private snapshot for the selected Collection and shows the complete Markdown before reuse. Users can copy or download it; building or exporting a snapshot does not call an AI provider. The exported header marks user-authored and external text as untrusted data, while the stored JSON preserves the exact machine-readable boundary for later audited AI operations.

Each Collection can show and edit its practical Brief, optional EUR budget, ordered core/supporting color preference, HTTPS reference links, and one optional text Concept alongside its Items. Palettes allow up to six colors per group, preserve user order, normalize hex values, and always pair swatches with text. Concept images, uploads, R2 storage, and AI visualization remain intentionally absent until their future roadmap tasks.

The UI detects Persian or English browser preferences, falls back to English, and persists an explicit language switch. The document `lang` and `dir`, numbers, dates, and EUR amounts follow the active locale. Layout styles use logical properties so the same interface mirrors naturally between RTL and LTR.

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

`bun run db:migrate:local` is safe to rerun; already-applied migrations are a no-op. `bun run db:seed:local` loads fixed, idempotent development data into the local database only. It includes an Item that needs four chairs, representative requirements and human decision history, a LISABO Candidate plan that buys two, an IKEA Netherlands Merchant, an Offer and Price Check, a scoped collaborator with Item/Candidate comments and one Candidate preference, an unapplied Import Draft, and a completed advisory Research Run. This preserves the distinction between need units, Offer units, research, discussion, and final decisions.

Preview and production use distinct D1 resources. Configure the Cloudflare account/resources for those environments before the first remote migration or deployment; the commands above never mutate a remote database. After changing any binding, regenerate Worker types with `bun run cf-typegen`.

## Cloudflare commands

```bash
bun run cf-typegen
bun run deploy
```

Run `bun run cf-typegen` after changing Worker bindings. Deployment requires the appropriate Cloudflare account, D1 resources, Workflow, Browser Run binding, and secrets. Apply the latest remote D1 migration and set `TAVILY_API_KEY` before deploying; ordinary local commands never mutate remote resources.

Cloudflare custom logs and source maps are enabled explicitly for local, preview, and production. Automatic invocation logs are disabled because OAuth callback URLs contain short-lived authorization codes. Application logs therefore use generated request IDs, resource identifiers, and safe reason codes without request query strings, cookies, tokens, provider messages, or private planning content.
