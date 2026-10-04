# WantKit landing page

Updated 2026-10-03. Deployed to preview and production from user-pushed `c0b4562`. Following the first combined page, the user requested separate pages for users and investors/partners. Live user introduction: https://wantkit.todoless.dev/about; partner brief: https://wantkit.todoless.dev/partners.

## Message and experience

WantKit is the workspace before checkout: save ideas, compare options and decide together. Lead with a working product, its problem and approach. Do not publish invented traction, revenue, market-size figures or promises of automatic shopping/research.

- Anonymous `/` presents the landing page with the existing Google sign-in card. Signed-in `/` still opens the planning dashboard.
- `/about` and `/about/` present the user page regardless of session state. Its hero calls to action are Start planning and See how it works; the page explains saving, comparing and deciding.
- `/partners` and `/partners/` are public investor/partner pages with distinct positioning, the problem/approach/current-stage brief and links to explore the user product. The investor brief is absent from the user page. Both pages link to each other.
- Interactive chair shortlist and horizontal comparison use fictional products/prices and local component state. No private catalogue data, writes or external product images.
- English/Farsi, RTL, existing System/Light/Dark preferences, mobile layout, keyboard focus and a skip link.
- Investor brief states the problem, approach and current early-product stage. Assistant access remains owner-only.
- Basic text social metadata is in the existing HTML shell. This remains a client-rendered SPA; a static/prerendered marketing page and social preview image are possible later tasks.

## Validation and release boundary

72 UI tests and 5 i18n tests passed, along with TypeScript, focused ESLint and the production build. New route tests cover both partner URL variants while signed out/signed in and while session loading, plus user-page separation. Browser checks covered links between pages, the partner brief anchor, English/Farsi partner copy and 1280px desktop/390px mobile layouts. Both pages stayed 390px wide; Persian partner layout did too. Prior demo selection/comparison and light/system-dark appearance checks remain applicable; the shared demo/theme controls are unchanged. Existing invitation and assistant sign-in routes are covered by routing tests.

Local Google OAuth could not be exercised: this dev server lacks auth secrets. The existing callback/sign-in logic is reused. The build reports dependency annotation, missing local secrets and bundle-size warnings. No dependencies, bindings, migrations or backend code changed.

Release verification: fresh full checks and both preserved-config deployment dry-runs passed. Both origins passed smoke checks, five exact HTML route checks and four exact asset checks. Preview Google sign-in completed and loaded an existing collection; production's existing Google session loaded the dashboard. Fresh production re-login was not repeated. Both origins' Google initiation callbacks are correct; live configuration is preserved. See RELEASE.md for versions, recovery points and evidence. Review artifacts in `.tmp/` are not release source files. No next implementation task is selected.

## Future modes — agreed direction, not implementation

User-confirmed direction, 2026-10-03: General is the default; Home is an optional preset using existing room, furniture, measurement and floor-plan features; Food is a future specialised mode. Choose modes per collection, so one workspace can contain home plans, groceries and general purchases. Mode selection should be optional and should not block creating a collection. Keep one shared planning core; tech and gifts may become presets if useful. Introduce specialised rules only when the workflow needs them. This decision is recorded for future implementation; no mode selector or food workflow has been built.

Reuse the shared core before copying the app or creating another repository. Collections, needs, quantities, offers, sharing and recorded purchases could support a basic household grocery list today. This is an architectural proposal, not a completed food workflow.

Meal planning adds distinct entities and rules: recipes, ingredient quantities/units, servings, weekly meal assignments, pantry stock and merging overlapping ingredients into a shopping list. An ingredient (e.g. 500 g of rice) is distinct from a retailer's packaged product. Prices/availability still belong to offers, with checked dates and unknown values preserved. Food-specific planning should not be forced into arbitrary furniture attributes.

If requested later, define a small food mode first: choose meals → scale servings → subtract pantry stock → produce a shared shopping list. Consider a separate brand or app only after that workflow is useful enough to justify it. No food schema, routes, shopping automation or nutrition recommendations were added in this landing-page task.
