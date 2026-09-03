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

function errorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9._-]{0,79}$/.test(error.name)
    ? error.name
    : "Error";
}

export class ResearchWorkflow extends WorkflowEntrypoint<
  Env,
  ResearchWorkflowParams
> {
  async run(event: WorkflowEvent<ResearchWorkflowParams>, step: WorkflowStep) {
    const params = researchWorkflowParamsSchema.parse(event.payload);
    let logScope: {
      actorId: string;
      collectionId: string;
      workspaceId: string;
    } | null = null;
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
      logScope = {
        actorId: execution.actorId,
        collectionId: execution.collectionId,
        workspaceId: execution.workspaceId,
      };

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
        await step.do("record-provider-failure", async () => {
          await failResearchRun({
            code: providerResult.code,
            database: this.env.DB,
            message: providerResult.message,
            runId: params.runId,
          });
          console.warn({
            event: "research_provider_failed",
            reasonCode: providerResult.code,
            actorId: execution.actorId,
            workspaceId: execution.workspaceId,
            collectionId: execution.collectionId,
            researchRequestId: params.requestId,
            researchRunId: params.runId,
          });
        });
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
      await step.do("complete-research-run", async () => {
        await completeResearchRun(this.env.DB, params.runId);
        console.info({
          event: "research_run_completed",
          resultCount: stored.length,
          actorId: execution.actorId,
          workspaceId: execution.workspaceId,
          collectionId: execution.collectionId,
          researchRequestId: params.requestId,
          researchRunId: params.runId,
        });
      });
      return {
        resultCount: stored.length,
        runId: params.runId,
        status: "completed" as const,
      };
    } catch (error) {
      try {
        await step.do("record-unexpected-failure", async () => {
          await failResearchRun({
            code: "workflow_failed",
            database: this.env.DB,
            message: messageFrom(error),
            runId: params.runId,
          });
          console.error({
            event: "research_workflow_failed",
            reasonCode: "workflow_failed",
            errorName: errorName(error),
            actorId: logScope?.actorId,
            workspaceId: logScope?.workspaceId,
            collectionId: logScope?.collectionId,
            researchRequestId: params.requestId,
            researchRunId: params.runId,
          });
        });
      } catch (recordingError) {
        console.error({
          event: "research_failure_recording_failed",
          reasonCode: "failure_recording_failed",
          errorName: errorName(recordingError),
          researchRequestId: params.requestId,
          researchRunId: params.runId,
        });
      }
      return { runId: params.runId, status: "failed" as const };
    }
  }
}
