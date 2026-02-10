import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { updatePlaceholderInviteLabel } from "../../data/repositories/seasonInviteRepository.js";
import { ensureCommissioner, sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesUpdateRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.patch(
    "/:id/invites/:inviteId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const inviteId = Number(req.params.inviteId);
        const actorId = Number(req.auth?.sub);
        const { label } = req.body ?? {};
        if (Number.isNaN(seasonId) || Number.isNaN(inviteId) || !actorId) {
          throw validationError("Invalid ids", ["id", "inviteId"]);
        }
        if (label !== undefined && typeof label !== "string") {
          throw validationError("Invalid label", ["label"]);
        }

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

        const updated = await updatePlaceholderInviteLabel(client, seasonId, inviteId, label ?? null);
        if (!updated) {
          throw new AppError("INVITE_NOT_FOUND", 404, "Pending placeholder invite not found");
        }

        return res.status(200).json({ invite: sanitizeInvite(updated) });
      } catch (err) {
        next(err);
      }
    }
  );
}

