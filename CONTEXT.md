# Purchase Planning

Kharidyar is a private collaborative context for turning purchase needs into explicit, evidence-backed plans without confusing a need, a product, a seller listing, or a completed purchase.

## Organization

**Workspace**:
The private collaboration boundary that contains members and Collections.
_Avoid_: Account, team, project

**Collection**:
A coherent purchase-planning effort inside one Workspace, such as a new home or sport wardrobe.
_Avoid_: Project, board, folder

**Collection Brief**:
The Collection's shared goals, constraints, preferences, color direction, and optional budget.
_Avoid_: Requirements document, profile

**Concept**:
The optional visual and experiential direction within a Collection Brief; it is text-only in the collaborative MVP.
_Avoid_: Topic, mood board, Collection

**Group Label**:
An optional lightweight display section for Items, such as “Bedroom,” with no separate hierarchy or permissions.
_Avoid_: Subcollection, room entity, category

## Collaboration

**Membership**:
A role grant connecting one internal User to either a Workspace or one Collection.
_Avoid_: Account, invitation, ownership proof

**Role**:
A named bundle of capabilities: Viewer, Commenter, Contributor, Editor, or Owner.
_Avoid_: A hard-coded authorization shortcut

**Capability**:
One server-enforced permission resolved from all applicable Membership grants at the requested resource scope.
_Avoid_: UI visibility, role-name comparison

**Invitation**:
An expiring, revocable proposal for one Workspace Membership or selected Collection Memberships; its bearer token is single-use and stored only as a hash.
_Avoid_: Membership, emailed identity, reusable share link

**Invitation Acceptance**:
The authenticated, transactional conversion of one valid Invitation into Membership grants and one immutable consumption record.
_Avoid_: Sign-in, invitation preview, client-only state

**Comment**:
A member-authored discussion entry attached to exactly one Item or one Candidate. Removal clears its text but keeps a tombstone in the thread.
_Avoid_: Offer review, free-floating note, hard-deleted thread position

**Preference**:
A collaborator's current positive signal for one Candidate, represented by at most one active record per User and Candidate.
_Avoid_: Final decision, rank, score, up/down vote

## Research import

**Import Draft**:
A staged, reviewable interpretation of pasted research that cannot affect planning records before an authorized person explicitly applies it.
_Avoid_: Research Result, completed import, unsaved form

**Import Proposal**:
The editable structured Items, Products, Candidates, Offers, source facts, and warnings inside an Import Draft.
_Avoid_: Trusted source data, applied planning records

**Import Application**:
The durable provenance mapping from one applied Import Proposal to the planning records it created or reused.
_Avoid_: Import Draft, automatic synchronization, Research Run

## Provider research

**Research Request**:
The user's explicit search question and normalized constraints for one Collection, optionally related to one Item.
_Avoid_: Collection Brief, Import Draft, prompt built from hidden context

**Research Run**:
One asynchronous, retryable execution of a Research Request with a visible lifecycle, provider identity, and requester.
_Avoid_: Research Request, final decision, invisible background state

**Research Source**:
The HTTPS source URL, provider, retrieval time, extraction state, and expiring snapshot behind one finding.
_Avoid_: Offer, trusted instruction, permission to scrape

**Research Result**:
An advisory, sourced finding from a Research Run that remains separate from normal planning records until explicit promotion.
_Avoid_: Product, Candidate, Offer, selected option

**Research Promotion**:
The idempotent, human-confirmed conversion of one active Research Result into ordinary Product, Candidate, Merchant, Offer, and Price Check records, with durable provenance.
_Avoid_: automatic selection, purchase, repeated import

**Automated Offer Refresh**:
A user-requested Price Check extracted only from an exact, approved Product-page allowlist; unsupported retailer URLs stay manual.
_Avoid_: scheduled monitoring, broad crawling, access-control bypass

## AI context

**Context Builder**:
The server-side operation that begins with an authenticated User and one requested Collection, rechecks `export_context`, and assembles only records reachable through that authorized Collection.
_Avoid_: client-assembled prompt, Workspace-wide dump, hidden cross-Collection lookup

**AI Context Snapshot**:
A private, immutable, schema-versioned JSON record of exactly what the Context Builder exposed, including its actor, Collection scope, creation time, and byte size.
_Avoid_: live query, editable document, raw provider response, AI output

**Markdown Context Export**:
A deterministic human-readable rendering of one AI Context Snapshot for inspection or reuse. It treats user-authored and externally sourced text as untrusted data and contains no credentials, session or invitation tokens, raw provider payloads, or image bytes.
_Avoid_: prompt instruction, automatic provider submission, source of truth

## Planning

**Item**:
A need the Collection is trying to satisfy, independent of any specific Product.
_Avoid_: Product, listing, cart item

**Quantity Needed**:
The positive count of Item need-units the user wants to satisfy.
_Avoid_: Order quantity, pack count

**Candidate**:
The association between an Item and a Product being considered, including its notes and planning state.
_Avoid_: Product, Offer, result

**Planned Purchase Quantity**:
The positive count of Product/Offer sale units in a Candidate plan; it is independent of Quantity Needed.
_Avoid_: Quantity Needed, inferred pack coverage

**Planned Candidate**:
The single Candidate explicitly nominated for an Item's cost rollup, optionally with one planned Offer.
_Avoid_: Winner, purchase, final Product

## Commerce facts

**Merchant**:
The seller that publishes an Offer, with an online, physical, or combined sales presence; it is distinct from the Product's brand.
_Avoid_: Brand, Product, Offer, free-text seller

**Product**:
A merchant-independent identity for the thing being considered, private to one Workspace in the MVP.
_Avoid_: Offer, listing, Candidate

**Offer**:
A merchant-specific listing for one Product with price, shipping, availability, source, and freshness semantics.
_Avoid_: Product, Candidate, deal

**Price Kind**:
The truth status of an Offer price: `exact`, `starting_at`, or `unknown`.
_Avoid_: Price confidence, estimated price

**Shipping Basis**:
Whether a shipping amount applies once per planned line, once per Offer unit, or is unknown.
_Avoid_: Shipping type, delivery method

**Availability State**:
An Offer observation of `available`, `unavailable`, or `unknown`, qualified by channel, location, or variant when relevant.
_Avoid_: In stock everywhere, Product availability

**Price Check**:
An immutable observation of an Offer's price, shipping, and qualified availability at a specific time.
_Avoid_: Offer, current price
