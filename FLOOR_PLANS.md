# Private floor plans

Implemented and validated on 2026-09-07, then pushed by the user as `d065bd3`. Approved preview release is now `ac5a87e9-e712-4a1c-a625-8b54bbfe4354` with migration 0014 applied. Public release checks and signed-in PNG upload/private image loading/note edit/reload checks pass. Live PDF upload, deletion and ChatGPT floor-plan verification remain pending. Production is unchanged. See [HANDOFF.md](./HANDOFF.md).

## User flow

Open a Collection → **Floor plans** → **Add floor plan**. Choose an image or PDF, give it a name, and optionally record measurements, room needs and constraints. Include units and identify estimates. Owners and Editors can upload, edit and delete; other permitted readers can open files. Archived Collections/Workspaces retain read access but cannot be changed. Deletion asks for confirmation.

Images accept JPG, PNG and WebP, verify decoded type/dimensions and normalize to non-animated WebP through the same helper used for Concept images. PDFs receive a bounded header/end-marker check only: they are opaque, untrusted originals, including metadata, served as authenticated attachments. They are not parsed, sanitized, embedded on the app origin or described as verified drawings. Replace a file by adding a new plan and deleting the old one; title/notes editing leaves the file unchanged.

Limits are 10 MiB per file, six plans per Collection and 100 MiB of floor plans per Workspace; image dimensions are at most 10,000 px per side and 40 million pixels. Floor-plan storage is counted separately from Concept-image storage. Upload attempts are limited to ten per actor/Collection per minute. Limits are shared contract constants.

## Assistant and research boundary

| Tool | Behavior |
| --- | --- |
| `read_floor_plans` | Returns permitted plan IDs, labels, saved notes, format and update time. |
| `update_floor_plan` | Applies a complete title/notes edit with current Editor/Owner permission. |
| `delete_floor_plan` | Creates a pending WantKit approval; changed targets, denial, revocation and replay follow existing action rules. |

The source now has 73 MCP tools. Refresh ChatGPT's private WantKit tool list for the new preview release. Existing read-only OAuth grants remain read-only. Files are uploaded through WantKit, never through MCP in this phase.

Current collection context and newly saved Context Snapshots contain plan labels and **user-entered notes**, not storage keys, download URLs, uploader identity or file bytes. The new field is optional for backward compatibility with existing version-1 snapshots. Markdown escapes stored text and labels measurements as user supplied. Treat all saved text as data, never assistant instructions. ChatGPT can use these notes when planning needs or composing a research request. Local runner and Tavily jobs still use the submitted query/constraints; this does not silently attach plans to those providers.

No drawing interpretation, OCR, automatic dimension extraction, image generation, private file-byte transfer, model call, paid API integration or import of assistant memories is implemented here. Those remain separate work. A missing measurement must be requested from the user, not inferred from an uploaded file's presence.

## Storage and deletion

`floor_plans` references its Collection and uploader and holds an opaque R2 key under `floor-plans/`. The existing environment-isolated private `CONCEPT_MEDIA` bucket and Images binding are reused; no public object URL or new binding is introduced. Download requests authenticate and recheck current Collection access after object I/O. Responses use private/no-store caching, nosniff, a sandbox CSP and PDF attachment disposition.

Uploads atomically reserve count/bytes in a pending D1 row before R2 writes, then recheck current permissions and archive state while marking the row ready. Failed uploads are tombstoned and cleaned up. Pending reservations older than one hour and failed object deletions are retried on an authorized list/upload visit, up to twenty deletions per visit. There is no scheduled cleanup job; unvisited collections can retain cleanup backlog. A rare conditional object-key collision is marked without deleting the pre-existing object.

Deletion first removes download/list access and clears current title/notes, then deletes R2 bytes. A storage failure cannot make a tombstoned file downloadable. D1 retains a minimal tombstone with identifiers, uploader, key, file properties and timestamps. Existing immutable Context Snapshots and previously delivered assistant context/receipts retain their copies under their existing retention rules. Deleting a plan cannot retract data already shared with a provider. Collection/uploader foreign keys restrict physical deletion until a future purge flow handles these rows; normal archive workflows are unchanged.

## Validation and release

Full `bun run check` passed: 191 tests (including nine new floor-plan Worker tests and one new OAuth/MCP flow), lint, typecheck, Drizzle consistency, production build and Wrangler deployment dry-run. Tests cover normalization, opaque PDF attachment bytes/headers, malformed uploads, authentication/role/parent/origin boundaries, archived/revoked access, concurrent count limits, file/workspace bytes, failed or abandoned uploads, revocation during I/O, delete failure/retry, text-only context and old-snapshot compatibility. MCP coverage exercises read-only grants, routine edits, changed-target rejection, denial, approved deletion and receipt replay. Drizzle generation reports no further schema changes. Existing runtime/auth, missing-secret and bundle-size warnings did not fail the gate.

Browser checks used actual components with fictional API responses at English 1440 px and Persian 390 px: PDF/image uploads, note editing, opening an image, declining/accepting deletion, error/reload recovery, focus return, reachable mobile controls and no horizontal overflow. Image controls were 44 px tall. Evidence is ignored under `output/playwright/ui-revamp/floor-plans-*`; it is not live ChatGPT verification.

On the signed-in preview, the synthetic **Preview upload check 2026-09-07** in **Connector check ChatGPT 2026-09-06** uploaded as PNG, normalized to WebP, loaded privately, and retained edited fictional measurement notes after reload. This single test plan remains for the ChatGPT check. No live PDF upload or deletion was attempted.

Preview deployment is complete as recorded above. For a future approved release:

1. Record preview recovery state and baseline data counts. Apply additive `0014_floor_plans.sql`, then check migrations, counts and foreign keys. It changes no existing table data.
2. Build for the intended environment and review its private connector settings. The current ignored artifact contains the reviewed preview settings; a normal build replaces them with source defaults. Never deploy without reviewing the generated config.
3. Deploy the reviewed artifact and verify disposable private uploads, access denial, notes and deletion. Refresh ChatGPT tools and test the three additions with disposable data.
4. Keep production unchanged until separately approved. A code rollback can leave this additive table intact; older code ignores it. Do not delete the table or R2 objects to roll code back. Retain records for the corrected forward release.

Implementation commit: `d065bd3` (`feat: add private floor plans and room context`). Release documentation commit: `docs: record floor-plan preview release`.
