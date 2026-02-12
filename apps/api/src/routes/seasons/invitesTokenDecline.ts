import express from "express";
import type { Router } from "express";
import { AppError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesTokenDeclineRoute(args: {
  router: Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, inviteClaimLimiter } = args;

  router.post(
    "/invites/token/:token/decline",
    inviteClaimLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const token = String(req.params.token ?? "").trim();
        const userId = Number(req.auth?.sub);
        if (!token || !userId) {
          throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        }
        // Decline is intentionally non-destructive for placeholder invites.
        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
