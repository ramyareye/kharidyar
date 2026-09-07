# Private assistant actions

Implemented on 2026-09-06 on top of `5a921a5`; the user committed and pushed it as `9a65b41`. Deployed to the owner-only preview as `c8bbf5a1-771a-45b3-b643-535fe76851af` with migration 0013 applied. ChatGPT's new private **WantKit** plugin passed live add/edit, approval/decline and receipt replay checks on 2026-09-07 (Amsterdam). Old registrations remain read-only unless replaced with opt-in write credentials. Claude is deferred at the user's request. The local Codex runner remains a research runner; this extension uses the existing authenticated remote MCP endpoint. Production is unchanged.

**2026-09-07 local addition:** floor-plan metadata read/edit and approval-gated deletion are validated locally. They require migration 0014, an approved preview release and a ChatGPT tool refresh; the live connector still has the previously verified 70 tools. See [FLOOR_PLANS.md](./FLOOR_PLANS.md).

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
| Floor plans (local, unreleased) | Read labels/measurement notes; edit title/notes | Delete a plan and its current notes |
| Sharing | Read permitted membership/invitation details | Create/revoke invitation links; change/remove membership |

All operations retain existing account capabilities, ownership, collection boundaries, archived-resource rules and service validation. An OAuth write scope does not make a Viewer an Editor. Creating an invitation returns a link; it sends no email or message. Offers and price checks record supplied observations, not automatic verification. A purchase action is bookkeeping, never checkout or a transfer of money.

Read tools expose the data needed for edits: brief, concept, image metadata, item workflow/discussion, budget, permitted catalog choices, import drafts, membership details and receipts. Lists can include archived records. Inputs and outputs have explicit schemas and tool annotations; record text remains untrusted data. Photos and avatar URLs are not sent as image bytes.

## Enable write access

1. Preview prerequisite is complete: additive migration `0013_mcp_actions.sql` is applied, with a pre-migration recovery bookmark recorded. It adds one table and two indexes without altering planning tables.
2. Preview deployment is complete with the existing owner-only MCP/local-Codex settings preserved. Production remains disabled. Future releases need a fresh preview build and reviewed private overrides; a production quality-check build does not preserve them.
3. In WantKit → Settings → Connected assistants, create new credentials with **Allow routine additions and edits** enabled. Existing registrations and grants remain read-only by default.
4. In ChatGPT → Plugins → Create app, set the MCP endpoint to the preview `/api/mcp` URL and choose OAuth. In Advanced OAuth settings, use **User-Defined OAuth Client**, enter the new ID/secret, choose `client_secret_post`, keep `wantkit:read` and `wantkit:write` selected, and set base scopes to `offline_access`. The tested callback is `https://chatgpt.com/connector_platform_oauth_redirect`. Create, select **Sign in with WantKit**, and approve the fresh write consent promptly; signed consent URLs expire after ten minutes. Never paste a secret into chat. Select **Refresh** in plugin settings to load all 70 actions if the initial list is empty. The current ChatGPT UI does not offer credential editing on the old plugin; the replacement is named **WantKit**.
5. In a disposable Collection, ask ChatGPT to add and edit an Item, then archive it. The archive returns an approval link without changing the Item. ChatGPT may first show **External site** → **Open link**. In WantKit, review and approve or decline, then ask ChatGPT to check the receipt. Both decisions and exact replay passed in the live test. Claude needs its own verification when the user resumes that provider.

ChatGPT/Claude may still ask for their own tool confirmation. WantKit's policy cannot suppress provider UI prompts. No public directory listing or paid OpenAI API integration is added. Each person retains their own assistant account; this does not import chats or memories into WantKit or make cloud AI offline/free of all limits.

## Approval and retry behavior

Each action has an `operationId`, supplied by the assistant. Repeating identical inputs with that ID returns the original receipt, without another execution attempt. Reusing it for different inputs is a conflict. IDs are namespaced to the WantKit user and OAuth client; use the same client to check its receipt.

Sensitive changes are stored as pending requests. The approval link opens an authenticated WantKit page showing the action, target and arguments. Only the requesting WantKit account can decide it. The browser submits only approve/decline; the server loads the original stored arguments. An MCP bearer token or `confirmed: true` cannot approve it. The original client, login session and exact access-token record must still be active with write scope. The approval expires within ten minutes, or sooner if that token expires. Disconnecting, token refresh/revocation or logout can invalidate a pending approval; request a fresh action after reconnecting.

Before execution, the server rechecks permissions and compares the target snapshot with current records. Changed targets require a fresh request. This is a pre-execution check, not a database lock across concurrent edits. Existing services retain their own conditional writes and transactions; there is no new global transaction across authorization, D1, media and workflow operations. Routine edits use current service behavior and should start with reading current records.

The action claim is atomic. This guarantees at most one execution attempt per operation ID, not all-or-nothing rollback or exactly-once completion. A crash after mutation can leave a `running` receipt; after five minutes it is reported as `unknown`. A failed multi-step action may have applied some effects. Inspect current records and the receipt before any new request. Automatic retry with a new ID is unsafe.

Receipts are private to their original user/client and recheck resource access before returning saved details. Detailed arguments/results are hidden after 24 hours and lazily erased when that user creates another action; there is no scheduled deletion job. Metadata and idempotency hashes remain until account deletion, so old IDs cannot silently rerun. Detailed results are capped at 96,000 UTF-8 bytes; oversized successful results return a short notice and require a focused read. The MCP request body remains limited to 16 KiB, including import text.

## Manual or deferred steps

- Upload files in WantKit: the new floor-plan tab accepts images/PDFs after its release. MCP exposes saved labels/notes, not file bytes. Floor-plan interpretation and generation remain separate tasks.
- Starting/retrying source refresh, retrying an existing research request, creating a saved Context Snapshot and accepting invitation links remain app workflows. New research can be started with an explicitly chosen provider; local pairing/setup and runner startup remain on the user's computer.
- Assistant provider credentials, connector registration/disconnection, session/account controls and app sign-in remain in their official UI.
- WantKit's own chat interface, automatic access to ChatGPT/Claude memories, a local search index, paid OpenAI API and other provider adapters are not implemented by this extension.

This is broad planning coverage, not complete feature parity. The private floor-plan foundation is locally complete. The next separate product task is drawing interpretation and image generation.

## Verification

Full `bun run check` passed with 181 tests, including 33 OAuth/D1 MCP tests, plus lint, typecheck, migration metadata, production build and Wrangler dry-run. English/Persian sample approval, decline, write consent/setup, recovery and scroll checks passed. Backend tests use real OAuth/PKCE/consent and disposable D1 databases; sample screenshots use fictional records. The approved preview release passed its fresh build/dry-run, migration integrity checks, release smoke, OAuth/authentication/recovery checks and deployed asset hash comparison.

Subsequent live ChatGPT checks passed with the owner's subscription: write consent, 70-tool discovery, a disposable Collection/Item create, quantity edit/readback, pending archive, browser decline, denied replay, fresh browser approval, successful replay and receipt reads. Independent authenticated reads confirmed the archived Item's quantity and timestamps did not change on replay. No application changes or redeployment were needed. Claude read access worked, but its read-only grant rejected the test write; that provider is now deferred. No new research or paid API call ran. Evidence and current state: [HANDOFF.md](./HANDOFF.md).
