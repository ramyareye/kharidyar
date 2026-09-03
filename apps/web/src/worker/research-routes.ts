import {
  researchRequestCreateInputSchema,
  researchResultModerationInputSchema,
  researchResultPromotionInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

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
    jsonContractValidator(researchRequestCreateInputSchema),
    async (context) => {
      const current = context.get("session");
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
      return context.json(
        await retryResearchRequest({
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
