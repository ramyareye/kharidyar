# Compact web UI and next tasks

Product-owner direction, 2026-09-06: a simple, compact SaaS application with familiar controls, readable text and an obvious path for older users. Tailwind/shadcn are visual references; the implementation reuses the existing React components and native controls without adding a component framework.

## UI implementation

- Neutral surfaces, green primary actions, a consistent sans-serif type scale and visible focus styles. Removed the decorative grid, large welcome block, oversized headings and tiny labels. Buttons and disclosure controls have a minimum 44 px height.
- Workspaces and Collections live in the sidebar. Workspace settings and secondary actions use labelled disclosures. Mobile navigation is collapsed behind “Workspaces & collections” and closes after selection, returning keyboard focus to the toggle.
- Account controls live in a bottom-of-sidebar Settings disclosure; the header keeps only the user's name beside the brand. The desktop shell fills the viewport with a scrollable main area and a separately scrollable navigation list, preserving the footer position. Mobile uses ordinary document scrolling. Global smooth scrolling is removed; dialog/menu focus return preserves scroll position, and Collection/view changes reset the desktop main area to the top.
- The Collection opens on Items. Brief & images and Budget are separate views. The item count, search field and group selector help users find the next action without scrolling past background material. Item names open their details; comparison stays visible, with editing, discussion and archive under More.
- Shared dialogs have a visible close button, readable inputs and consistent spacing. Existing forms, authorization, research provider selection, media behavior and server operations are retained. No AI write capability, floor-plan parser or generation provider was added during this UI task.

## Local review and validation

The running sample at `http://127.0.0.1:4174/output/playwright/ui-revamp/index.html` uses the real UI components with fictional, in-memory records. Changes to it do not affect a saved WantKit account. Its harness and screenshots are ignored under `output/playwright/ui-revamp/`; reload resets its records. It is not a deployed preview or backend integration test.

- Full `bun run check` passed: 161 tests, lint, typecheck, schema metadata, production build and deployment dry-run. Final mobile navigation changes received repeat lint/typecheck/localization and browser checks. Logs: `/tmp/wantkit-ui-revamp/`.
- Browser checks: desktop at 1440 px; English/Persian mobile at 390 px; Persian research dialog at 320 px. No horizontal overflow in checked views. The narrow dialog's client and scroll widths both measured 302 px.
- Sample create/edit, item search, group filter, view switching, empty Collection, mobile navigation closing, menu-to-dialog focus return, dialog close, decision view and local-Codex provider selection passed. No real provider call, account mutation, remote migration or deployment occurred. The final browser sequence reported no page errors; initial test-harness module setup errors were corrected before verification.
- Screenshots: `items-desktop.png`, `brief-desktop.png`, `budget-desktop.png`, `create-item-desktop.png`, `items-en-mobile.png`, `items-fa-mobile.png`, `research-fa-mobile.png`, `item-decision-desktop.png`.
- Settings/scroll follow-up passed build/typecheck, lint, five localization and 16 UI-state tests. Browser verification covered desktop and mobile dialog scroll preservation, language switching, the connector link target, a synthetic long sidebar and settings in a 400 px-high window. Screenshots: `settings-desktop.png`, `settings-fa-mobile.png`; `items-desktop.png` now shows the latest header. Earlier screenshots retain their capture-time header. No live sign-out or connection was attempted. The user subsequently committed/pushed this checkpoint as `5a921a5`. Only post-push documentation remains uncommitted; deployment requires a separate request.
- This is implementation and functional/visual verification, not usability testing with older participants. More complex comparison/collaboration states retain automated coverage but were not all manually exercised in this sample.

## Confirmed next-task order

Work on one task per session. No commit or deployment without the existing approval process.

1. **Finish UI review/release when requested.** The user committed/pushed the UI and local runner as `5a921a5`; the new UI remains undeployed. The quality gate regenerated production/default deployment artifacts; they do not contain the private preview owner override. A future approved preview deployment needs a fresh preview build and deliberate MCP/local-runner flag restoration.
2. **Chat actions through ChatGPT/Claude first.** The user ultimately wants both assistant chats and WantKit chat. The authenticated write/approval extension and friendly reconnect guidance are now implemented locally; the live preview remains read-only. Release and validate the two actual clients only after approval. Local Codex remains a bounded research runner. See [MCP_ACTIONS.md](./MCP_ACTIONS.md) for coverage and limitations. Keep the paid OpenAI API deferred.
3. **Private floor plans and room context.** Accept images/PDFs and measurements when available. Use them for room needs, product research and later generation.
4. **Image generation using room context.** Use permitted floor plans, room photos, preferences and selected products as explicit inputs. Record provider/input provenance and label generated pictures as illustrative. Select and validate a supported provider/account path before implementation.
5. **WantKit chat.** Reuse the same application tools and approval rules inside WantKit; validate a supported local connector path. An in-app chat box does not automatically inherit ChatGPT/Claude memories or browser-chat sessions.

## Chat action decisions

User answers: “Both, starting with ChatGPT/Claude” and “Apply routine adds/edits; confirm deletion, sharing and purchase decisions.”

The next connector task should map every existing app capability to an explicitly supported tool or a documented gap: Workspaces, Collections, briefs, Concepts/media, Items, Candidates, Products, Offers, research, discussion/votes, status decisions and access management. Do not describe the connector as supporting all features until that coverage is implemented and validated.

Routine explicitly requested additions/edits can apply directly with an intelligible result summary. Deletion, sharing/access changes, and final purchase/decision actions need a concrete confirmation. Reuse the signed-in user's capabilities on every operation; a connector must not gain more access than that user. Use bounded batches, idempotency, conflict handling and attributed change history. Confirmations must bind to the exact action and target, and tool output must distinguish success from partial failure. Do not rely solely on model wording to enforce approval rules.

Keep each person's assistant/Codex account separate. WantKit must not import account-wide assistant history/memories, collect provider credentials or silently fall back to a paid API. The assistant can use whatever personal context its own account makes available; that is separate from the app's connector permissions.

## Floor-plan decisions

User answer: “Images or PDFs, with measurements when available.” No drawing editor in the first version.

Proposed starting model for the next task: a private Workspace plan with optional room references attached to Collections. Collections remain general-purpose; do not assume every Collection is a room. Confirm this mapping when implementing if the user's actual files require something different.

Keep source pages and user-entered measurements. Extract proposed room labels, dimensions, doors/windows and uncertain observations for review; do not treat inferred dimensions as exact. Only confirmed constraints should exclude a product for fit. Suggested needs stay distinguishable from user-approved Items, with provenance back to the plan/page/room. Do not silently send a whole plan to a provider or trigger generation after upload.

For generation, a floor plan can supply layout context; a room photo can supply the current appearance. Plan-only images are illustrative proposals, not verified reconstructions. Provider sharing, private storage, deletion, cancellation and allowance/cost behavior need explicit implementation and tests in those later tasks.
