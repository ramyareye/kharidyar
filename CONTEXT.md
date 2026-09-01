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
