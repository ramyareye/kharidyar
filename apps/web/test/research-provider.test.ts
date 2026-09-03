import { describe, expect, it } from "vitest";

import {
  isResearchBrowserUrlAllowed,
  suggestionFromJsonLd,
} from "../src/worker/research-browser";
import { createTavilySearchProvider } from "../src/worker/research-provider";

describe("Research provider boundary", () => {
  it("uses the cheap Tavily shape and normalizes sources", async () => {
		let requestBody: Record<string, unknown> = {};
    const provider = createTavilySearchProvider({
      apiKey: "secret",
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          request_id: "request-1",
          results: [
            {
              content: " Useful summary ",
              score: 0.8,
              title: " First result ",
              url: "https://shop.example/item#details",
            },
            {
              content: "duplicate",
              score: 0.7,
              title: "Duplicate",
              url: "https://shop.example/item",
            },
          ],
        });
      },
    });
    const output = await provider.search({
      constraints: {
        currency: "EUR",
        excludedTerms: ["plastic chair"],
        maxUnitPriceMinor: 12_500,
        preferredDomains: ["shop.example"],
        requiredTerms: ["paper shade"],
      },
      query: "Japandi lamp",
    });
    expect(requestBody).toMatchObject({
      country: "netherlands",
      include_answer: false,
      include_raw_content: false,
      max_results: 5,
      safe_search: true,
      search_depth: "basic",
    });
		expect(String(requestBody.query)).toContain('"paper shade"');
    expect(output.results).toEqual([
      {
        content: "Useful summary",
        score: 0.8,
        title: "First result",
        url: "https://shop.example/item",
      },
    ]);
  });

  it("allows only exact first-party fixture URLs and parses their Product facts", () => {
    const origin = "https://wantkit.example";
    const url = `${origin}/api/research-fixtures/products/warm-oak-paper-lamp`;
    expect(isResearchBrowserUrlAllowed(url, origin)).toBe(true);
    expect(isResearchBrowserUrlAllowed(`${url}?next=1`, origin)).toBe(false);
    expect(
      isResearchBrowserUrlAllowed(
        "https://retailer.example/api/research-fixtures/products/lamp",
        origin,
      ),
    ).toBe(false);

    const extraction = suggestionFromJsonLd(
      [
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          brand: { name: "WantKit Fixtures" },
          category: "Floor lamp",
          name: "Warm oak paper lamp",
          offers: {
            availability: "https://schema.org/InStock",
            price: "79.99",
            priceCurrency: "EUR",
            seller: { name: "Demo Store" },
          },
        }),
      ],
      url,
    );
    expect(extraction.suggestion.offer.facts).toMatchObject({
      availabilityState: "available",
      currency: "EUR",
      priceKind: "exact",
      unitPriceMinor: 7_999,
    });
  });
});
