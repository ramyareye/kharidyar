import { Hono } from "hono";

import type { WorkerAppEnv } from "./session-middleware";

const productFixture = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex,nofollow">
  <title>Warm oak paper lamp · Kharidyar fixture</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Warm oak paper lamp",
    "brand": { "@type": "Brand", "name": "Kharidyar Fixtures" },
    "model": "WOPL-01",
    "category": "Floor lamp",
    "offers": {
      "@type": "Offer",
      "price": "79.99",
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock",
      "seller": { "@type": "Organization", "name": "WantKit Demo Store" }
    }
  }
  </script>
</head>
<body>
  <main>
    <h1>Warm oak paper lamp</h1>
    <p>A first-party fixture used to verify permission-gated Browser Run extraction.</p>
  </main>
</body>
</html>`;

export const researchFixtureRoutes = new Hono<WorkerAppEnv>().get(
  "/research-fixtures/products/warm-oak-paper-lamp",
  (context) =>
    context.body(productFixture, 200, {
      "cache-control": "public, max-age=3600",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=UTF-8",
      "x-content-type-options": "nosniff",
    }),
);
