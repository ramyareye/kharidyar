# Kharidyar Project Specification

- Status: Approved by the product owner
- Last updated: 2026-08-30
- Implementation status: Tasks 1 through 3 complete and validated; Task 4 has not started

## Purpose of this document

This document is the product requirements document, domain reference, architecture proposal, and implementation roadmap for Kharidyar. It is intended to be reviewed by the product owner and by coding agents before feature implementation begins.

This document defines what to build and the reasoning behind the major boundaries. The repository configuration and source code remain authoritative for exact commands, package versions, and file locations. `AGENTS.md` remains authoritative for repository workflow and approval rules.

## Reviewer instructions

Review this document as a product architect, security reviewer, and implementation lead. Do not implement anything during the review. Return:

1. Approved decisions.
2. Decisions that should change, with a concrete alternative and rationale.
3. Missing requirements or contradictions.
4. Security, privacy, data-model, and authorization risks.
5. Any task that is too large or ordered incorrectly.
6. A final recommendation: approve, approve with changes, or revise before implementation.

Pay particular attention to:

- The boundaries between Item, Candidate, Product, Offer, and Research Result.
- Workspace-wide versus Collection-specific access.
- Invitation acceptance and account-linking security.
- Better Auth, Drizzle, and D1 schema/migration integration.
- The ability to add an Expo mobile client later without replacing the backend.
- The scope of the research MVP and the use of Cloudflare Browser Run, formerly named Browser Rendering.

## Decision status

### Confirmed product decisions

- The product is a private, collaborative shopping workspace rather than a public marketplace.
- A Workspace contains Collections; a Collection contains Items.
- Products and retailer Offers are distinct entities.
- Friends can receive Workspace-wide access or access to selected Collections.
- Authentication uses Google for the web MVP.
- Users have an internal identity; a Google account is a login provider, not the primary domain identity.
- The data model must support multiple login providers from the beginning.
- Sign in with Apple is deferred until the iOS application phase.
- The web application supports Persian and English, including RTL and LTR layouts.
- The backend runs on Cloudflare Workers with Hono and D1.
- The repository becomes a Bun monorepo that can later add an Expo application.
- AI may research and recommend, but may not mark an Item as decided or purchased without an explicit user action.
- A Collection may have one optional Concept: its visual and experiential direction. Concept is not another hierarchy level or a replacement for Collection.
- The collaborative MVP keeps Concept text-only. Private image upload, storage, and visualization are deferred to explicit future tasks.
- AI Concept visualization is image-to-image: the user supplies a base photo of a space or person, the original remains unchanged, and the system creates separate edited variants.
- For a future `person` base image, only its uploader may request transmission to an AI image provider, with a fresh explicit confirmation for each request. Ownership role alone does not grant that permission.
- EUR is required for the web MVP because planning purchases from Netherlands and other Euro-priced retailers is a current use case. IRR/toman display remains an open localization decision.
- Products are Workspace-private in the MVP. Cross-Workspace canonicalization or sharing is deferred until a concrete need justifies its privacy and merge complexity.

### Proposed implementation decisions requiring review

- Drizzle is the single schema source for both application tables and Better Auth tables.
- Better Auth uses its Drizzle adapter, while Wrangler applies generated SQL migrations to D1.
- Better Auth implicit account linking is disabled; additional providers are linked explicitly from account settings.
- Invitation tokens are authoritative, single-use, expiring, and stored only as hashes. An invited email is an optional additional restriction.
- The invitation UI defaults to a verified-email restriction when an email is supplied, but the inviter may deliberately create an unrestricted bearer-link invitation.
- Permission evaluation is capability-based. Roles are named bundles of capabilities rather than scattered role comparisons.
- Only a Workspace-scoped Owner may grant or remove Owner access in the MVP. Collection-scoped Owners may administer non-Owner members in their Collection, but cannot create or remove another Owner.
- The `record_purchase` capability belongs only to Owners in the MVP. It may be added to another role bundle later without changing purchase records or membership storage.
- Workspace grants apply to every current and future Collection. Collection grants apply only to explicitly selected Collections.
- When multiple grants apply, capabilities are combined. The MVP has no explicit deny grants.
- Money is stored as integer minor units plus an ISO 4217 currency code.
- Long, multi-step research runs use Cloudflare Workflows. Queues are reserved for simple buffering or fan-out.
- The MVP creates invitation links for an owner to copy and share manually. Transactional email delivery is deferred until an approved provider and delivery task exist.
- Task 1 creates only `apps/web`, `packages/domain`, and `packages/contracts`. Shared API-client and i18n packages are created only when their first real consumers or catalogs exist.
- The initial Concept model permits one active Concept per Collection rather than multiple competing Concepts, nested Topics, or a free-form design canvas.
- When the future media task is approved, Concept images use private R2 objects with authorization metadata in D1. The bucket is not public, and an AI edit never overwrites the user-provided base image.
- Collection color preference is an ordered value inside the Brief: at most six core colors and six supporting colors, with no percentages, automatic matching, or separate authorization scope.
- An Item has a positive integer quantity needed, while a Candidate records the independently chosen number of Product/Offer units to plan. The MVP does not guess pack-to-need conversion, and actual purchase quantity is captured separately in Offer units.
- An optional free-text Item group label provides lightweight sections such as “Bedroom” and “Living room” without adding hierarchy, permissions, or nested Collections.
- Planned-cost rollups use an explicitly chosen Candidate and Offer. Starting prices, unknown shipping, and mixed currencies remain visibly non-exact rather than being silently treated as precise totals.
- Pasted research content creates a reviewable Import Draft. It never writes Products, Offers, or Items until an authorized human confirms the normalized records.

## Executive summary

Kharidyar helps an individual or small group plan purchases, research options, compare retailer offers, make decisions, and preserve the context behind those decisions.

A user creates a Workspace such as “Reza's Purchases.” Within it, the user creates Collections such as “New Home,” “Sport Wardrobe,” or “Monthly Shopping.” Each Collection has a brief describing its goals, budget, functional preferences, materials, colors, preferred brands, and things to avoid. A visually driven Collection may also have a text Concept such as “Japanese modern home” or “minimal sport style.” Private Concept images may be added in a later phase.

Collections contain Items: the needs the user is trying to satisfy, such as a bed, vacuum cleaner, running shoes, or dining table. Items may have a needed quantity and a lightweight display group such as “Bedroom.” Each Item may have Candidate Products. A Product is the canonical thing, while an Offer is a retailer-specific listing with price semantics, shipping, availability, source URL, and last-checked time.

Users can invite friends to an entire Workspace or selected Collections with an appropriate role. Friends can view, comment, vote, contribute candidates and offers, edit Collection content, or manage settings depending on their capabilities.

Later, a research system can search for products, extract data from known pages, retain sources, and suggest candidates. An access-filtered Context Builder will make relevant Workspace, Collection, and Concept state available to AI. A separate visualizer may edit a user-provided photo using the Concept and explicitly selected Candidates. Human confirmation remains required for decisions, purchases, and adoption of generated imagery.

## Problem statement

Purchase planning is fragmented across browser tabs, notes, spreadsheets, chat messages, screenshots, retailer wish lists, and memory. Those tools fail to preserve several kinds of context together:

- What the user actually needs.
- The style, functional, budget, and timing constraints.
- The overall visual direction—and, in a later media phase, reference imagery—that should keep individual choices coherent.
- Which products were considered and why.
- The difference between a product and a retailer's current offer.
- Friends' comments and votes.
- The sources and freshness of researched information.
- The final decision and what was purchased.

Generic shopping lists are too shallow, price-comparison services do not model a user's wider Collection context, and chat-based research loses structured state over time.

## Product goals

1. Give users a durable, structured home for purchase planning.
2. Make Collection context reusable across many Items and research requests.
3. Make collaboration understandable and safe at Workspace and Collection scope.
4. Separate product identity from seller-specific pricing and availability.
5. Preserve research provenance and data freshness.
6. Support Persian and English users equally.
7. Keep the backend and domain model reusable by a future Expo mobile application.
8. Introduce AI only where deterministic permissions, data, and human-control boundaries already exist.
9. Preserve an optional visual Concept that can guide choices without turning the product into a professional design tool.

## Success outcomes

The collaborative web MVP is successful when a new user can:

1. Sign in with Google.
2. Create a Workspace and Collection.
3. Describe the Collection's goals and preferences.
4. Optionally define one text Concept that guides the Collection's visual direction.
5. Add and optionally group an Item with quantity, budget, priority, status, and requirements.
6. Add multiple Candidate Products and retailer Offers.
7. Choose a planned Candidate and Offer, then compare quantity-aware planned costs and supporting information against the Collection budget.
8. Invite a friend to the Workspace or selected Collections.
9. Confirm that the friend can perform only authorized actions.
10. Collect comments and votes.
11. Explicitly decide, purchase, or skip the Item.

The assisted-research MVP is successful when a user can submit a constrained research request, review sourced results with freshness information, promote a result to a Candidate, and refresh an Offer without granting the system authority to make the final decision.

## Non-goals for the initial product

- A public product catalog or social network.
- A complete Torob-like merchant aggregation platform.
- Automated purchasing or checkout.
- Autonomous decisions on behalf of users.
- Merchant crawling at broad internet scale.
- Scheduled price tracking in the first collaborative MVP.
- Native iOS or Android applications in the first implementation phase.
- Sign in with Apple before the mobile phase.
- Public image buckets or unauthenticated access to user images in any phase.
- Multiple competing Concept variants, a node-based moodboard canvas, or professional interior/fashion design tooling in the collaborative MVP.
- Concept image upload or storage in the first collaborative MVP; private media is a separate future task.
- AI image generation from text alone; future Concept visualization requires a user-provided base image.
- AI image editing in the first collaborative MVP; visualization is a separate future task after private media and permission-filtered context are ready.
- Weighted color ratios, automatic palette extraction, automatic recoloring, or hard rejection of Products based on palette similarity.
- Fractional or measurement-based quantities, automatic product-pack conversion, and full retailer variant matrices in the collaborative MVP.
- Cross-merchant cart optimization or automatic consolidation of shipping charges across several Offers.
- Enterprise SSO, SCIM, billing, subscriptions, or public organization administration.
- Offline-first synchronization.
- Real-time collaborative document editing.

