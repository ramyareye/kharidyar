# Private MCP pilot

**2026-09-06 local extension:** write consent, 49 mutation tools, approval receipts, supporting reads and friendly reconnect recovery are implemented but not deployed. The live preview remains the read-only release below. See [MCP_ACTIONS.md](./MCP_ACTIONS.md) for enabling writes after approval, exact coverage and manual gaps.

Local implementation verified on 2026-09-05 and subsequently deployed to approved preview. **Preview is enabled only for the verified owner; production remains unchanged. The user confirmed a successful live ChatGPT Workspace read and subsequently reported Claude worked. After disconnect, Claude showed `invalid_client` / `client_id is required`; friendly recovery for this error is implemented locally, awaiting release. Complete live revocation coverage remains independently unverified.** No public directory listing is needed for this pilot. See [HANDOFF.md](./HANDOFF.md) for the approval boundary and remaining work.

## What this connects

Each person signs into their own ChatGPT or Claude through the provider's official interface and separately authorizes their own WantKit account. A private registration belongs to one WantKit user. Read tools use that user's current permissions, including any shared Collections they can access.

The assistant receives requested WantKit records. WantKit does not receive the person's assistant history or memories. The assistant may use personal context according to its own features and settings; this connector cannot guarantee it. Selected data is processed by that provider. Included subscription usage may avoid a separate model API bill, but eligibility, usage limits and hosting costs still apply.

The deployed read-only pilot reads saved records. It does not launch research or run Codex through MCP; the separately implemented local write extension can request research with explicit provider choice and approval. Neither is a general replacement for live web discovery. A local index can search saved material but cannot discover new web listings by itself. Findings can still be saved through the existing reviewable Import Draft workflow. Photos and automatic memory/history imports are excluded.

## Operator setup

Use preview first: `https://kharidyar-preview.formahsa.workers.dev`. Keep production disabled.

1. Confirm the intended accounts have private/custom MCP connector settings, including OAuth client ID and client secret fields. Check actual plan and organization restrictions before consuming allowance. If either client lacks this capability, record it as unsupported for that account; do not collect browser cookies or subscription tokens as a workaround.
2. Follow [RELEASE.md](./RELEASE.md) to record a preview D1 bookmark and apply reviewed migration `0011_flimsy_mojo.sql`. It adds seven OAuth tables and indexes; it does not rebuild or drop planning tables. The archived API draft's different migration `0011_openai_research.sql` must never be applied.
3. In preview configuration only, set `MCP_ENABLED` to `"true"` and `MCP_ALLOWED_USER_IDS` to the comma-separated IDs of approved WantKit users. Use the IDs from authenticated WantKit accounts, not assistant IDs or email addresses. Keep the allowlist out of committed configuration. Defaults in the checked-in root, preview and production configuration are `"false"` and `""`.
4. Keep `BETTER_AUTH_URL` set to the exact deployed origin with no trailing slash, and preserve the existing trusted-origin, Google login and authentication secret settings. No OpenAI or Anthropic API key is required. The existing application still requires its other configured secrets for its normal features.
5. Build and review the preview dry-run, then deploy only with approval. The endpoint is `<WantKit origin>/api/mcp`; OAuth issuer is `<WantKit origin>/api/auth`. `/.well-known/*` must reach the Worker. The transport is authenticated Streamable HTTP with stateless legacy-client compatibility. This is a reachable authenticated app endpoint, not a public agent/shell tunnel.

During implementation the migration was exercised only in isolated test databases. After explicit approval, it was applied to preview and the pilot was deployed; see the release record. Persistent local and production data were not migrated. A tunnel, if needed later, needs its own review and must preserve the configured OAuth origin and callback behavior.

## Connect your own assistant

