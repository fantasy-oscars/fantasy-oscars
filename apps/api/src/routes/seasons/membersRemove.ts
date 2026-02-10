import type express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonMember, removeSeasonMember } from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonMembersRemoveRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.delete(
    "/:id/members/:userId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || Number.isNaN(targetUserId)) {
          throw validationError("Invalid ids", ["id", "userId"]);
        }
        if (!actorId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("MEMBERSHIP_LOCKED", 409, "Season membership is locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (!actorMember || (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const targetMember = await getSeasonMember(client, seasonId, targetUserId);
        if (!targetMember) {
          throw new AppError("SEASON_MEMBER_NOT_FOUND", 404, "Season member not found");
        }
        if (targetMember.role === "OWNER") {
          throw new AppError(
            "FORBIDDEN",
            403,
            "Cannot remove the season owner; transfer ownership or cancel season"
          );
        }

        await removeSeasonMember(client, seasonId, targetUserId);

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}