## Personas

### Workspace owner

The person organizing purchases. They create Workspaces and Collections, define the context, invite collaborators, control access, and make or confirm final decisions.

### Collaborator

A friend, partner, family member, or adviser invited to all or part of a Workspace. Their allowed actions depend on the role granted at each scope.

### Research requester

A member who has permission to create or edit shopping content and asks the system to find products satisfying an Item's constraints.

### Reviewer

A member who primarily examines candidates, sources, prices, comments, and votes before the owner makes a decision.

## User stories

1. As a new user, I want to sign in with Google so that I can access a private Workspace without creating another password.
2. As a returning user, I want my session restored securely so that I can continue my work.
3. As a user with several external identities, I want them linked to one internal user so that my Workspace data is not split across accounts.
4. As a user, I want provider linking to require an explicit action so that accounts are not merged solely because email addresses match.
5. As a user, I want to see pending invitations after signing in so that I can accept access sent to me earlier.
6. As an invitee, I want an invitation link to return me to the intended scope after authentication so that I do not lose context.
7. As a Workspace owner, I want to create multiple Workspaces so that unrelated purchase contexts stay separate.
8. As a Workspace owner, I want to rename or archive a Workspace so that it reflects its current purpose.
9. As a Workspace owner, I want to create Collections so that purchases can be grouped by project or theme.
10. As a Collection editor, I want to define a Collection brief so that all Items and research share the same context.
11. As a Collection editor, I want to define keywords, colors, materials, brands, constraints, and things to avoid so that recommendations remain coherent.
12. As a Collection member, I want to view the brief beside Items so that I understand the decision context.
13. As a contributor, I want to add an Item so that a new purchase need can be tracked.
14. As a contributor, I want to describe requirements and preferred attributes so that candidates can be evaluated consistently.
15. As a contributor, I want to set budget, deadline, and priority so that planning reflects urgency and constraints.
16. As a contributor, I want to move an Item through idea, researching, comparing, decided, purchased, or skipped states so that progress is visible.
17. As a user, I want decisions and purchases to require explicit human action so that automation cannot silently finalize an Item.
18. As a contributor, I want to add a Product as a Candidate for an Item so that it can be compared with alternatives.
19. As a contributor, I want one Product reusable across several Items or Collections so that canonical product information is not tied to one retailer.
20. As a contributor, I want to add several Offers for the same Product so that retailer prices and shipping can be compared.
21. As a reviewer, I want to see unit price and kind, shipping amount and basis, derived estimate status, qualified availability, seller, and last-checked time so that comparisons are honest.
22. As a reviewer, I want source URLs attached to Offers and research results so that I can verify claims.
23. As an editor, I want to mark stale or unavailable Offers without deleting their history so that past decisions remain understandable.
24. As a member, I want to comment on an Item or Candidate so that advice remains attached to the relevant decision.
25. As a commenter, I want to vote on Candidates so that preferences can be summarized.
26. As a member, I want to see who changed a decision or status so that collaboration is accountable.
27. As a Workspace owner, I want to invite someone to the entire Workspace so that they automatically receive access to current and future Collections.
28. As a Collection owner, I want to invite someone only to selected Collections so that unrelated purchases stay private.
29. As an inviter, I want to choose a role so that the invitee receives only the needed capabilities.
30. As an inviter, I want invitation tokens to expire and work once so that leaked links have limited value.
31. As an inviter, I want to restrict an invitation to a verified email when needed so that only the intended person can accept it.
32. As an owner, I want to revoke membership or an unaccepted invitation so that access can be withdrawn.
33. As a viewer, I want read-only access enforced by the API so that the UI cannot accidentally grant mutation rights.
34. As a member with overlapping grants, I want all legitimately granted capabilities to work so that Workspace and Collection membership combine predictably.
35. As a Persian-speaking user, I want a complete RTL interface so that the product feels native in Persian.
36. As an English-speaking user, I want a complete LTR interface so that I can use the same Workspace comfortably.
37. As a user, I want locale-aware currency and date display while retaining canonical stored values so that information is readable and unambiguous.
38. As a user on a phone browser, I want the full workflow to remain usable so that I can capture shopping information away from a desktop.
39. As a keyboard or assistive-technology user, I want accessible controls and focus behavior so that core tasks do not depend on a pointer.
40. As a research requester, I want to describe a product need in natural language so that the system can create a structured research request.
41. As a research requester, I want Collection and Item constraints included automatically so that I do not repeat existing context.
42. As a reviewer, I want each research result to show its source, extraction time, price, shipping, and reason for recommendation so that I can evaluate its reliability.
43. As a reviewer, I want research failures and partial results visible so that missing data is not presented as certainty.
44. As a contributor, I want to promote a research result into a Candidate so that researched information enters the normal decision workflow.
45. As a contributor, I want to refresh an Offer manually so that I can verify price and availability before deciding.
46. As a user, I want AI context limited to the Collections I can access so that private information never crosses authorization boundaries.
47. As a user, I want an exportable Markdown context snapshot so that I can inspect or reuse what the AI was allowed to see.
48. As a future mobile user, I want the same account, data, invitations, and permissions on mobile so that adopting the native app does not require migration.
49. As a future iOS user, I want to link Apple sign-in explicitly to my existing account so that hidden relay email addresses do not create duplicate identities.
50. As an operator, I want logs and identifiers for requests and research runs so that failures can be diagnosed without exposing secrets.
51. As a Collection editor, I want to define one optional Concept with a title and visual narrative so that separate purchases feel coherent.
52. As a future media user, I want to upload a private base photo of a space or person so that visualization starts from reality rather than an invented scene.
53. As a future media user, I want to keep already generated or inspirational images as Concept references so that the intended direction remains visible.
54. As a Collection member, I want to see the Concept while reviewing Items and Candidates so that I can judge fit beyond price and specifications.
55. As a future visualizer user, I want to choose which Candidates influence an AI edit of my base photo so that the result reflects my current shortlist.
56. As a future visualizer user, I want the original photo preserved and every AI edit labeled as a separate variant so that I can compare, reject, or adopt it safely.
57. As a contributor, I want to record how many units an Item needs and independently set how many Product/Offer units a Candidate plan would buy so that cost estimates remain meaningful even when packaging differs.
58. As a contributor, I want an optional Item group label such as “Bedroom” or “Living room” so that one Collection can retain a shared Concept while its Items remain organized.
59. As a planner, I want to choose the Candidate and Offer used for planning so that Collection totals do not guess which option I intend to buy.
60. As a planner, I want planned merchandise, shipping, uncertain prices, and budget variance shown honestly so that a lower bound is not presented as an exact total.
61. As a user, I want to paste a researched Markdown or JSON shopping list into a reviewable draft so that I can confirm mappings and warnings before it changes my Collection.
62. As a user buying in stages, I want several purchase events recorded against the chosen Product/Offer without automatically marking the Item complete so that “buy two now and two later” remains accurate.
63. As a Collection editor, I want up to six core colors and a separate supporting palette so that products stay visually coherent without making every choice the same color.

## Domain model

### Workspace

The top-level ownership, privacy, and collaboration boundary. A Workspace groups Collections and has members, settings, and at least one owner.

Examples: “Reza's Purchases,” “Family Purchases.”

Invariants:

- A Workspace must always retain at least one owner.
- A Workspace membership applies to every current and future Collection in that Workspace.
- Deleting a Workspace is destructive and must require explicit confirmation.

### Collection

A coherent purchase project inside a Workspace. It groups Items, owns a Collection Brief, and may own one Concept.

Examples: “New Home,” “Sport Wardrobe,” “Monthly Shopping.”

Invariants:

- A Collection belongs to exactly one Workspace.
- Collection-specific access does not grant access to sibling Collections.
- Archiving is preferred over deletion when related decisions or research exist.

### Collection Brief

Structured requirements describing what should guide Items, Candidates, and research within a Collection. The canonical technical term is `collection_brief`; “theme” is reserved for visual UI theming. The Brief is authoritative for practical constraints and selection criteria; it does not own generated imagery.

The brief may include:

- Title and description.
- Keywords.
- An optional ordered color preference with up to six core colors and up to six supporting colors.
- Materials.
- Preferred brands.
- Intended use or occasions.
- General requirements.
- Things to avoid.
- An optional overall budget and its currency.
- Reference URLs.

Color preference is a structured value inside the Collection Brief, not a separate resource or permission scope. Each entry has a normalized `#RRGGBB` value plus an optional user-entered label and short usage note such as “wall,” “wood,” or “accent.” The same normalized color appears at most once across both groups. The palette is advisory context for people and research; it does not automatically reject, select, or recolor a Product. An explicit Item color requirement takes precedence for that Item. Product colors observed from a source remain separate factual data.

### Concept

The optional visual and experiential direction for one Collection. Examples include “Japanese modern home with warm wood and quiet lines” and “minimal sport style in neutral colors.” The UI may label this surface “Concept / Moodboard,” but the canonical domain term is `concept`.

The collaborative-MVP Concept includes:

- Title and short narrative.

A future media extension may add subject kind (`space` or `person`), a current base image, ordered reference and edited images, and one selected cover image. Those fields and records are not created by Task 2 or Task 6A.

Invariants:

- A Collection has at most one active Concept in the initial product, and a Concept belongs to exactly one Collection.
- A Concept is optional; Collections such as routine grocery shopping remain valid without one.
- The Collection Brief remains authoritative for budget, requirements, color preference, materials, and things to avoid. Concept adds narrative—and, in the future, imagery—instead of duplicating those fields.
- Changes to Items, Candidates, or selected products never silently mutate the Concept.
- When future media is enabled, AI may propose an edited image, but only an authorized human may select it as the Concept cover or reference.
- The initial model has no nested Topics or side-by-side Concept variants. Future edited images are alternatives inside the single Concept.

### Future Concept Image

A private image asset attached to a Concept. Its role is `base`, `reference`, or `edited`. Concept Image records are introduced only by the future Concept media task, not by Task 2 or Task 6A.

Invariants:

