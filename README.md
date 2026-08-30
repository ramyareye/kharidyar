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

`bun run check` runs all quality gates and a Wrangler dry run. The baseline Worker test executes in Cloudflare's Vitest integration and protects the existing `GET /api/` response.

## Cloudflare commands

```bash
bun run cf-typegen
bun run deploy
```

Run `bun run cf-typegen` after changing Worker bindings. Deployment requires the appropriate Cloudflare account and secrets; no deployment is part of the monorepo-foundation task.
