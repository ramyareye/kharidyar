import {
  researchProviderSearchOutputSchema,
  type ResearchConstraints,
  type ResearchProviderSearchOutput,
} from "@kharidyar/contracts";

export const researchProviderId = "tavily-basic-v1" as const;

export class ResearchProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ResearchProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ResearchSearchInput {
  constraints: ResearchConstraints;
  query: string;
}

export interface ResearchSearchProvider {
  readonly id: typeof researchProviderId;
  search(input: ResearchSearchInput): Promise<ResearchProviderSearchOutput>;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function providerQuery(input: ResearchSearchInput): string {
  const parts = [input.query.trim()];
  for (const term of input.constraints.requiredTerms) {
    parts.push(`"${term.replaceAll('"', "").trim()}"`);
  }
  for (const term of input.constraints.excludedTerms) {
    parts.push(`-${term.replaceAll(/\s+/gu, "-").trim()}`);
  }
  if (input.constraints.maxUnitPriceMinor !== null) {
    parts.push(
      `under €${(input.constraints.maxUnitPriceMinor / 100).toFixed(2)}`,
    );
  }
  return parts.join(" ").slice(0, 2_000);
}

export function buildResearchProviderQuery(input: ResearchSearchInput): string {
  return providerQuery(input);
}

function responseMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail.slice(0, 500);
  if (typeof record.error === "string") return record.error.slice(0, 500);
  if (typeof record.detail === "object" && record.detail !== null) {
    const error = (record.detail as Record<string, unknown>).error;
    if (typeof error === "string") return error.slice(0, 500);
  }
  return null;
}

function normalizedResult(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.url !== "string") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  url.hash = "";
  const title = record.title.trim().slice(0, 240);
  if (!title) return null;
  const content =
    typeof record.content === "string"
      ? record.content.trim().slice(0, 4_000) || null
      : null;
  const score =
    typeof record.score === "number" &&
    Number.isFinite(record.score) &&
    record.score >= 0 &&
    record.score <= 1
      ? record.score
      : null;
  return { content, score, title, url: url.toString() };
}

export function createTavilySearchProvider(input: {
  apiKey: string;
  fetcher?: Fetcher;
}): ResearchSearchProvider {
  const fetcher = input.fetcher ?? fetch;
  return {
    id: researchProviderId,
    async search(value) {
      if (!input.apiKey.trim()) {
        throw new ResearchProviderError(
          "provider_not_configured",
          "Live research is not configured yet.",
          false,
        );
      }
      const response = await fetcher("https://api.tavily.com/search", {
        body: JSON.stringify({
          auto_parameters: false,
          country: "netherlands",
          exclude_domains: [],
          include_answer: false,
          include_domains: value.constraints.preferredDomains,
          include_favicon: false,
          include_images: false,
          include_raw_content: false,
          include_usage: false,
          max_results: 5,
          query: providerQuery(value),
          safe_search: true,
          search_depth: "basic",
          topic: "general",
        }),
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ResearchProviderError(
          `provider_http_${response.status}`,
          responseMessage(body) ?? "The search provider rejected the request.",
          response.status === 429 || response.status >= 500,
        );
      }
      if (typeof body !== "object" || body === null) {
        throw new ResearchProviderError(
          "provider_invalid_response",
          "The search provider returned an unreadable response.",
          false,
        );
      }
      const record = body as Record<string, unknown>;
      const rawResults = Array.isArray(record.results) ? record.results : [];
      const seen = new Set<string>();
      const results = [];
      for (const raw of rawResults) {
        const normalized = normalizedResult(raw);
        if (normalized === null || seen.has(normalized.url)) continue;
        seen.add(normalized.url);
        results.push(normalized);
        if (results.length === 5) break;
      }
      return researchProviderSearchOutputSchema.parse({
        providerRequestId:
          typeof record.request_id === "string"
            ? record.request_id.slice(0, 200)
            : null,
        results,
      });
    },
  };
}