- AI visual editing requires an active user-provided `base` image of the real space or person.
- The original base object is immutable. Replacing it creates a new base record and retains or deletes the old object according to the approved retention policy.
- Every edited image is a new object linked to its base or parent image and records its creator, provider, prompt/input snapshot, and creation time.
- An already generated image may be uploaded as a `reference`, but it does not replace the required real base image for image-to-image visualization.
- At most one base and one cover are active for a Concept at a time.
- Image bytes live in private object storage; D1 stores ownership, role, provenance, object key, media metadata, and lifecycle state.
- Generated edits are illustrative and must not be presented as exact evidence of fit, dimensions, color, material, or availability.

### Item

A need or decision slot inside a Collection. It describes what the user intends to obtain, not a specific seller listing.

Examples: “Dining table for four,” “Cordless vacuum,” “Running shoes.”

Core attributes:

- Title and description.
- Priority: `essential`, `soon`, or `nice_to_have`.
- Status: `idea`, `researching`, `comparing`, `decided`, `purchased`, or `skipped`.
- Optional budget and currency.
- Optional deadline.
- Quantity needed: a positive integer defaulting to `1`.
- Optional free-text group label for display and filtering, such as “Bedroom” or “Living room.”
- Requirements and preferred attributes.

Invariants:

- An Item belongs to exactly one Collection.
- Group labels do not create a resource, hierarchy, budget, or authorization scope. Renaming a label only changes presentation.
- Purchased quantities are derived from immutable purchase events and reported by Candidate/Offer. They are compared with Item quantity only when the units are semantically the same; the MVP never infers product-pack coverage.
- Recording a partial or complete purchase never silently changes Item status; an authorized human explicitly confirms when the need is fulfilled.
- `decided`, `purchased`, and `skipped` are set only by an authorized human action.
- Status changes are recorded in decision history.
- MVP status transitions remain flexible; the product warns about unusual reversals rather than silently blocking legitimate correction.

### Candidate

The association between an Item and a Product being considered for that Item. Candidate-specific notes, rank, decision state, planned purchase quantity, planned Offer, and provenance belong here rather than on Product.

Invariants:

- A Product may be a Candidate for many Items.
- The same Product appears at most once as an active Candidate for a given Item.
- Planned purchase quantity is a positive integer count of Product/Offer sale units. It defaults to the Item's quantity but may be set independently; the MVP does not infer how many Item need-units one pack satisfies.
- An Item has at most one planned Candidate for rollups, and that Candidate has at most one planned Offer. A planned Offer must belong to the Candidate's Product.
- Planning selection is reversible and is not the same as a final decision or purchase.
- Removing a Candidate does not delete the canonical Product or its Offers.

### Product

A retailer-independent representation of a model or identifiable product. It may include brand, model, title, category, attributes, identifiers, and canonical imagery.

Example: “Dyson V12 Detect Slim.”

Invariants:

- Product identity is independent of seller and current price.
- Duplicate products may exist during the MVP; merging is an explicit later operation.
- External identifiers are evidence for matching, not a substitute for the internal Product ID.

### Offer

A seller-specific listing for a Product. It includes seller, URL, unit price, price kind, currency, shipping estimate and basis, availability state and qualifier, locale, and freshness metadata.

Invariants:

- An Offer belongs to exactly one Product and one merchant identity.
- Unit price kind is `exact`, `starting_at`, or `unknown`. A starting price is a lower bound, never an exact price.
- `exact` and `starting_at` require a non-negative unit-price amount; `unknown` has no authoritative price amount.
- Product price and shipping are stored separately. Shipping basis is `per_line`, `per_unit`, or `unknown` so quantity does not accidentally multiply a flat charge.
- A known zero shipping amount is distinct from missing shipping. An unknown shipping amount or basis makes the derived total incomplete.
- Availability state is `available`, `unavailable`, or `unknown`, with optional channel, location, variant, and explanatory qualifiers. Branch-dependent availability is not treated as globally available.
- Planned merchandise subtotal is unit price multiplied by Candidate planned purchase quantity. Shipping is then added according to its basis.
- Cross-Offer or same-merchant shipping consolidation is not inferred in the MVP.
- A total with a starting price or unknown shipping is visibly labeled as a lower bound or incomplete estimate.
- Currency conversion is never implicit. Collection totals compare with a budget only when values share the budget currency or an approved conversion snapshot exists.
- Monetary values use integer minor units and an ISO 4217 currency code.
- `last_checked_at` is distinct from the record's ordinary update timestamp.
- Unavailable or stale Offers remain available to history unless explicitly purged under a retention policy.

### Price Check

An observed Offer state at a specific time. It preserves unit price, price kind, shipping amount and basis, availability state and qualifiers, and extraction or entry provenance.

### Comment

A member-authored discussion entry attached to a supported target such as an Item or Candidate. The MVP should avoid a single unconstrained polymorphic table unless referential integrity remains enforceable.

### Vote

A member's current preference for a Candidate. The MVP permits one active vote per user per Candidate. Historical vote changes may be represented in the audit stream rather than as active duplicates.

### Decision Event

An immutable record of meaningful human changes such as status, selected Candidate, a partial or complete purchase, or skip reason. A purchase event snapshots actual purchased quantity in Offer units, the Candidate and Offer, observed unit price and price kind, currency, shipping amount and basis, and the responsible Price Check or observation time so later Offer changes cannot rewrite purchase history. Several purchase events may accumulate against one Item.

### Membership

A grant connecting a user to a Workspace or Collection with a named role and its capabilities.

### Invitation

An expiring, revocable proposal for membership. Its raw token is shown only in the invitation URL. Only a cryptographic hash is stored.

Invariants:

- A token is single-use.
- Acceptance requires an authenticated user.
- An optional invited-email restriction compares against a verified, normalized email.
- The token identifies the invitation; email is an additional constraint rather than the invitation's primary identity.
- Acceptance is idempotent and cannot create duplicate memberships.
- Expired, revoked, or already-consumed invitations cannot grant access.

### Research Request

A user's structured request to discover products or offers. It belongs to a Collection and may optionally target an Item.

### Research Run

One execution attempt for a Research Request. It records status, timing, provider information, errors, and the actor who initiated it.

### Research Result

A sourced finding produced by a Research Run. It is not automatically a Product, Offer, or Candidate. Promotion into the shopping model is an explicit action.

### Research Source

Provenance for a research claim, including URL, title, retrieval time, provider, and extraction metadata.

### Import Draft

A staged interpretation of user-pasted Markdown or JSON research. It preserves the raw input, parser/provider and schema version, proposed Collection/Item/Product/Offer mappings, source links, unmapped facts, warnings, and apply status.

Invariants:

- Imported text is untrusted input and cannot directly mutate normal domain records.
- The draft distinguishes source values from inferred values, including inferred unit price from a supplied line total and quantity.
- Missing shipping is `unknown`, not zero; `from` prices remain `starting_at`; branch-dependent availability remains qualified rather than becoming a false boolean.
- A category, search, or filtered listing URL remains a Research Source and warning; it cannot silently become a direct Offer URL for a specific Product.
- Future or optional quantities such as “buy two now, perhaps two later” and alternate scenario totals remain qualified source facts until the reviewer chooses a current plan.
- Source-reported group and overall totals are retained as assertions for reconciliation; canonical rollups are derived from confirmed lines and flag rounding, exclusions, or disagreement rather than copying those totals.
- An authorized human reviews and confirms the draft before application.
- Applying a draft uses the same validated, authorized commands as manual entry, records provenance, is idempotent, and reports per-record failures without silently dropping source facts.

### AI Context Snapshot

An immutable, access-filtered representation of the information supplied to an AI operation. It supports auditing and optional Markdown export.

## Roles and capabilities

Roles are convenient bundles. Authorization code evaluates capabilities at a specific resource scope. In the MVP, `record_purchase` belongs only to the Owner bundle; changing that bundle later does not require a membership or purchase-record schema change.

### Viewer

- View permitted Workspace and Collection data.
- View the Collection Brief, text Concept, Items, Candidates, Products, Offers, research, comments, votes, and decision history.
- Export context limited to permitted data when export is enabled.

### Commenter

Includes Viewer capabilities, plus:

- Create and edit their own comments.
- Remove their own comments subject to retention policy.
- Create or update their own Candidate votes.

### Contributor

Includes Commenter capabilities, plus:

- Create Items.
- Edit non-destructive Item content.
- Add or edit Candidates, Products, and Offers.
- Create Research Requests and manually refresh permitted Offers.
- Promote Research Results into Candidates.

### Editor

Includes Contributor capabilities, plus:

- Edit all Collection content.
- Edit the Collection Brief.
- Create or edit the text Concept.
- Archive or restore Items and Candidates.
- Change non-purchase Item decision status through explicit human actions.
- Resolve or moderate comments and research results.

### Owner

Includes Editor capabilities, plus the relevant scope's administration:

- Edit settings.
- Invite, change, and remove non-Owner members within the Owner's scope.
- Revoke invitations.
- Record purchases through explicit human actions.
- Archive or delete the scope with confirmation.
- A Workspace-scoped Owner may transfer, grant, or remove Owner access while preserving at least one Workspace-scoped Owner.
- A Collection-scoped Owner cannot grant or remove Owner access in the MVP.

### Scope resolution

- A Workspace membership grants its capabilities throughout that Workspace.
- A Collection membership grants its capabilities only in that Collection.
- Applicable capability sets are combined when a user has more than one grant.
- The MVP has no explicit deny rule.
- A Workspace owner is effectively an owner of every Collection in the Workspace.
- A Collection owner cannot administer the parent Workspace or sibling Collections.
- The API enforces authorization independently of the UI.

## Core user flows

### First sign-in and Workspace creation

1. The user chooses Google sign-in.
2. Better Auth completes OAuth and creates or retrieves the internal user and linked Google account.
3. The application shows pending invitations and existing Workspaces.
4. If neither exists, the user creates a Workspace.
5. The creator becomes a Workspace owner.

### Invitation creation and delivery

