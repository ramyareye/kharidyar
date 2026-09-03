import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  researchWorkflowParamsSchema,
  type ResearchProviderSearchOutput,
  type ResearchWorkflowParams,
} from "@kharidyar/contracts";

import { extractPermittedProductPage } from "./research-browser";
import {
  createTavilySearchProvider,
  ResearchProviderError,
} from "./research-provider";
import {
  completeResearchRun,
  failResearchRun,
  loadResearchExecution,
  persistResearchExtractions,
  persistResearchSearchResults,
  type ResearchExtractionUpdate,
} from "./research-service";

type ProviderStepResult =
  | { ok: true; output: ResearchProviderSearchOutput }
  | { code: string; message: string; ok: false };

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 1_000) || "Unknown research failure."
    : "Unknown research failure.";
}

export class ResearchWorkflow extends WorkflowEntrypoint<
  Env,
  ResearchWorkflowParams
> {
  async run(event: WorkflowEvent<ResearchWorkflowParams>, step: WorkflowStep) {
    const params = researchWorkflowParamsSchema.parse(event.payload);
    try {
      const execution = await step.do("load-research-run", () =>
        loadResearchExecution({
          database: this.env.DB,
          requestId: params.requestId,
          runId: params.runId,
        }),
      );
      if (execution === null) {
        return { runId: params.runId, status: "cancelled" as const };
      }

      const providerResult = await step.do<ProviderStepResult>(
        "search-provider",
        {
          retries: {
            backoff: "exponential",
            delay: "5 seconds",
            limit: 2,
          },
          timeout: "30 seconds",
        },
        async () => {
          try {
            return {
              ok: true,
              output: await createTavilySearchProvider({
                apiKey: this.env.TAVILY_API_KEY,
              }).search({
                constraints: execution.constraints,
                query: execution.query,
              }),
            };
          } catch (error) {
            if (error instanceof ResearchProviderError && !error.retryable) {
              return {
                code: error.code,
                message: error.message,
                ok: false,
              };
            }
            throw error;
          }
        },
      );
      if (!providerResult.ok) {
        await step.do("record-provider-failure", () =>
          failResearchRun({
            code: providerResult.code,
            database: this.env.DB,
            message: providerResult.message,
            runId: params.runId,
          }),
        );
        return { runId: params.runId, status: "failed" as const };
      }

      const stored = await step.do("persist-search-results", () =>
        persistResearchSearchResults({
          allowedOrigin: this.env.RESEARCH_BROWSER_ALLOWED_ORIGIN,
          database: this.env.DB,
          execution,
          output: providerResult.output,
        }),
      );
      const stillActive = await step.do("confirm-run-active", () =>
        loadResearchExecution({
          database: this.env.DB,
          requestId: params.requestId,
          runId: params.runId,
        }),
      );
      if (stillActive === null) {
        return { runId: params.runId, status: "cancelled" as const };
      }

      const extractions = await step.do<ResearchExtractionUpdate[]>(
        "extract-permitted-pages",
        { retries: { delay: "5 seconds", limit: 1 }, timeout: "2 minutes" },
        async () => {
          const updates: ResearchExtractionUpdate[] = [];
          for (const result of stored.filter(
            ({ browserExtractionAllowed }) => browserExtractionAllowed,
          )) {
            try {
              const extracted = await extractPermittedProductPage({
                allowedOrigin: this.env.RESEARCH_BROWSER_ALLOWED_ORIGIN,
                browser: this.env.BROWSER,
                url: result.url,
              });
              updates.push({
                metadata: extracted.metadata,
                resultId: result.resultId,
                sourceId: result.sourceId,
                status: "completed",
                suggestion: extracted.suggestion,
              });
            } catch (error) {
              updates.push({
                metadata: { error: messageFrom(error) },
                resultId: result.resultId,
                sourceId: result.sourceId,
                status: "failed",
              });
            }
          }
          return updates;
        },
      );
      await step.do("persist-page-extractions", () =>
        persistResearchExtractions({
          database: this.env.DB,
          runId: params.runId,
          updates: extractions,
        }),
      );
      await step.do("complete-research-run", () =>
        completeResearchRun(this.env.DB, params.runId),
      );
      return {
        resultCount: stored.length,
        runId: params.runId,
        status: "completed" as const,
      };
    } catch (error) {
      try {
        await step.do("record-unexpected-failure", () =>
          failResearchRun({
            code: "workflow_failed",
            database: this.env.DB,
            message: messageFrom(error),
            runId: params.runId,
          }),
        );
      } catch (recordingError) {
        console.error(
          JSON.stringify({
            error: messageFrom(recordingError),
            message: "research_failure_recording_failed",
            runId: params.runId,
          }),
        );
      }
      return { runId: params.runId, status: "failed" as const };
    }
  }
}
