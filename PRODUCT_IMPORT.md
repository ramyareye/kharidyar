# Product photos and comparison details

## First phase

Product photos use an optional `imageUrl`: a direct HTTPS image link without URL credentials. The browser loads it from its host; WantKit does not copy it into private media storage. Missing or broken photos show the existing fallback. Use a photo of the exact product/variant, not a retailer page or generated substitute.

| Information | Where it belongs |
| --- | --- |
| Name, brand, model/article identifier, category | Product fields |
| Main photo | Product `imageUrl` |
| Dimensions, material, colour, variant, article number | Product `attributes` label/value pairs |
| Product page, merchant, price/currency, shipping, availability | Offer fields, with source URL and observation date |
| Purchase quantity and personal notes | Candidate fields |
| Room or category of need | Item group / Collection |

JSON import proposals retain `product.imageUrl` and `product.attributes` through preview, correction, application and replay. Older drafts without photos remain compatible. Enrich existing products with `update_product`; re-importing them creates duplicates. Omitting `imageUrl` preserves it; `null` clears it. Updating `attributes` replaces the array, so preserve existing facts when adding new ones.

Markdown tables accept `Product`, `Price`, `Notes`, `Image URL`, `Brand`, `Model`, `Category`, `Dimensions`, `Material`, `Colour`/`Color`, `Variant`, `Article number`/`SKU`, and `Product URL`/`Source URL`. Inline Markdown images can supply photos. Image links are separate from product source links. Unsupported columns and invalid photo URLs remain in unmapped facts for review. Prices retain the existing constrained EUR parsing; use versioned JSON for richer currency, availability and shipping data.

Example with fictional data:

```markdown
| Product | Price | Image URL | Brand | Dimensions | Material | Colour | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Example chair](https://shop.example/product/chair-beige) | €89 | https://images.example/chair-beige.webp | Example | 50 × 60 × 80 cm | Oak | Beige | Option for the desk |
```

A trailing `×2` is an explicit quantity; dimensions such as `120×30 cm` or `120 × 30` remain part of the title. Review inferred quantities before applying a draft.

Import previews and comparison cards display photos and attributes, including clickable HTTPS attribute sources. Unplanned item rows can preview the highest-ranked active candidate with a photo, then creation order. This does not select the candidate or affect costs. Planned items use their chosen product's own photo, including the empty-photo fallback if it has none.

## Connector and release

The backend's shared schemas already publish `imageUrl` in `create_candidate` and `update_product`. The installed **WantKit Production — wantkit.todoless.dev** plugin inspected on 2026-09-09 had an older schema without that field. Refresh the existing plugin's tools after release and confirm these inputs through `tools/list`; do not create duplicate connections or replace credentials by default.

No new migration, binding or dependency is required. The existing product-image migration is already recorded in preview and production. Preserve live deployment settings as described in HANDOFF and RELEASE.

## Later phases

1. Release and refresh the connector, then backfill sourced photos/details on the existing products. Retailer photos may block external loading or disappear; durable storage is a separate feature.
2. Organise competing products as candidates under the same need: for example, one Sofa item with multiple candidates. The imported workspace currently has products as separate items; do not silently merge or choose them.
3. Optionally add numeric rating, rating scale, review count, retailer/locale, variant or product-family scope, source URL and checked date. Unknown values stay empty. Highest-rated and most-reviewed sorting are small additions once these fields exist. A minimum review-count filter can keep a 5/5 rating from two reviews from dominating. Retailer-specific collection and refresh is the larger task. Save bestseller claims only when explicitly provided by the retailer; review count is not sales count. This phase adds no rating collection or ranking.
