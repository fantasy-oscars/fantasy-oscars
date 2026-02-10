import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { updateUserInviteStatus } from "../../data/repositories/seasonInviteRepository.js";
import { sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesDeclineRoute(args: {
  router: Router;
  client: DbClient;
  inviteClaimLimiter: { middleware: express.RequestHandler };
}): void {
  const { router, client, inviteClaimLimiter } = args;

  router.post(
    "/invites/:inviteId/decline",
    inviteClaimLimiter.middleware,
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const inviteId = Number(req.params.inviteId);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(inviteId) || !userId) {
          throw validationError("Invalid invite id", ["inviteId"]);
        }

        const updated = await updateUserInviteStatus(client, inviteId, userId, "DECLINED", new Date());
        if (!updated) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );
}