1. An authorized owner chooses the Workspace or Collections, role, expiry, and optional verified-email restriction. When an email is supplied, the UI enables that restriction by default, but the owner may explicitly turn it off.
2. The server generates a cryptographically secure token with at least 256 bits of entropy, stores only its hash, and returns the raw token once inside the invitation URL.
3. The MVP displays a copy/share action and clearly explains any email restriction. It does not send transactional email.
4. The owner can inspect pending invitations and revoke them before acceptance.

### Invitation acceptance

1. The invitee opens an invitation URL containing the raw token.
2. The application resolves only the scope type and display name, inviter display name, requested role, and expiry before authentication. It never exposes member lists or scope content.
3. The invitee signs in if needed and returns to the invitation.
4. The server verifies token hash, expiry, revocation, consumption state, and optional email restriction.
5. One D1 `batch()` creates the intended Workspace membership or Collection memberships and marks the invitation consumed. Unique constraints and conditional writes are the idempotency backstop.
6. Repeating the successful request returns the existing result without duplicating access.

### Collection and Item planning

1. An authorized member creates a Collection.
2. An editor defines the Collection Brief, including optional core/supporting color preferences, and may add one text Concept.
3. A contributor creates an Item with constraints.
4. Members add Candidates and Offers manually or through promoted research results.
5. Members comment and vote.
6. An authorized member selects a Candidate; an Owner later records a purchase, while permitted non-purchase status changes remain available to Editors.

### Future Concept visualization

1. After the future media task is enabled, an authorized user uploads a real base photo whose subject kind is `space` or `person`.
2. The base image is stored privately and remains immutable.
3. For a `space` image, a user with the future visual-edit capability chooses the permitted Candidate/Product inputs and explicitly requests an edit. For a `person` image, only that image's uploader may do so, with a fresh provider-facing confirmation.
4. The server builds a permission-filtered input snapshot from the base image, Concept, Collection Brief, and chosen products, then sends it to the approved image-edit provider.
5. The result is stored as a new `edited` Concept Image with provider and input provenance. It never replaces the base image.
6. The UI labels the result as AI-edited and illustrative. An authorized human may reject it, keep it as a reference, or select it as the Concept cover.
7. Later Item or Candidate changes do not regenerate or replace any image until another explicit request.

### Research

1. A contributor starts from a Collection or Item.
2. The client captures a natural-language request and structured constraints.
3. The server stores a Research Request and starts a Research Run.
4. A Workflow performs dependent search, retrieval, extraction, normalization, and persistence steps.
5. The UI displays partial progress, failures, sources, and completed results.
6. A contributor promotes useful results into Products, Offers, and Candidates.

### Future account linking

1. A signed-in user opens account settings.
2. The user explicitly starts linking another provider.
3. Better Auth verifies provider ownership and attaches the provider account to the existing internal user.
4. The application never auto-merges users solely by email equality.
5. Conflicts require a controlled support or merge flow.

## Functional requirements

### Authentication and sessions

- The web MVP supports Google OAuth for consumer Gmail and Google Workspace accounts.
- Better Auth owns user, session, account, and verification records.
- The internal Better Auth user ID is the application's user identity.
- Authentication routes are mounted within Hono.
- Protected routes load the session once and expose typed user/session context.
- Secrets and OAuth credentials are server-only bindings or secrets.
- Production cookies are secure and use an appropriate same-site policy.
- Trusted origins are explicit per environment.
- Account linking supports multiple providers but disables implicit email-based linking.
- Database-backed sessions are the baseline. If measured D1 session reads become material, evaluate Better Auth's short-lived `session.cookieCache` before introducing secondary storage, while documenting revocation-latency and cookie-size tradeoffs.
- Sign in with Apple remains disabled until the mobile phase.

### Workspaces and Collections

- Users may create and belong to multiple Workspaces.
- Workspace and Collection listing is filtered entirely by authorization.
- Collections support active and archived states.
- Collection Brief data is structured and validated.
- A Collection Brief may define one overall budget and currency; planned rollups are derived rather than stored as editable totals.
- Each Collection may have zero or one active Concept.
- Destructive deletion requires explicit confirmation and checks dependent history.

### Concept and color preference

- The collaborative MVP Concept contains a title and short visual narrative only; it has no image upload, media record, or R2 dependency.
- The Collection Brief may contain ordered core and supporting palettes of at most six colors each.
- Each color has a valid normalized `#RRGGBB` value and may have a user label and usage note. The UI shows text with every swatch and never relies on color alone.
- Palette guidance is advisory. An explicit Item color requirement takes precedence, and sourced Product colors remain factual observations.
- Private base/reference images and AI-edited variants are introduced only by the future Concept media and visualization tasks.

### Items and decisions

- Item CRUD is limited by capabilities.
- Budget may be absent; when present it includes amount and currency.
- Quantity needed defaults to `1`, accepts positive integers, and remains explicitly editable with audit history; changing it never rewrites prior purchases. A Candidate may hold a different positive planned purchase quantity.
- An optional Item group label organizes one Collection without creating nested access or additional Collection semantics.
- Planning may nominate one Candidate and its Offer without marking the Item decided.
- Status, selected Candidate, purchased Offer, and decision notes are recorded through explicit commands that emit Decision Events.
- Purchased-to-date counts are derived per Candidate/Offer from purchase events. They are not presented as Item-need coverage when units differ, and recording units does not auto-complete the Item.
- Archived Items remain available to authorized history views.

### Products, Candidates, and Offers

- Products are reusable across Items and Collections.
- Candidate-specific annotations do not mutate canonical Product data.
- Offers expose unit price, price kind, shipping amount and basis, derived estimate status, availability, seller, source, and freshness.
- Offer price kind, shipping basis, and qualified availability preserve `starting_at`, flat/per-unit, unknown, branch, channel, and variant semantics rather than flattening qualified facts into exact global claims.
- A planned line shows merchandise subtotal (`unit price × planned purchase quantity`), shipping separately, and the derived estimate with exact/lower-bound/incomplete status.
- Group and Collection rollups include only explicitly planned Candidates and Offers, list unplanned Items separately, preserve uncertainty, and compare with the Collection budget only in a compatible currency.
- Before recording a purchase from a `starting_at` or stale Offer, the user confirms an exact observed unit price and actual Offer-unit quantity; the resulting Decision Event snapshots them.
- Planned and purchased quantities are displayed separately so staged purchasing remains understandable.
- Manual data entry records the responsible user as provenance.
- Research-derived data records its Research Source and Run.
- Price refresh creates a Price Check rather than overwriting all history.

### Collaboration

- Membership and invitation operations are owner-only at the relevant scope.
- The MVP invitation UI generates a link for the owner to copy and share. A restricted link states which verified email may accept it; there is no implied email delivery.
- Comments and votes honor role capabilities.
- The system displays member identity and timestamp for collaborative changes.
- Removal of membership takes effect on the next authorized request without relying on stale client state.

### Localization

- All product-owned UI text is translatable.
- Persian uses RTL document direction and RTL-aware component layouts.
- English uses LTR.
- User-entered content preserves its entered language and direction where practical.
- Dates, numbers, and currencies are formatted by locale while stored canonically.
- The application sets root `lang` and `dir` from the active locale on the first localized surface.
- Direction-sensitive layout uses CSS logical properties or equivalent framework utilities from the first UI component. Physical left/right spacing or alignment requires a genuinely physical design reason.
- Currency displays always label the unit. The IRR-versus-toman display and input policy in Open Decision 6 must be resolved before localized money UI is implemented; the UI never guesses omitted zeros.
- Missing translation keys fail visibly in development and fall back predictably in production.

### Research

- Research is asynchronous and never holds an HTTP request open for the complete run.
- Research Requests preserve both user text and normalized constraints.
- Research Runs have explicit queued, running, partial, completed, failed, and cancelled states.
- Results display confidence or caveats without presenting guesses as facts.
- Every external claim has source provenance when available.
- Browser automation is limited to known public pages and must not bypass access controls, CAPTCHAs, paywalls, or retailer restrictions.
- Provider adapters enforce timeouts, bounded retries, and rate limits.
- The initial product uses a single configurable search provider rather than a broad crawler.
- Manual refresh is implemented before scheduled monitoring.
- Pasted Markdown or JSON may be parsed into an Import Draft that exposes proposed groups, current/future quantity interpretations, Products, Offers, price kinds, shipping gaps, availability notes, source URLs, supplied summary totals, and unmapped facts.
- Import application requires a preview and explicit confirmation. Normal authorization, validation, duplicate handling, and provenance rules still apply.

### AI context

- The Context Builder starts from the authenticated user and requested scope.
- It includes only Workspaces and Collections the user can access.
- Context may contain the Collection Brief, core/supporting color preference, Concept narrative, budgets, essential Items, Candidates, Offers, decision history, comments, votes, purchases, and relevant research.
- Context output supports structured JSON for machines and Markdown for inspection/export.
- Snapshot records include actor, scope, creation time, and schema version.
- Raw secrets, session tokens, invitation tokens, and unrelated private data never enter context.
- When future Concept media exists, raw image bytes remain excluded from ordinary text context and Markdown export. They leave private storage only during an explicit, authorized visual-edit request or authorized image delivery.

## User experience requirements

### Information architecture

The web application needs these primary surfaces:

- Login and authentication callback states.
- Invitation preview and acceptance.
- Workspace switcher and dashboard.
- Collection overview, Collection Brief editor with accessible core/supporting color palettes, optional text Concept surface, grouped Items, and planned-total-versus-budget summary.
- Item list and Item detail.
- Candidate comparison and Offer detail.
- Research Request and Research Run detail.
- Research Import Draft preview with source-versus-inference labels, warnings, editable mappings, and explicit apply/discard actions.
- Member and invitation management.
- Account settings and future provider-linking surface.

### Visual direction

- Calm, minimal, warm, and functional.
- Japandi-inspired use of warm neutrals, natural surfaces, restrained borders, and clear hierarchy.
- Information density should support comparison without feeling like an enterprise admin dashboard.
- Visual styling must not compromise contrast, focus visibility, or data clarity.
- `collection_brief` means structured shopping requirements, `concept` means the user's visual direction, and visual light/dark mode uses separate UI-theme terminology.

### Responsive behavior

