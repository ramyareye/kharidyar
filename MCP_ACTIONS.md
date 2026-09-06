# Private assistant actions

Implemented locally on 2026-09-06 on top of `5a921a5`. Not committed or deployed. The currently deployed ChatGPT/Claude connector remains read-only. The local Codex runner remains a research runner; this extension uses the existing authenticated remote MCP endpoint.

## What chat can do

| Area | Routine actions | Requires approval in WantKit |
| --- | --- | --- |
| Workspaces, Collections, Items | Create, edit, restore | Archive |
| Brief and Concept | Save complete text/brief | Remove Concept and its images |
| Candidates and catalog | Create/edit candidates, product details, merchants, offers, observed price checks; restore candidates | Archive candidates |
| Decisions and purchases | Change ordinary progress status | Choose/clear planned product or offer; enter/leave decided/purchased status; record a purchase already made |
| Discussion | Create/edit/resolve comments, set own candidate vote | Remove a comment |
| Research import | Create/read/correct/apply an Import Draft | Discard a draft |
| Research runs | Read saved findings, cancel a run, promote a finding, restore a dismissed finding | Start with an explicit provider; dismiss a finding |
| Existing Concept images | Read metadata, edit caption/cover, reorder references | Delete an image |
| Sharing | Read permitted membership/invitation details | Create/revoke invitation links; change/remove membership |

All operations retain existing account capabilities, ownership, collection boundaries, archived-resource rules and service validation. An OAuth write scope does not make a Viewer an Editor. Creating an invitation returns a link; it sends no email or message. Offers and price checks record supplied observations, not automatic verification. A purchase action is bookkeeping, never checkout or a transfer of money.

Read tools expose the data needed for edits: brief, concept, image metadata, item workflow/discussion, budget, permitted catalog choices, import drafts, membership details and receipts. Lists can include archived records. Inputs and outputs have explicit schemas and tool annotations; record text remains untrusted data. Photos and avatar URLs are not sent as image bytes.

## Enable after an approved preview release

1. Apply the additive `0013_mcp_actions.sql` migration to the intended preview after recording a D1 recovery bookmark. It adds one table and two indexes, and does not alter planning tables. It has only been exercised in disposable test databases during this task.
2. Build the preview anew and preserve the existing reviewed owner-only MCP/local-Codex flags. Production remains disabled. A production quality-check build does not preserve private preview overrides. Deploy only after explicit approval.
3. In WantKit → Settings → Connected assistants, create new credentials with **Allow routine additions and edits** enabled. Existing registrations and grants remain read-only by default.
4. Replace the client ID and secret in the assistant's connector settings, restart connection, and approve the new consent containing `wantkit:write`. Never paste a client secret into chat. Refresh the assistant's tool list if needed.
5. In a disposable Collection, ask the assistant to add and edit an Item, then archive it. The archive must return an approval link without changing the Item. Open the link yourself, check the details and approve or decline. Ask the assistant to check the receipt. Repeat independently in ChatGPT and Claude; local tests do not establish actual client UI behavior.

ChatGPT/Claude may still ask for their own tool confirmation. WantKit's policy cannot suppress provider UI prompts. No public directory listing or paid OpenAI API integration is added. Each person retains their own assistant account; this does not import chats or memories into WantKit or make cloud AI offline/free of all limits.

## Approval and retry behavior

Each action has an `operationId`, supplied by the assistant. Repeating identical inputs with that ID returns the original receipt, without another execution attempt. Reusing it for different inputs is a conflict. IDs are namespaced to the WantKit user and OAuth client; use the same client to check its receipt.

Sensitive changes are stored as pending requests. The approval link opens an authenticated WantKit page showing the action, target and arguments. Only the requesting WantKit account can decide it. The browser submits only approve/decline; the server loads the original stored arguments. An MCP bearer token or `confirmed: true` cannot approve it. The original client, login session and exact access-token record must still be active with write scope. The approval expires within ten minutes, or sooner if that token expires. Disconnecting, token refresh/revocation or logout can invalidate a pending approval; request a fresh action after reconnecting.

Before execution, the server rechecks permissions and compares the target snapshot with current records. Changed targets require a fresh request. This is a pre-execution check, not a database lock across concurrent edits. Existing services retain their own conditional writes and transactions; there is no new global transaction across authorization, D1, media and workflow operations. Routine edits use current service behavior and should start with reading current records.

The action claim is atomic. This guarantees at most one execution attempt per operation ID, not all-or-nothing rollback or exactly-once completion. A crash after mutation can leave a `running` receipt; after five minutes it is reported as `unknown`. A failed multi-step action may have applied some effects. Inspect current records and the receipt before any new request. Automatic retry with a new ID is unsafe.

Receipts are private to their original user/client and recheck resource access before returning saved details. Detailed arguments/results are hidden after 24 hours and lazily erased when that user creates another action; there is no scheduled deletion job. Metadata and idempotency hashes remain until account deletion, so old IDs cannot silently rerun. Detailed results are capped at 96,000 UTF-8 bytes; oversized successful results return a short notice and require a focused read. The MCP request body remains limited to 16 KiB, including import text.

## Manual or deferred steps

- File upload, floor-plan images/PDFs, and passing private image bytes to an assistant or generator. Existing images can be managed by metadata, but generation and floor-plan interpretation are separate tasks.
- Starting/retrying source refresh, retrying an existing research request, creating a saved Context Snapshot and accepting invitation links remain app workflows. New research can be started with an explicitly chosen provider; local pairing/setup and runner startup remain on the user's computer.
- Assistant provider credentials, connector registration/disconnection, session/account controls and app sign-in remain in their official UI.
- WantKit's own chat interface, automatic access to ChatGPT/Claude memories, a local search index, paid OpenAI API and other provider adapters are not implemented by this extension.

This is broad planning coverage, not complete feature parity. The next product task is private floor plans, after a separate request.

## Verification

Full `bun run check` passed with 181 tests, including 33 OAuth/D1 MCP tests, plus lint, typecheck, migration metadata, production build and Wrangler dry-run. English/Persian sample approval, decline, write consent/setup, recovery and scroll checks passed. Validation evidence and release state are recorded in [HANDOFF.md](./HANDOFF.md). Backend tests use real OAuth/PKCE/consent and disposable D1 databases. Browser screenshots use fictional records and mocked responses, not a live assistant account or live planning data. No provider calls, persistent migrations, commit, push or deployment were performed during this task.
