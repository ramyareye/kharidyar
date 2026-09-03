import { launch, type BrowserWorker } from "@cloudflare/playwright";
import {
  researchResultSuggestionSchema,
  type ResearchResultSuggestion,
} from "@kharidyar/contracts";

const fixturePathPattern =
  /^\/api\/research-fixtures\/products\/[a-z0-9-]+\/?$/u;

export interface BrowserExtraction {
  metadata: Record<string, boolean | null | number | string>;
  suggestion: ResearchResultSuggestion;
}

export function isResearchBrowserUrlAllowed(
  rawUrl: string,
  allowedOrigin: string,
): boolean {
  try {
    const url = new URL(rawUrl);
    const origin = new URL(allowedOrigin);
    return (
      url.protocol === "https:" &&
      origin.protocol === "https:" &&
      url.origin === origin.origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      fixturePathPattern.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function schemaTypes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function findProduct(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProduct(entry);
      if (found) return found;
    }
    return null;
  }
  const record = recordValue(value);
  if (record === null) return null;
  if (schemaTypes(record["@type"]).some((type) => type === "Product")) {
    return record;
  }
  if (record["@graph"] !== undefined) return findProduct(record["@graph"]);
  return null;
}

function textValue(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maximumLength);
  return normalized || null;
}

function namedValue(value: unknown, maximumLength: number): string | null {
  const direct = textValue(value, maximumLength);
  if (direct) return direct;
  return textValue(recordValue(value)?.name, maximumLength);
}

function firstOffer(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return recordValue(value[0]);
  return recordValue(value);
}

function decimalMinor(value: unknown): number | null {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/u.exec(normalized);
  if (!match) return null;
  const minor =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function availability(value: unknown): "available" | "unavailable" | "unknown" {
  const normalized = textValue(value, 200)?.toLowerCase();
  if (normalized?.endsWith("/instock")) return "available";
  if (
    normalized?.endsWith("/outofstock") ||
    normalized?.endsWith("/soldout") ||
    normalized?.endsWith("/discontinued")
  ) {
    return "unavailable";
  }
  return "unknown";
}

export function suggestionFromJsonLd(
  documents: readonly string[],
  sourceUrl: string,
): BrowserExtraction {
  let product: Record<string, unknown> | null = null;
  for (const document of documents) {
    try {
      product = findProduct(JSON.parse(document));
    } catch {
      continue;
    }
    if (product) break;
  }
  if (product === null)
    throw new Error("No schema.org Product data was found.");
  const title = textValue(product.name, 240);
  if (title === null) throw new Error("The Product data has no usable name.");
  const offer = firstOffer(product.offers);
  const priceMinor = decimalMinor(offer?.price);
  const currency = textValue(offer?.priceCurrency, 3)?.toUpperCase() ?? null;
  const merchantName =
    namedValue(offer?.seller, 160) ??
    namedValue(product.brand, 160) ??
    new URL(sourceUrl).hostname;
  const suggestion = researchResultSuggestionSchema.parse({
    product: {
      attributes: [],
      brand: namedValue(product.brand, 160),
      category: textValue(product.category, 120),
      model:
        textValue(product.model, 160) ??
        textValue(product.mpn, 160) ??
        textValue(product.sku, 160),
      title,
    },
    merchant: {
      name: merchantName,
      notes: "Observed from a permitted first-party research fixture.",
      salesChannel: "online",
      websiteUrl: new URL(sourceUrl).origin,
    },
    offer: {
      facts: {
        availabilityChannel: "online",
        availabilityLocation: null,
        availabilityNote: null,
        availabilityState: availability(offer?.availability),
        availabilityVariant: null,
        currency:
          priceMinor !== null && currency?.length === 3 ? currency : null,
        priceKind:
          priceMinor !== null && currency?.length === 3 ? "exact" : "unknown",
        shippingBasis: "unknown",
        shippingMinor: null,
        unitPriceMinor:
          priceMinor !== null && currency?.length === 3 ? priceMinor : null,
      },
      locale: "en-NL",
    },
  });
  return {
    metadata: {
      jsonLdDocumentCount: documents.length,
      schemaType: "Product",
    },
    suggestion,
  };
}

export async function extractPermittedProductPage(input: {
  allowedOrigin: string;
  browser: BrowserWorker;
  url: string;
}): Promise<BrowserExtraction> {
  if (!isResearchBrowserUrlAllowed(input.url, input.allowedOrigin)) {
    throw new Error("This URL is not on the Browser Run allowlist.");
  }
  const browser = await launch(input.browser);
  try {
    const page = await browser.newPage();
    await page.goto(input.url, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    if (!isResearchBrowserUrlAllowed(page.url(), input.allowedOrigin)) {
      throw new Error("The permitted page redirected outside the allowlist.");
    }
    const documents = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const extraction = suggestionFromJsonLd(documents, page.url());
    return {
      ...extraction,
      metadata: { ...extraction.metadata, finalUrl: page.url() },
    };
  } finally {
    await browser.close();
  }
}