- Core flows work from a 360-pixel-wide viewport upward.
- Dense comparisons may become stacked cards or horizontally managed tables on narrow screens.
- Primary actions remain reachable without hover.
- Desktop layouts use available width for comparison and contextual side panels.

### Accessibility

- Target WCAG 2.2 AA for core flows.
- All interactive controls have accessible names.
- Keyboard order follows visual and logical order in RTL and LTR.
- Dialogs manage focus and can be dismissed appropriately.
- Status changes and asynchronous research progress are announced accessibly.
- Color is never the only carrier of status or preference.
- Reduced-motion preferences are respected.

### Required states

Every data surface defines loading, empty, partial, error, unauthorized, archived, and stale-data states where relevant. Optimistic UI may improve responsiveness only when server rejection restores a trustworthy state and explains the failure.

## Technical architecture

### Target repository shape

The repository becomes a Bun workspace with these logical modules:

- `apps/web`: React SPA, Hono Worker, Cloudflare configuration, and web-specific tests.
- `apps/mobile`: reserved for a future Expo application; it is not created as a functioning app during the web MVP unless needed to validate packaging.
- `packages/domain`: runtime-independent authorization, money, status, and decision logic.
- `packages/contracts`: Zod schemas and stable cross-client request/response concepts.
- `packages/api-client`: deferred until Expo or another real consumer needs a shared client; the web app initially constructs its small Hono RPC client locally.
- `packages/i18n`: created in Task 5B when the first Persian and English message keys exist.
- `packages/config`: shared TypeScript, lint, or build configuration only when duplication justifies it.

Task 1 creates only `apps/web`, `packages/domain`, and `packages/contracts`. `apps/mobile`, `packages/api-client`, `packages/i18n`, and `packages/config` remain target modules rather than empty directories until the task that first needs them. Runtime-independent packages must not import DOM APIs, React Web components, or Cloudflare bindings.

### Web frontend

- React 19 with TypeScript and Vite.
- React Router for client-side routes.
- Tailwind CSS and shadcn/ui for accessible primitives and consistent styling.
- A query/cache layer may be introduced when server-state behavior warrants it; selection is an implementation decision, not a product requirement.
- Better Auth React client for browser authentication.
- Hono RPC for type-safe application API calls.

### Worker API

- Hono runs inside the Cloudflare Worker produced by the official Vite plugin.
- API routes are grouped by domain and chained or mounted in a way that preserves Hono RPC inference.
- Zod validates untrusted request data at the API boundary.
- Authentication and authorization middleware are separate concerns.
- Handlers call domain/application services rather than embedding role rules and SQL throughout routes.
- Success and error responses have explicit typed contracts.
- Global error handling does not leak internal details.

### Database

- Cloudflare D1 is the relational database.
- Drizzle TypeScript schema is the source of truth.
- Better Auth's generated Drizzle schema is included in the same migration stream.
- Drizzle Kit generates versioned SQL.
- Wrangler applies migrations locally and remotely.
- The D1 binding config uses `migrations_pattern` when the generated layout is nested.
- Foreign keys and indexes enforce ownership and common authorization/query paths.
- Local, preview, and production resources are separated.
- Wrangler type generation runs after binding changes.

### Background work

- Synchronous HTTP handlers create jobs and return identifiers promptly.
- Cloudflare Workflows orchestrate multi-step research that needs durable progress and per-step retries.
- Cloudflare Queues are introduced only for simple fan-out, buffering, or independent single-step work.
- Research steps are idempotent and safe to retry.
- The database stores user-visible state; Workflow internal state does not become the only record of product history.

### Future private Concept media

- The collaborative MVP has no Concept blob upload, R2 binding, or Concept Image table. These are introduced together only by the future Concept media task.
- R2 stores future user-provided base/reference images and later AI-edited outputs behind the same private-media boundary.
- D1 stores authorization, ownership, role, provenance, lifecycle, and object-key metadata. R2 stores image bytes.
- The bucket remains private. Reads pass through an authenticated, resource-authorized Worker route or an equivalently short-lived single-object authorization.
- Upload authorization is issued only after Collection capability checks. A short-lived presigned upload, if selected during implementation, is restricted to one generated object key and expected media type and is treated as a bearer secret.
- Upload completion validates actual media type, size, dimensions, and ownership before the image becomes active. Current Cloudflare request-body, R2, and image-processing limits are rechecked during the future media task before choosing direct or presigned upload and a verified decode/EXIF-removal implementation.
- Unfinalized or failed uploads remain inaccessible and are removed by a documented cleanup policy.
- Base and edited images use separate immutable object keys. The application never performs an in-place overwrite of a user's original.
- Preview and production buckets are separate, and generated Worker types are refreshed after the R2 binding is added.

### Future mobile client

- Expo consumes the same Hono API and domain contracts.
- Native UI is separate from React Web UI.
- Better Auth Expo integration handles secure cookie/session storage and OAuth deep links.
- Invitation URLs support universal/app links and remain valid web URLs.
- Apple sign-in is added to the backend, mobile login, and web login together when the iOS phase begins.
- Existing users link Apple explicitly to their current internal user.

## Proposed data model

Exact columns may change during schema implementation, but the following records and relationships are required.

### Authentication records

- Users.
- Sessions.
- Provider accounts.
- Verifications.

These follow the active Better Auth schema rather than a hand-maintained approximation.

### Collaboration records

- Workspaces.
- Workspace memberships.
- Collections.
- Collection memberships.
- Invitations.
- Invitation-to-Collection selections.

Required constraints include:

- Unique Workspace membership per user and Workspace.
- Unique Collection membership per user and Collection.
- Unique invitation token hash.
- At most one successful consumption record per invitation.
- Indexed membership lookups by user and scope.

### Planning records

- Collection Briefs, either one-to-one records or versionable structured records.
- Concepts, one active record per Collection in the initial model.
- Items.
- Item Candidates.
- Products.
- Offers.
- Price Checks.
- Comments.
- Votes.
- Decision Events.

Required constraints include:

- Unique active Concept per Collection.
- At most six core and six supporting colors per Collection Brief, with valid normalized values and no duplicate color across the two groups.
- Item quantity and Candidate planned purchase quantity are positive integers; they are separate measures and no pack-coverage conversion is inferred.
- At most one planned Candidate per Item and one planned Offer per Candidate; the Offer belongs to the Candidate Product.
- Unique active Item/Product Candidate association.
- Unique active user vote per Candidate.
- Indexed Items by Collection and status.
- Indexed Offers by Product and freshness.
- Indexed decision history by Item and time.

Future planning records are added only by the task that first uses them, not by Task 2 or Task 6A:

- Concept Images are created by the future Concept media task with base/reference/edited role, R2 object key, uploader, ownership, media metadata, provenance, lifecycle state, and optional parent image.
- Concept Visual Edit Runs are created by the future AI Concept visualization task with the exact base image, selected Candidate/Product inputs, actor, provider, prompt/configuration snapshot, status, and output image.

Future media constraints include at most one active base image and selected cover per Concept, a unique private object key per Concept Image, and same-Concept base/parent references for edited images.

### Research records

- Research Requests.
- Research Runs.
- Research Results.
- Research Sources.
- Result-to-Source associations when one result depends on several sources.
- Import Drafts with raw input, parser/schema version, normalized proposal, warnings, status, actor, and application provenance.
- AI Context Snapshots.

Research records carry enough provenance to distinguish manual entry, provider search, browser extraction, and AI inference.

### Common storage conventions

- Internal IDs are opaque strings generated by the application or auth library.
- Times are stored canonically in UTC.
- Mutable records include creation and update times.
- Records that can be archived use an explicit archive time rather than overloading update time.
- Money uses minor integer units and currency.
- Arbitrary JSON is reserved for genuinely variable attributes; core authorization and query fields remain typed columns.
- User-facing deletion behavior is explicitly selected per entity: hard delete, archive, anonymize, or retain as audit history.

## API surface

The exact route naming is an implementation detail, but the typed API must expose these capabilities.

### Session and identity

- Get current session and user.
- Start and complete Better Auth flows.
- Sign out.
- List linked provider accounts.
- Link or unlink providers when enabled and safe.

### Workspaces

- List accessible Workspaces.
- Create, read, update, archive, and restore a Workspace.
- List and manage members and invitations.

### Collections

- List accessible Collections within a Workspace.
- Create, read, update, archive, and restore a Collection.
- Read and update the Collection Brief.
- Read, create, update, or remove the optional Concept.
- List and manage Collection-scoped members and invitations.

### Future Concept media and visualization

These endpoints do not exist in the collaborative MVP. The future tasks add them without changing the current Concept identity:

- Request an authorized upload target for a base or reference image and finalize validated upload metadata.
- Read an authorized Concept image without exposing its private object key as an access grant.
- Replace the active base, reorder references, select a cover, and delete or archive permitted images.
- Create a future visual-edit run from one active base image and an explicit set of permitted Candidate or Product inputs.
- Inspect run status and edited outputs, then explicitly keep, reject, or select an output as the cover.

### Items and decisions

- List and filter Items.
- Create, read, and update an Item.
- Set quantity needed and an optional group label.
- Archive and restore an Item.
- Choose or clear one planned Candidate and its planned purchase quantity.
- Record explicit status, selection, purchase, and skip commands.
- Read decision history.

### Candidates, Products, and Offers

- Add or remove a Product as an Item Candidate.
- Create or update canonical Product information.
- Create, update, and mark Offers stale or unavailable.
- Preserve exact/starting/unknown price kind, per-line/per-unit/unknown shipping basis, and qualified availability.
- Choose or clear the planned Offer for a Candidate.
- Read Candidate comparisons.
- Read group and Collection planned-cost rollups with budget variance and uncertainty labels.
- Record manual Price Checks or request permitted refreshes.

### Collaboration

- Create, edit, and remove permitted comments.
- Create, change, or remove the current user's vote.
- Read aggregate votes without hiding individual provenance from authorized members.

### Research and context

- Create and list Research Requests.
- Create an Import Draft from pasted Markdown or JSON, inspect/edit normalized proposals and warnings, and explicitly apply or discard it.
- Start, inspect, cancel, or retry permitted Research Runs.
- List Results and Sources.
- Promote a Result into the shopping model.
- Build and export an access-filtered context snapshot.

