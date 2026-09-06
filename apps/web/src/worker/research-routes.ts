import {
  researchRequestCreateInputSchema,
  researchResultModerationInputSchema,
  researchResultPromotionInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { badRequest } from "./api-errors";
import { prepareLocalRun, expireLocalJobs } from "./local-codex-jobs";

import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { refreshOfferFromPermittedSource } from "./research-offer-refresh-service";
import {
  cancelResearchRun,
  createResearchRequest,
  moderateResearchResult,
  promoteResearchResult,
  readResearchDesk,
  retryResearchRequest,
} from "./research-service";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

function identifier(value: string, field: string): string {
  return requiredIdentifier(value, field);
}

export const researchRoutes = new Hono<WorkerAppEnv>()
  .use("*", async (context, next) => {
    context.header("cache-control", "no-store");
    await next();
  })
  .get(
    "/collections/:collectionId/research",
    requireSession,
    async (context) => {
      const current = context.get("session");
      await expireLocalJobs(context.env.DB);
      return context.json(
        await readResearchDesk({
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          userId: current.user.id,
        }),
      );
    },
  )
  .post(
    "/collections/:collectionId/research-requests",
    requireTrustedOrigin,
    requireSession,
    bodyLimit({ maxSize: 16_384 }),
    jsonContractValidator(researchRequestCreateInputSchema),
    async (context) => {
      const current = context.get("session");
      await prepareLocalRun(
        context.env,
        current.user.id,
        context.req.valid("json"),
      );
      return context.json(
        await createResearchRequest({
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          rateLimitSecret: context.env.BETTER_AUTH_SECRET,
          userId: current.user.id,
          value: context.req.valid("json"),
          workflow: context.env.RESEARCH_WORKFLOW,
        }),
        201,
      );
    },
  )
  .post(
    "/collections/:collectionId/research-requests/:requestId/runs",
    requireTrustedOrigin,
    requireSession,
    async (context) => {
      const current = context.get("session");
      const parsedRunner = z
        .object({
          provider: z.enum(["tavily-basic-v1", "local-codex-v1"]).optional(),
          localPairingId: z.string().uuid().optional(),
        })
        .safeParse({
          provider: context.req.query("provider"),
          localPairingId: context.req.query("localPairingId"),
        });
      if (!parsedRunner.success)
        throw badRequest("Choose a valid research provider and pairing.");
      const runner = parsedRunner.data;
      if (!runner.provider) {
        const latest = await context.env.DB.prepare(
          "select provider from research_runs where request_id=? and collection_id=? order by created_at desc limit 1",
        )
          .bind(
            context.req.param("requestId"),
            context.req.param("collectionId"),
          )
          .first<{ provider: string }>();
        if (latest?.provider === "local-codex-v1")
          runner.provider = "local-codex-v1";
      }
      await prepareLocalRun(context.env, current.user.id, runner);
      return context.json(
        await retryResearchRequest({
          runner,
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          rateLimitSecret: context.env.BETTER_AUTH_SECRET,
          requestId: identifier(context.req.param("requestId"), "requestId"),
          userId: current.user.id,
          workflow: context.env.RESEARCH_WORKFLOW,
        }),
        201,
      );
    },
  )
  .post(
    "/collections/:collectionId/research-runs/:runId/cancel",
    requireTrustedOrigin,
    requireSession,
    async (context) => {
      const current = context.get("session");
      return context.json(
        await cancelResearchRun({
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          runId: identifier(context.req.param("runId"), "runId"),
          userId: current.user.id,
          workflow: context.env.RESEARCH_WORKFLOW,
        }),
      );
    },
  )
  .put(
    "/collections/:collectionId/research-results/:resultId/moderation",
    requireTrustedOrigin,
    requireSession,
    jsonContractValidator(researchResultModerationInputSchema),
    async (context) => {
      const current = context.get("session");
      return context.json(
        await moderateResearchResult({
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          dismissed: context.req.valid("json").dismissed,
          resultId: identifier(context.req.param("resultId"), "resultId"),
          userId: current.user.id,
        }),
      );
    },
  )
  .post(
    "/collections/:collectionId/research-results/:resultId/promote",
    requireTrustedOrigin,
    requireSession,
    jsonContractValidator(researchResultPromotionInputSchema),
    async (context) => {
      const current = context.get("session");
      return context.json(
        await promoteResearchResult({
          collectionId: identifier(
            context.req.param("collectionId"),
            "collectionId",
          ),
          database: context.env.DB,
          resultId: identifier(context.req.param("resultId"), "resultId"),
          userId: current.user.id,
          value: context.req.valid("json"),
        }),
      );
    },
  )
  .post(
    "/items/:itemId/candidates/:candidateId/offers/:offerId/refresh",
    requireTrustedOrigin,
    requireSession,
    async (context) => {
      const current = context.get("session");
      return context.json(
        await refreshOfferFromPermittedSource({
          allowedOrigin: context.env.RESEARCH_BROWSER_ALLOWED_ORIGIN,
          browser: context.env.BROWSER,
          candidateId: identifier(
            context.req.param("candidateId"),
            "candidateId",
          ),
          database: context.env.DB,
          itemId: identifier(context.req.param("itemId"), "itemId"),
          offerId: identifier(context.req.param("offerId"), "offerId"),
          userId: current.user.id,
        }),
      );
    },
  );

export type ResearchRoutes = typeof researchRoutes;
