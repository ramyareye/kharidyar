import { floorPlanDetailsSchema, floorPlanLimits } from "@kharidyar/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { requiredIdentifier } from "./request-validation";
import { requireSession, type WorkerAppEnv } from "./session-middleware";
import {
  readFloorPlans,
  uploadFloorPlan,
  updateFloorPlan,
  deleteFloorPlan,
  readFloorPlanContent,
} from "./floor-plan-service";

export const floorPlanRoutes = new Hono<WorkerAppEnv>()
  .get("/collections/:collectionId/floor-plans", requireSession, async (c) =>
    c.json(
      await readFloorPlans({
        database: c.env.DB,
        bucket: c.env.CONCEPT_MEDIA,
        userId: c.get("session").user.id,
        collectionId: requiredIdentifier(
          c.req.param("collectionId"),
          "collectionId",
        ),
      }),
    ),
  )
  .post(
    "/collections/:collectionId/floor-plans",
    requireTrustedOrigin,
    requireSession,
    bodyLimit({
      maxSize: floorPlanLimits.maxFileBytes + 20_000,
      onError: (c) =>
        c.json(
          {
            error: {
              code: "MEDIA_LIMIT_EXCEEDED",
              message: "The upload is too large.",
            },
          },
          413,
        ),
    }),
    async (c) =>
      c.json(
        await uploadFloorPlan({
          database: c.env.DB,
          bucket: c.env.CONCEPT_MEDIA,
          images: c.env.IMAGES,
          rateLimitSecret: c.env.BETTER_AUTH_SECRET,
          userId: c.get("session").user.id,
          collectionId: requiredIdentifier(
            c.req.param("collectionId"),
            "collectionId",
          ),
          request: c.req.raw,
        }),
        201,
      ),
  )
  .get(
    "/collections/:collectionId/floor-plans/:planId/content",
    requireSession,
    (c) =>
      readFloorPlanContent({
        database: c.env.DB,
        bucket: c.env.CONCEPT_MEDIA,
        userId: c.get("session").user.id,
        collectionId: requiredIdentifier(
          c.req.param("collectionId"),
          "collectionId",
        ),
        planId: requiredIdentifier(c.req.param("planId"), "planId"),
      }),
  )
  .patch(
    "/collections/:collectionId/floor-plans/:planId",
    requireTrustedOrigin,
    requireSession,
    jsonContractValidator(floorPlanDetailsSchema),
    async (c) =>
      c.json({
        plan: await updateFloorPlan({
          database: c.env.DB,
          userId: c.get("session").user.id,
          collectionId: requiredIdentifier(
            c.req.param("collectionId"),
            "collectionId",
          ),
          planId: requiredIdentifier(c.req.param("planId"), "planId"),
          value: c.req.valid("json"),
        }),
      }),
  )
  .delete(
    "/collections/:collectionId/floor-plans/:planId",
    requireTrustedOrigin,
    requireSession,
    async (c) =>
      c.json(
        await deleteFloorPlan({
          database: c.env.DB,
          bucket: c.env.CONCEPT_MEDIA,
          userId: c.get("session").user.id,
          collectionId: requiredIdentifier(
            c.req.param("collectionId"),
            "collectionId",
          ),
          planId: requiredIdentifier(c.req.param("planId"), "planId"),
        }),
      ),
  );