## Security and privacy requirements

- Every private API operation authenticates the request and authorizes the specific resource.
- Resource ownership is resolved from the database; client-provided Workspace or Collection IDs are never trusted as authorization proof.
- Cross-Workspace and cross-Collection ID substitution is covered by tests.
- Invitation raw tokens contain at least 256 bits of cryptographically secure entropy, are single-use, expiring and revocable, and are hashed at rest.
- Authentication, invitation preview and acceptance, and research creation receive rate limits appropriate to abuse risk from the task that introduces each endpoint.
- Pre-auth invitation preview treats the URL as a bearer secret and exposes only the explicitly approved metadata defined in the invitation flow.
- OAuth state, CSRF, cookie, trusted-origin, and callback protections use Better Auth's supported flow rather than custom shortcuts.
- Secrets remain in Cloudflare secrets or approved environment-specific secret storage.
- Logs exclude session cookies, provider tokens, invitation tokens, complete AI prompts containing private data, and unnecessary personal information.

The following controls become mandatory in the future task that introduces Concept media; they create no MVP upload endpoint or R2 dependency:

- Concept images are private and inherit Collection authorization. Public R2 access and stable unauthenticated object URLs remain disabled.
- Uploads use server-generated opaque object keys, strict byte and dimension limits, verified image decoding, approved media types, and removal of unnecessary EXIF metadata including location where practical.
- Image storage is bounded by a maximum image count per Concept and a maximum total media size per Workspace. The upload-authorization endpoint is rate-limited from the task that introduces it. Exact configurable limits are set from then-current platform limits and expected usage and may change without a schema migration.
- Presigned upload or download URLs, if used, are short-lived bearer secrets scoped to one object and operation and are never written to logs or durable client state.
- A user uploading a person's photo must confirm that they are the subject or have permission to use it. The image is never used for identity recognition or unrelated inference.
- Only the uploader of a `person` base image may request that image be sent to an AI provider; Owner or Editor status does not override this rule. The UI identifies the provider-facing operation and requires a fresh explicit confirmation for every request. A `space` image may use the ordinary visual-edit capability when that future capability exists.
- Provider retention, training, region, and deletion terms require product-owner approval before any image is sent.
- Deleting a Concept image follows a documented policy for its R2 object, D1 metadata, derived edits, pending jobs, backups, and audit records.

- Authorization checks occur again when background work reads or writes user data.
- Research adapters obey provider terms and never bypass technical access restrictions.
- External content is untrusted and cannot directly produce executable instructions for the system.
- AI-generated content is treated as untrusted data and validated before persistence.
- Pasted research and Import Draft parser output are untrusted. URLs, identifiers, numbers, currencies, quantities, and cross-record references are validated again when a draft is applied.
- Account merges require explicit, controlled ownership verification.
- Membership revocation invalidates authorization immediately at the API layer even if a UI cache is stale.

## Testing decisions

Tests assert externally visible behavior and domain invariants rather than internal function shape.

### Highest-value seams

1. Hono request-level integration tests against an isolated local D1 database.
2. Browser end-to-end tests for the critical authenticated and invitation flows.
3. Pure domain tests for permissions, money, decisions, and context filtering.
4. Adapter contract tests for external search and extraction providers using deterministic fixtures.

### Required test groups

#### Domain tests

- Role-to-capability mapping.
- Combined Workspace and Collection grants.
- No access to sibling Collections.
- Last-owner protection.
- Money and total-cost calculations.
- Item/Candidate quantity defaults and independent units, exact-versus-starting prices, shipping bases, qualified availability, mixed-currency exclusion, group rollups, and budget variance.
- Multiple purchase events, purchased-to-date derivation by Candidate/Offer, no inferred pack coverage, and human-only completion.
- Human-only decision commands.
- Candidate and Product identity rules.
- Invitation state transitions.
- One-active-Concept and Collection color-palette count, format, ordering, uniqueness, and Item-override rules.
- Context filtering.

#### Worker integration tests

- Authenticated and unauthenticated responses.
- Every role's allowed and denied mutations.
- Cross-tenant identifier substitution.
- Invitation acceptance, expiry, revocation, reuse, email mismatch, and idempotency.
- CRUD validation and database constraints.
- Planned Candidate/Offer ownership, quantity, price-kind, shipping-basis, and rollup behavior.
- Import Draft source preservation, warnings, explicit confirmation, idempotent application, authorization, and malformed or adversarial input.
- Research job creation and status transitions.
- Typed success and error responses.

Use the Cloudflare Workers Vitest integration so Worker APIs and bindings behave close to production.

#### Frontend tests

- RTL and LTR rendering of critical surfaces.
- Loading, empty, error, stale, and unauthorized states.
- Permission-aware controls while retaining API enforcement.
- Form validation and server-error recovery.
- Concept absent/present states and accessible core/supporting palette editing with labels in addition to swatches.
- Quantity and group editing, planned-selection controls, starting/unknown price labels, unpriced Items, and budget summaries.
- Accessible names, keyboard operation, dialogs, and focus management.

#### End-to-end tests

- Google authentication is covered through a controlled test strategy rather than live provider dependence in every run.
- Owner creates Workspace, Collection, and Item.
- Editor creates a text Concept and a core/supporting color palette, and a viewer can see but not edit them.
- User imports a multi-group shopping-list fixture, reviews inferred and future-quantity choices, category-URL and `starting_at` warnings, applies it, and sees quantity-aware EUR rollups reconciled with supplied approximate totals without unknown shipping being treated as zero.
- User records two staged purchases toward a four-unit need and the Item remains incomplete until an authorized human confirms completion.
- Owner invites a collaborator to selected Collections.
- Collaborator accepts and is denied access to a sibling Collection.
- Collaborator comments, votes, or contributes according to role.
- Owner compares Candidates and records a purchase.
- Research Result is promoted to a Candidate with provenance.

#### Future Concept media and visualization tests

The future tasks that introduce media must add tests for:

- Active-base, selected-cover, immutable-original, unique-object-key, and same-Concept parent-image invariants.
- Upload, read, replacement, deletion, cross-Collection denial, invalid media, expired upload authorization, cleanup, and private delivery.
- Per-Concept image count, per-Workspace byte quota, upload-authorization rate limits, and clear localized limit errors.
- Uploader-only AI transmission for a `person` base, denial for other Editors and Owners, fresh per-request confirmation, and ordinary capability checks for `space` images.
- Upload progress, media failure states, AI-edited labels, original-versus-edited distinction, provider failure/cancellation, and misleading-result disclaimers.

#### Research adapter tests

- Deterministic response normalization.
- Timeout, retryable failure, permanent failure, malformed data, and partial data.
- Source attribution.
- Idempotent Workflow step re-execution.
- Protection against treating page instructions as trusted system commands.

### Completion quality gate for every implementation task

- Relevant tests pass.
- Type checking passes.
- Linting passes without new warnings in authored files.
- Production build passes.
- Changed bindings regenerate Worker types.
- Database changes include generated, reviewable migrations.
- Authorization changes include both allow and deny tests.
- User-visible changes are verified in Persian and English at desktop and narrow viewport widths.
- Working-tree changes are limited to the approved task.

## Observability and operations

- Use structured logs with request, actor, Workspace, Collection, Concept Visual Edit Run, Research Request, and Research Run identifiers where applicable.
- Avoid logging private content unless necessary and intentionally redacted.
- Report authorization denials, invitation failures, provider errors, and Workflow failures with safe reason codes.
- Enable Cloudflare observability and source maps per environment.
- Document local, preview, and production migration commands before the first deployment.
- Backups and D1 Time Travel recovery are included in the production runbook.
- Research provider usage and failure rates are measurable before scheduled automation is added.
- Alerts and budgets are configured before high-volume Browser Run, image editing, AI, or search-provider use.

## Implementation roadmap

Repository policy requires one ordered task per substantial work session. Start the next task only after the previous task meets its completion criteria and the product owner explicitly requests continuation.

### Task 1: Monorepo foundation

Status: completed and validated on 2026-08-30.

Scope:

- Convert the scaffold to a Bun workspace.
- Move the existing Worker and React application into the web app module without changing visible behavior.
- Create only `packages/domain` and `packages/contracts`; keep the initial Hono RPC client inside `apps/web` and defer i18n package creation until Task 5B.
- Remove non-Bun package-manager lockfiles and workspace metadata, declare the Bun version through `packageManager`, and generate the sole committed lockfile, `bun.lock`.
- Add baseline test infrastructure and root quality scripts.

Completion criteria:

- Development server, lint, type checking, tests, and production build pass from the workspace root.
- The existing template API call and page still work.
- Exactly one package-manager lockfile is tracked and no empty future package is created.
- No functioning mobile app or product feature is introduced.

### Task 2: Domain and D1 foundation

Status: completed and validated on 2026-08-30.

Scope:

- Add D1 binding and generated types.
- Add Drizzle and the initial schema/migration workflow.
- Add Better Auth schema generation to the unified schema path.
- Implement the first domain primitives, including separate Item-needed and Candidate-planned purchase quantities, group/budget, and Offer price/shipping/availability semantics, plus the development seed strategy.

Completion criteria:

- A fresh local database migrates from zero successfully.
- A second migration application is a no-op.
- Domain and schema constraints have tests, including positive independent quantities, no inferred pack conversion, and valid planned Candidate/Offer ownership.
- Binding/type generation and migration instructions are documented.

### Task 3: Google authentication

Status: completed and validated on 2026-08-30.

Scope:

- Configure Better Auth, Google provider, Hono routes, session middleware, and browser client.
- Implement login, callback, logout, protected shell, and environment examples.
- Configure explicit multi-provider-safe account behavior.

Completion criteria:

- Protected endpoints reject anonymous requests.
- Authenticated sessions reach the protected shell.
- Account records are distinct from internal users.
- Auth configuration has integration tests and safe secret handling.

### Task 4: Authorization and invitations

Scope:

