import express from "express";
import type { Router } from "express";
import { AppError } from "../../errors.js";
import { inviteIdParam } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";
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
        const { inviteId } = parseParams(inviteIdParam, req.params, {
          message: "That link doesn't look right"
        });
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const updated = await updateUserInviteStatus(
          client,
          inviteId,
          userId,
          "DECLINED",
          new Date()
        );
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
