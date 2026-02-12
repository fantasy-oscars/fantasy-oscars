import type express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember,
  createLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import {
  addSeasonMember,
  countSeasonMembers,
  getSeasonMember
} from "../../data/repositories/seasonMemberRepository.js";
import { getUserByUsername } from "./helpers.js";

export function registerSeasonMembersAddRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/members",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const { user_id, username } = req.body ?? {};
        const userId = user_id === undefined || user_id === null ? NaN : Number(user_id);
        const usernameStr = typeof username === "string" ? username : null;
        const actorId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid payload", ["id"]);
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

        const league = await getLeagueById(client, season.league_id);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const currentCount = await countSeasonMembers(client, seasonId);
        if (currentCount >= 50) {
          throw new AppError("MEMBERSHIP_FULL", 409, "Season participant cap reached");
        }

        let resolvedUserId: number | null = Number.isFinite(userId) ? userId : null;
        if (!resolvedUserId && usernameStr) {
          const user = await getUserByUsername(client, usernameStr);
          if (!user) throw new AppError("USER_NOT_FOUND", 404, "User not found");
          resolvedUserId = Number(user.id);
        }
        if (!resolvedUserId) {
          throw validationError("Missing required fields", ["user_id", "username"]);
        }

        // Season membership implies league membership (not the other way around).
        // If the target user isn't yet a league member, create that membership automatically.
        let leagueMember = await getLeagueMember(
          client,
          season.league_id,
          resolvedUserId
        );
        if (!leagueMember) {
          leagueMember = await createLeagueMember(client, {
            league_id: season.league_id,
            user_id: resolvedUserId,
            role: "MEMBER"
          });
        }

        const added = await addSeasonMember(client, {
          season_id: seasonId,
          user_id: resolvedUserId,
          league_member_id: leagueMember.id,
          role: "MEMBER"
        });
        if (!added) {
          throw new AppError(
            "ALREADY_MEMBER",
            409,
            "User is already a season participant"
          );
        }

        return res.status(201).json({ member: added });
      } catch (err) {
        next(err);
      }
    }
  );
}
