import express from "express";
import type { Router } from "express";
import { AppError } from "../../errors.js";
import { idAndInviteIdParams } from "@fantasy-oscars/shared/schemas";
import { parseParams } from "../../utils/validate.js";
import type { DbClient } from "../../data/db.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { revokePendingPlaceholderInvite } from "../../data/repositories/seasonInviteRepository.js";
import { ensureCommissioner, sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesRevokeRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/invites/:inviteId/revoke",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id: seasonId, inviteId } = parseParams(idAndInviteIdParams, req.params, {
          message: "That link doesn't look right",
          fields: ["id", "inviteId"]
        });
        const actorId = Number(req.auth?.sub);
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("INVITES_LOCKED", 409, "Season invites are locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        ensureCommissioner(actorMember);

        const revoked = await revokePendingPlaceholderInvite(client, seasonId, inviteId);
        if (!revoked) {
          throw new AppError(
            "INVITE_NOT_FOUND",
            404,
            "Pending placeholder invite not found"
          );
        }

        return res.status(200).json({ invite: sanitizeInvite(revoked) });
      } catch (err) {
        next(err);
      }
    }
  );
}