1. Sign into WantKit and open **Connected assistants** (`/connectors`). Access is restricted to the pilot allowlist.
2. Open your assistant's private/custom connector setup. Copy its exact callback URL into WantKit, choose that assistant, then create credentials. Supported callbacks:

   | Assistant | Callback |
   | --- | --- |
   | ChatGPT | `https://chatgpt.com/connector_platform_oauth_redirect`, or the exact `https://chatgpt.com/connector/oauth/{callback_id}` shown in its setup |
   | Claude | `https://claude.ai/api/mcp/auth_callback` |

3. Copy the MCP server URL, OAuth client ID and revealed client secret into the assistant's connector authentication settings. Use OAuth authorization code authentication. Where selectable, token endpoint authentication is `client_secret_post`; PKCE must use S256. Never paste credentials into a chat. The secret is returned once, held only in page memory and removed when dismissed or the page closes. A lost secret requires disconnecting and creating a new registration.

   For Claude, open **Customize → Connectors → + → Add custom connector**. Name it “WantKit Preview,” enter the preview MCP URL, and supply the newly created Claude client ID and secret under **Advanced settings**. Click **Add**, then **Connect**. For Team/Enterprise accounts, an organization owner first adds the connector under **Organization settings → Connectors**. See the [current Claude setup instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

4. Start connecting from the assistant. Sign into the same WantKit account if prompted. Review the app's consent screen and allow `wantkit:read` plus renewal (`offline_access`). A different WantKit user cannot authorize someone else's registration.
5. Enable the private connector in the intended conversation. Start with: “List my WantKit Workspaces, then list Collections in the Workspace I choose.” Follow with a focused Item read. Confirm that the chosen Collection is appropriate to share before asking for its full text context.

No anonymous dynamic registration, client metadata URL registration, public publication, or assistant-side API key is used. Only the exact HTTPS callback registered for that client is accepted. Client availability and UI labels can change; use the official [ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), [ChatGPT OAuth guide](https://developers.openai.com/plugins/build/auth), and [Claude connector authentication guide](https://claude.com/docs/connectors/building/authentication). These documents were checked on 2026-09-05; the user confirmed ChatGPT and Claude reads. Independent live revocation coverage remains incomplete.

The 2026-09-06 write extension is now implemented locally. Create new credentials with write access and reauthorize after its separately approved preview release; existing read-only credentials are not silently upgraded. See [MCP_ACTIONS.md](./MCP_ACTIONS.md).

## Disconnect and expiry

- Consent links expire after ten minutes. If consent returns `invalid_signature`, the request may have expired or been altered. Return to the existing assistant connector, start Sign in again, and promptly approve the new WantKit consent page. Reloading the old URL does not renew it; no new registration or client secret is needed for an expired link.
- In WantKit, **Connected assistants → Disconnect** deletes the owned registration and associated credentials/grants. Subsequent tool calls fail immediately. Remove the connector in the assistant too. Existing plans and the WantKit web login remain intact.
- Access tokens expire after ten minutes. Refresh tokens rotate on use, with a seven-day expiry renewed at rotation. Every tool call checks that the original WantKit login session is still valid. Signing out or deleting that session stops its connector tokens; account removal from the pilot or loss of Collection access also takes effect on subsequent calls.
- Disconnect does not erase information already retained in assistant conversations. Use the provider's own controls for that data.
- Setting `MCP_ENABLED=false` stops the MCP/OAuth endpoints. Removing a user from the allowlist stops token issuance and reads. While enabled, an authenticated removed user may still delete their own known registration through `DELETE /api/connectors/:clientId`; the disabled pilot screen does not offer new setup. Re-enabling the feature or re-adding the user may revive still-valid grants unless the registration was deleted. Use Disconnect for permanent revocation.
- Token validation is local to the provider's D1 storage, with hashed opaque access/refresh tokens and provider-encrypted client secrets. No credentials or record contents are intentionally logged. This pilot accepts bearer tokens in the Authorization header only; DPoP-bound tokens fail closed. Do not enable a client that requires DPoP without adding resource-side proof verification.

## Deployed read-only tool surface and limits

| Tools | Reads |
| --- | --- |
| `list_workspaces`, `read_workspace` | Accessible Workspace navigation; full Workspace reads require direct membership |
| `list_collections`, `read_collection` | Authorized Collections, preserving Collection-only membership boundaries |
| `list_items`, `read_item` | Item requirements, budget, quantity and status |
| `read_item_comparison` | Item Candidates and Offers, source links and observed dates; unrelated catalog records excluded |
| `read_research` | Saved research and sources, limited to the latest twenty requests; no live search |
| `read_collection_context` | Current text context with `export_context` permission; no stored snapshot created |
| `read_context_snapshot` | Existing snapshot created by this account, subject to current export access |

All ten tools have explicit input/output schemas and read-only annotations. Stored text and source content remain untrusted data. Avatar URLs are removed; Concept photo bytes are not included. Data responses are validated before sending and limited to 96,000 UTF-8 bytes before the MCP text/structured-content envelope. Oversized output returns an error without partial records. Lists default to ten records, cap at twenty-five, and accept offsets up to 10,000. Comparison/research services may read more data internally before returning a bounded page; this pilot is not a large-dataset performance claim.

Requests are limited to 16 KiB, sixty per user per minute and 120 per edge IP per minute. Registration is limited to five requests per minute and checks for fewer than five existing clients; this client-count check is not a transactional quota. Existing context-export limits also apply. Origin checks, strict input validation, token audience/scope checks and current service permissions are enforced independently of tool annotations. A provider sharing one egress IP may hit the IP limit sooner during larger use; reassess before expanding the pilot.

## Verification record

- Full `bun run check` passed: 140 tests (26 domain, 5 localization, 80 existing Worker, 13 MCP, 16 UI-state), lint, typecheck, Drizzle metadata checks, production build and deployment dry-run. Log: `/tmp/wantkit-mcp-check.log`.
- MCP tests exercise the actual local Worker/OAuth provider and isolated D1 tables: discovery, ten tool schemas, S256 code exchange, consent denial, code/refresh replay, token expiry/revocation, logout, removed pilot users, disconnect, audience/scope rejection, account/Collection isolation, lost access, context privacy, pagination, output/input bounds, Origin checks and rate limits. They do not call OpenAI, Anthropic or Google.
- Browser checks used fake session/connector responses: registration, hidden/revealed/dismissed secret, consent action/return, provider callback selection and disconnect. English desktop and Persian 390-pixel layouts were inspected. Screenshots are local and ignored under `output/playwright/mcp-*.png`. Browser checks do not prove live OAuth interoperability.
- Cloudflare's documented `unhandled_rejection_after_microtask_checkpoint` compatibility flag avoids premature rejection reports from correctly handled OAuth errors. See [compatibility flag documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#defer-unhandled-rejection-processing-to-after-microtask-checkpoint). The original compatibility date remains unchanged.
- Preview migration/deployment were approved and completed. ChatGPT Pro private setup used the displayed callback and `client_secret_post`. After browser control disconnected, the original consent expired and returned `invalid_signature`; synthetic checks confirmed correct fresh/expired signature handling. The user then restarted sign-in and confirmed ChatGPT successfully read Workspace “Test 1” through WantKit Preview. This is a user-reported live read, not an independently observed browser/tool trace or validation of every tool. The user subsequently reported Claude worked, followed by a missing-client error after disconnect. Complete live disconnect/revocation remains independently unverified. The existing approval covers remaining MCP live checks; new local-runner deployment/model calls need their own approval.

## Latest handoff — 2026-09-06

The MCP implementation was committed/pushed as `8baa32b`. ChatGPT and Claude success are user-reported. Disconnect deletes the registration; reconnect needs newly created WantKit credentials and an updated client configuration. The generic missing-client error screen should offer clear recovery guidance in a later MCP UX task; it was not changed by the local runner task. The separate [local Codex research runner](./LOCAL_CODEX.md) is now deployed to the owner-only preview and passed one live research call, cancellation, local-pairing revocation and English/Persian UI checks. These local-pairing checks do not independently verify MCP revocation.
