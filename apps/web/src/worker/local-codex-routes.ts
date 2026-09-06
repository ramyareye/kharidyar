import {
  localCodexCompletionSchema,
  localCodexPairingInputSchema,
} from "@kharidyar/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  authenticateLocalRunner,
  createLocalPairing,
  disconnectLocalPairing,
  localCodexStatus,
  pairingResource,
} from "./local-codex-auth";
import {
  checkLocalLease,
  claimLocalJob,
  completeLocalJob,
} from "./local-codex-jobs";
import { jsonContractValidator } from "./contract-validation";
import { requireTrustedOrigin } from "./origin-middleware";
import { requireSession, type WorkerAppEnv } from "./session-middleware";

export const localCodexRoutes = new Hono<WorkerAppEnv>()
  .use(
    "/local-codex/*",
    bodyLimit({
      maxSize: 32_768,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    }),
    requireTrustedOrigin,
  )
  .get("/local-codex/pairings", requireSession, async (c) =>
    c.json(await localCodexStatus(c.env, c.get("session").user.id)),
  )
  .post(
    "/local-codex/pairings",
    requireSession,
    jsonContractValidator(localCodexPairingInputSchema),
    async (c) => {
      const current = c.get("session");
      return c.json(
        await createLocalPairing(
          c.env,
          current.user.id,
          current.session.id,
          c.req.valid("json").name,
        ),
        201,
      );
    },
  )
  .delete("/local-codex/pairings/:id", requireSession, async (c) => {
    await disconnectLocalPairing(
      c.env,
      c.get("session").user.id,
      c.req.param("id"),
    );
    return c.body(null, 204);
  })
  .post("/local-codex/claim", async (c) => {
    const pairing = await authenticateLocalRunner(c.env, c.req.raw);
    c.set("actorId", pairing.user_id);
    return c.json(await claimLocalJob(c.env, pairing));
  })
  .post("/local-codex/check", async (c) =>
    c.json({
      pairing: pairingResource(await authenticateLocalRunner(c.env, c.req.raw)),
    }),
  )
  .post(
    "/local-codex/jobs/:id/lease",
    jsonContractValidator(
      z.object({ leaseToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    ),
    async (c) => {
      await checkLocalLease(
        c.env,
        await authenticateLocalRunner(c.env, c.req.raw),
        c.req.param("id"),
        c.req.valid("json").leaseToken,
      );
      return c.json({ active: true });
    },
  )
  .post(
    "/local-codex/jobs/:id/complete",
    jsonContractValidator(localCodexCompletionSchema),
    async (c) =>
      c.json(
        await completeLocalJob(
          c.env,
          await authenticateLocalRunner(c.env, c.req.raw),
          c.req.param("id"),
          c.req.valid("json"),
        ),
      ),
  );