- Implement role capabilities, Workspace membership, Collection membership, and permission evaluation.
- Implement invitation creation, preview, acceptance, revocation, expiration, and email restriction.
- Enforce the MVP ownership boundary: only Workspace-scoped Owners manage Owner access, and only Owners record purchases.
- Implement acceptance as one D1 `batch()` with conditional writes and database uniqueness constraints for membership and invitation consumption.

Completion criteria:

- Every role has allow and deny tests.
- Workspace grants cover new Collections.
- Collection grants cannot access siblings.
- Collection-scoped Owners cannot grant or remove Owner access; Workspace-scoped Owners can do so while preserving at least one Workspace-scoped Owner.
- The email restriction defaults on when an invitation email is supplied, remains explicitly optional, and both paths have tests.
- `record_purchase` is allowed for Owners and denied for every lower role.
- Invitation preview is rate-limited and exposes only approved metadata.
- Repeated or concurrent acceptance cannot create duplicate memberships or consume an invitation twice; tests cover constraint failure, rollback, and retry behavior.

### Task 5A: Core Workspace API

Scope:

- Implement Workspace, Collection, and Item APIs through Hono RPC, including Item quantity and optional group label.
- Integrate the capability evaluator into every new read and mutation.

Completion criteria:

- Authenticated API calls complete Workspace → Collection → Item creation and return typed contracts.
- Unauthorized resources remain inaccessible through direct API calls.
- Request-level tests cover allowed, denied, invalid, archived, and cross-scope cases.

### Task 5B: Localized web shell and core CRUD UI

Scope:

- Implement the protected dashboard and Workspace, Collection, and Item CRUD UI, including quantity input and lightweight Item grouping.
- Create the i18n package with the first Persian and English message catalogs.
- Set root `lang`/`dir` and enforce logical layout properties from the first component.

Completion criteria:

- A user completes Workspace → Collection → Item creation through the UI.
- Refreshing restores persisted state.
- Critical loading, empty, error, unauthorized, RTL, and LTR states are tested.
- Authored styles pass the logical-layout review with any physical-direction exceptions documented.

### Task 6A: Collection Brief and text Concept

Scope:

- Implement structured Collection Brief editing.
- Implement the optional Collection budget and currency.
- Implement accessible ordered core/supporting color preferences with at most six entries in each group.
- Implement the optional one-per-Collection text Concept and Concept surface.
- Keep Concept images, R2, uploads, and AI visual editing disabled; their records and bindings belong to future tasks.

Completion criteria:

- Brief, budget, optional text Concept, and color preference are persisted and displayed with Items.
- Core/supporting limits, normalized-color uniqueness, ordering, labels, usage notes, Item precedence, RTL/LTR behavior, and keyboard accessibility are enforced and tested.
- No Concept media table, upload endpoint, R2 binding, or placeholder media UI is introduced.

### Task 6B: Item workflow

Scope:

- Implement priority, status, Item budget, quantity, group label, deadline, requirements, and Decision Events.

Completion criteria:

- Human-only decision transitions are enforced and audited.
- Currency and localized display behavior are tested.

### Task 7: Products, Candidates, and Offers

Scope:

- Implement canonical Products, Item Candidates, retailer Offers, Price Checks, and comparison UI.
- Implement planned Candidate/Offer selection, Candidate planned purchase quantities, Offer price kind, shipping basis, qualified availability, and group/Collection cost rollups.

Completion criteria:

- Several Offers can be compared for one Product.
- Several Products can be compared for one Item.
- Shipping and total cost remain distinct and correct.
- Exact, `starting_at`, and unknown prices remain visibly distinct; flat shipping is not accidentally multiplied by quantity.
- A Collection planned-total view sums explicitly planned Offer lines by group and Collection, respects quantity and compatible currency, lists unplanned/incomplete Items, and compares with the Collection budget when present.
- Purchase events snapshot actual Offer-unit quantity and exact observed pricing; partial purchases remain visible by Candidate/Offer without implying pack coverage or automatically completing the Item.
- Stale and unavailable Offer states are visible.

### Task 8: Collaboration experience

Scope:

- Implement member and invitation management UI.
- Implement copy/share invitation delivery and explain optional verified-email restrictions without implying that email was sent.
- Implement comments, votes, aggregates, and decision-history views.

Completion criteria:

- An owner can invite at Workspace or selected-Collection scope.
- A collaborator completes allowed actions and is blocked from denied actions.
- Revocation takes effect without depending on client refresh.

This is the collaborative web MVP boundary.

### Task 9A: Research Import Draft

Scope:

- Define a versioned JSON import schema and a constrained Markdown-table importer for pasted research lists.
- Preserve raw input, source URLs, group headings, explicit, inferred, and future/optional quantities, exact/starting prices, unknown shipping, qualified availability, supplied summary totals, exclusions, and unmapped facts in a reviewable Import Draft.
- Implement preview, correction, apply, discard, provenance, and idempotent retry behavior. AI-assisted normalization remains disabled until Task 10's deterministic context boundary is proven.

Completion criteria:

- The representative multi-room IKEA-style fixture becomes proposed groups, Items, Candidates, Products, Offers, Price Checks, and sourced notes without directly mutating the Collection.
- Inferred unit prices, future-versus-current quantity choices, source-total reconciliation differences, and other ambiguous or missing data are visibly flagged.
- Category, search, and filtered-listing URLs remain Research Sources with warnings and never silently become direct Product Offer URLs.
- Applying a reviewed draft uses normal authorized commands and repeating apply cannot create duplicate records.
- Malformed, adversarial, partially valid, and unauthorized imports fail safely while preserving actionable warnings.

### Task 9B: Provider research MVP

Scope:

- Add Research Requests, Runs, Results, Sources, and one search-provider adapter.
- Add Cloudflare Workflow orchestration.
- Add extraction for known permitted pages through Browser Run, formerly named Browser Rendering.
- Add manual Offer refresh and result promotion.

Completion criteria:

- Research executes asynchronously with visible progress and failure states.
- Results retain sources and timestamps.
- Promotion creates normal Product, Offer, and Candidate records through validated commands.
- No research path can finalize a decision or purchase.

### Task 10: AI context and export

Scope:

- Implement the permission-filtered Context Builder, schema-versioned snapshots, and Markdown export.
- Include Concept narrative and Collection color preference. Future image metadata is added only after the media task exists; raw image bytes never enter ordinary text snapshots.
- After deterministic Import Draft behavior passes, optionally add schema-constrained AI normalization for less structured pasted research while retaining the same preview-and-confirm boundary.
- Add an AI provider or Agents SDK only after deterministic context behavior passes tests.

Completion criteria:

- Snapshot content matches the actor's exact access.
- Cross-Collection leakage tests pass.
- Users can inspect the exported context.
- AI output is validated and remains advisory.

This is the assisted-research MVP boundary.

### Task 11: Production hardening and deployment

Scope:

- Complete security tests, accessibility review, rate limits, observability, environment separation, migration runbook, recovery runbook, and deployment automation.

Completion criteria:

- Critical end-to-end flows pass in a production-like environment.
- Preview and production resources are isolated.
- Deployment and rollback/recovery procedures are exercised.
- The release checklist has no unresolved critical findings.

### Future task: Concept media foundation

This starts only when image references or visualization justify the added storage and privacy cost. It does not change the text Concept identity. It:

- Adds Concept Image records and a private R2 binding for user-provided `base` and `reference` images; it does not generate images.
- Implements authorized upload/finalization, verified decoding, type/byte/dimension validation, EXIF reduction, protected delivery, immutable originals, replacement, ordering, cover selection, deletion, and failed-upload cleanup.
- Rechecks then-current Cloudflare Workers request-body, R2, presigned-upload, and image-processing limits before selecting the upload path and decoding/metadata-removal implementation.
- Enforces configurable maximum images per Concept, total media bytes per Workspace, and upload-authorization rate limits without requiring a schema migration to tune the values.
- Requires a person-photo rights confirmation, records the uploader, and clearly explains collaborator visibility.

Completion criteria:

- No public object path grants access; anonymous users and sibling-Collection members cannot read media.
- Per-object validation, per-Concept count, per-Workspace storage, authorization, rate-limit, cleanup, and localized-error tests pass.
- Base objects are immutable, only one base and cover are active, and preview/production resources are isolated.
- The D1 schema contains Concept Images but no Visual Edit Run table.

### Future task: AI Concept visualization

This starts only after the future Concept media foundation and Task 10's access-filtered context are stable, and after the product owner approves an image-edit provider and its privacy terms. It:

- Requires an active user-provided base photo; it does not offer text-to-image generation without one.
- Accepts an explicit set of permitted Candidate or Product inputs rather than silently using every Collection choice.
- Allows an ordinary authorized actor to request an edit of a `space` base. Only the uploader may request an edit of a `person` base, and every provider transmission requires fresh explicit confirmation.
- Edits a space or person image through a provider adapter and stores each result as a separate private Concept Image.
- Preserves the original, records provider/input provenance, labels edits as illustrative, and lets an authorized human keep, reject, or choose the cover.
- Tests cross-Collection isolation, provider failure, cancellation, deletion, cost limits, and the guarantee that Item changes never trigger generation automatically.

### Future task: Expo mobile application

This starts only after the web MVP and API contracts are stable. It adds native UI, deep links, secure session storage, Google and Apple sign-in, explicit provider linking, and mobile-specific end-to-end tests without replacing the Worker API or D1 data.

## Risks and mitigations

### Authorization complexity

Risk: Workspace and Collection grants can produce inconsistent checks.

Mitigation: one capability evaluator, resource-derived scope, exhaustive allow/deny tests, and no client-only enforcement.

### Auth schema and migration drift

Risk: Better Auth and application schema changes may diverge.

Mitigation: one Drizzle schema source, Better Auth CLI generation after auth/plugin changes, generated SQL review, and Wrangler-managed application.

### Account takeover through linking

Risk: automatic same-email linking can attach the wrong provider identity.

Mitigation: disable implicit linking, require authenticated explicit linking, and use controlled conflict resolution.

### D1 transaction constraints

Risk: flows designed for conventional interactive transactions may not work safely on D1.

Mitigation: design idempotent commands, use transactional D1 `batch()` calls with database uniqueness and conditional-write backstops, test rollback and retry behavior, verify the active Better Auth adapter behavior, and avoid plugins requiring unsupported interactive transactions.

