import {
  collectionBriefInputSchema,
  conceptInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";

import { jsonContractValidator } from "./contract-validation";
import { deleteAllConceptMedia } from "./concept-media-service";
import {
  readCollectionBrief,
  readConcept,
  removeConcept,
  saveCollectionBrief,
  saveConcept,
} from "./collection-direction-service";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const collectionDirectionRoutes = new Hono<WorkerAppEnv>()
  .use("*", async (context, next) => {
    context.header("cache-control", "no-store");
    await next();
  })
  .get("/collections/:collectionId/brief", requireSession, async (context) => {
    const current = context.get("session");
    const result = await readCollectionBrief({
      collectionId: requiredIdentifier(
        context.req.param("collectionId"),
        "collectionId",
      ),
      database: context.env.DB,
      userId: current.user.id,
    });
    return context.json({
      brief: result.brief,
      permissions: { canEdit: result.canEdit },
    });
  })
  .put(
    "/collections/:collectionId/brief",
    requireTrustedOrigin,
    requireSession,
    jsonContractValidator(collectionBriefInputSchema),
    async (context) => {
      const current = context.get("session");
      const brief = await saveCollectionBrief({
        collectionId: requiredIdentifier(
          context.req.param("collectionId"),
          "collectionId",
        ),
        database: context.env.DB,
        userId: current.user.id,
        value: context.req.valid("json"),
      });
      return context.json({ brief, permissions: { canEdit: true } });
    },
  )
  .get(
    "/collections/:collectionId/concept",
    requireSession,
    async (context) => {
      const current = context.get("session");
      const result = await readConcept({
        collectionId: requiredIdentifier(
          context.req.param("collectionId"),
          "collectionId",
        ),
        database: context.env.DB,
        userId: current.user.id,
      });
      return context.json({
        concept: result.concept,
        permissions: { canEdit: result.canEdit },
      });
    },
  )
  .put(
    "/collections/:collectionId/concept",
    requireTrustedOrigin,
    requireSession,
    jsonContractValidator(conceptInputSchema),
    async (context) => {
      const current = context.get("session");
      const concept = await saveConcept({
        collectionId: requiredIdentifier(
          context.req.param("collectionId"),
          "collectionId",
        ),
        database: context.env.DB,
        userId: current.user.id,
        value: context.req.valid("json"),
      });
      return context.json({ concept, permissions: { canEdit: true } });
    },
  )
  .delete(
    "/collections/:collectionId/concept",
    requireTrustedOrigin,
    requireSession,
    async (context) => {
      const current = context.get("session");
      const removedConceptId = await removeConcept({
        collectionId: requiredIdentifier(
          context.req.param("collectionId"),
          "collectionId",
        ),
        database: context.env.DB,
        userId: current.user.id,
      });
      if (removedConceptId !== null) {
        await deleteAllConceptMedia({
          bucket: context.env.CONCEPT_MEDIA,
          conceptId: removedConceptId,
          database: context.env.DB,
          userId: current.user.id,
        });
      }
      return context.json({ concept: null, permissions: { canEdit: true } });
    },
  );

export type CollectionDirectionRoutes = typeof collectionDirectionRoutes;