### Hono RPC type performance

Risk: a very large route type can slow TypeScript tooling.

Mitigation: keep Hono versions aligned, maintain strict TypeScript, construct the initial RPC client inside `apps/web`, extract a shared client only when a second consumer exists, and split route groups at coherent domain boundaries.

### Product duplication

Risk: manual and researched entries create duplicate canonical Products.

Mitigation: preserve internal IDs, capture external identifiers, provide duplicate suggestions later, and make merges explicit and auditable.

### Stale or incorrect research

Risk: prices, availability, and extracted attributes become outdated or wrong.

Mitigation: show sources and `last checked`, retain Price Checks, support manual refresh, expose caveats, and require human promotion/decision.

### External provider dependence

Risk: search, retailer pages, or Browser Run limits and terms change.

Mitigation: provider interfaces, bounded retries, feature flags, usage observability, and a manual-entry path that always works.

### Target-market provider reachability

Risk: approved retailers may restrict traffic from Cloudflare browser infrastructure, and identity or search providers may be unreliable or unavailable from intended user regions.

Mitigation: define supported launch regions, run legitimate timeboxed connectivity and terms-of-service spikes before Tasks 3 and 9B depend on a provider, record results, and retain manual entry and share-link workflows as fallbacks. Never bypass technical or legal access restrictions.

### Premature AI scope

Risk: AI work begins before reliable data and permissions exist.

Mitigation: complete deterministic domain, authorization, research provenance, and Context Builder tasks first.

### Personal image privacy

Risk: a base photo can reveal a person's identity, body, home interior, possessions, or location metadata and may be exposed to collaborators or an external image provider.

Mitigation: private storage, Collection-scoped authorization, EXIF reduction, explicit upload rights/consent, clear collaborator visibility, provider disclosure, approved retention/deletion terms, and no identity recognition or unrelated inference.

### Misleading visual edits

Risk: an attractive AI edit may imply inaccurate fit, dimensions, color, material, or product compatibility.

Mitigation: label every edit as illustrative, preserve the base and inputs, show which Candidates influenced it, avoid auto-selection or purchase actions, and keep factual comparison data separate.

### Mobile coupling

Risk: web-specific assumptions leak into shared packages.

Mitigation: runtime-independent domain/contracts/i18n packages and a fetch/session strategy that can be replaced by the Expo client.

## Product-owner decisions

### Resolved for Task 4

1. Only Workspace-scoped Owners may grant or remove Owner access in the MVP. Collection-scoped Owners may administer non-Owner Collection members. This policy may be broadened later without adding a special original-creator role.
2. Verified-email restriction is optional. The invitation UI enables it by default when an email is supplied, and an authorized inviter may explicitly turn it off.
13. Only Owners receive `record_purchase` in the MVP. The capability may be added to another role bundle later without a schema migration.

### Open decisions for later tasks

3. Should comments support Item and Candidate targets only in the MVP, or also Offers and Research Results?
4. Is voting a simple preference, an up/down vote, or a ranked score?
5. Should one Item support more than one selected/final Product, for bundles or recurring purchases?
6. EUR is required for the MVP. Can one Collection contain additional currencies and—if Iranian users are in scope—should IRR be entered and displayed as rial, toman, or an explicitly labeled user preference? Canonical storage and all conversion/display rules must be unambiguous; no implicit FX conversion is allowed.
7. What is the default UI language for users whose browser preference is neither Persian nor English?
9. Which search provider should power the first Research adapter?
10. Which retailers or domains are approved for initial Browser Run extraction?
11. What retention period applies to research snapshots, raw Import Draft input, comments, and audit history?
12. Is hard deletion required for privacy requests, and which historical records should instead be anonymized?
14. Should scheduled price monitoring be a post-MVP paid feature, a general feature, or remain undecided?
15. What retention and deletion policy applies to original base photos, reference images, edited variants, provider inputs, and backups?
16. Should the first AI Concept visualizer support both `space` and `person`, or launch with one subject kind first?
17. Which image-edit provider is approved, in which processing region, and with what retention and training terms?

Decisions 1, 2, and 13 are resolved, so Task 4 has no remaining product-decision gate. Decisions 6 and 7 must be resolved before Task 5B; Decision 11 before Task 9A; Decision 15 before the future Concept media foundation; Decisions 16 and 17 before the future AI Concept visualization task; all other decisions affecting schema, permissions, or external providers must be resolved before their corresponding implementation task begins.

## Current repository state

- Branch: `main`.
- History: scaffold baseline followed by the committed Task 1 monorepo and Task 2 domain/D1 foundations; Task 3 is the current uncommitted implementation milestone.
- Tasks 1 through 3 are complete and validated; Task 4 has not started.
- The repository is a Bun `1.3.12` workspace with `apps/web`, `packages/domain`, and `packages/contracts`. No mobile, API-client, i18n, or config package has been created.
- `bun.lock` is the sole package-manager lockfile present, and Bun workspaces are declared in the root `package.json`.
- The Vite/React frontend now provides the Google sign-in surface and a session-gated empty shell. The Hono Worker preserves the scaffold health response while adding Better Auth routes and a protected session endpoint.
- Drizzle is the unified schema source. The first generated migration includes Better Auth's generated tables plus Workspace-private Products and the initial collaboration/planning tables; a second migration adds persistent Better Auth rate-limit storage. Later feature tables remain owned by their roadmap tasks.
- Local migration, migration-list, schema-check, seed, type-generation, and quality commands are available from the workspace root. The fixed development seed is idempotent.
- Runtime-independent domain primitives preserve separate Item-needed and Candidate-planned purchase quantities, money/budget validation, group labels, and honest Offer price/shipping semantics.
- The root `CONTEXT.md` defines the purchase-planning language and guards the Item/Candidate/Product/Offer boundaries.
- The baseline Worker regression test preserves `GET /api/` returning `200` with `{ "name": "Cloudflare" }`.
- Better Auth uses explicit origins, environment-bound secrets, database-backed sessions, secure production cookies, edge-controlled client-IP rate-limit keys, and disabled implicit account linking. Google is the only enabled provider.
- Auth integration tests cover anonymous rejection, Google authorization URL construction, untrusted callback rejection, authenticated session loading, sign-out revocation, and separate internal User/provider Account records.
- Domain and Cloudflare-runtime database tests cover migration idempotency, positive independent quantities, planned Candidate/Offer ownership, price/budget constraints, palette bounds, and no inferred pack conversion.
- Runtime authorization, invitations, feature CRUD, localization catalogs, and research behavior are not yet implemented.

## Current reference basis

These links informed the architecture and must be rechecked before implementing platform-specific behavior because APIs and limits change.

- [Cloudflare Workers Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare Hono framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 Worker API `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare R2 overview](https://developers.cloudflare.com/r2/)
- [Cloudflare R2 from Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 public-bucket behavior](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Cloudflare Browser Run overview (formerly Browser Rendering)](https://developers.cloudflare.com/browser-run/)
- [Cloudflare Browser Run limits](https://developers.cloudflare.com/browser-run/limits/)
- [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Better Auth Hono integration](https://better-auth.com/docs/integrations/hono)
- [Better Auth database guide](https://better-auth.com/docs/concepts/database)
- [Better Auth session management](https://better-auth.com/docs/concepts/session-management)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Better Auth users and accounts](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo)
- [Better Auth Google authentication](https://better-auth.com/docs/authentication/google)
- [Better Auth Apple authentication](https://better-auth.com/docs/authentication/apple)
- [Hono RPC guide](https://hono.dev/docs/guides/rpc)
- [Hono validation guide](https://hono.dev/docs/guides/validation)
- [Drizzle with Cloudflare D1](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)

## Approval record

External architecture review on 2026-08-30 returned “approve with changes.” Valid scope, security, localization, delivery, task-sizing, and repository-state feedback was incorporated. The suggested rename from Browser Run to Browser Rendering was not applied because current Cloudflare documentation states that Browser Run is the new name and Browser Rendering is the former name.

Product-owner clarification on 2026-08-30 added one optional Collection Concept. Its future visualizer is explicitly image-to-image: the user supplies a real space/person base photo, the original is immutable, and AI edits are separate private variants requiring human adoption.

A second external review confirmed the earlier architecture corrections and the current Browser Run name. After reviewing delivery weight, the product owner selected a text-only Concept for the collaborative MVP and deferred private Concept media to a separate future task. This changes sequencing, not the visualizer rule: future AI editing still requires a real user-provided base image, immutable originals, private storage, provenance, and human adoption.

A later privacy review added future media quotas and upload-authorization rate limits, made Concept Image and Visual Edit Run schema creation task-local rather than part of Task 2, and resolved person-photo provider permission conservatively: only the image uploader may request an AI edit, with fresh confirmation for each transmission. The same product-owner update added a simple Collection Brief color preference with up to six core and six supporting colors.

A real multi-room IKEA-style research list then exposed and resolved planning gaps: separate Item-needed and Candidate-planned purchase quantities, lightweight Item grouping, Collection budget, explicit planned Candidate/Offer selection, exact-versus-starting price semantics, shipping and availability qualifiers, honest rollups, purchase snapshots, and staged Markdown/JSON Import Drafts.

The product owner approved this specification and explicitly authorized Task 1 on 2026-08-30. Task 1 is complete and validated.

The product owner explicitly authorized Task 2 on 2026-08-30. Task 2 implements the conservative Workspace-private Product boundary for the MVP and is complete and validated.

The product owner explicitly authorized Task 3 on 2026-08-30. Task 3 implements Google authentication, database-backed sessions, the browser login/protected-shell flow, and safe multi-provider foundations; it is complete and validated.

Before Task 4, the product owner resolved its three gated decisions conservatively: Workspace-scoped Owners alone manage Owner access, verified-email invitation restriction is the overridable default, and `record_purchase` belongs only to Owners. Each permission may be broadened later through capability-policy changes without introducing a special original-creator role.

The next ordered implementation task is Task 4: authorization and invitations. Its product-decision gate is resolved; implementation starts only after the product owner explicitly authorizes it in a later session.
