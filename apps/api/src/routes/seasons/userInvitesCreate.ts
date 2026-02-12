import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { createUserTargetedInvite } from "../../data/repositories/seasonInviteRepository.js";
import {
  ensureCommissioner,
  getUserById,
  getUserByUsername,
  sanitizeInvite
} from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonUserInvitesCreateRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/:id/user-invites",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const { user_id, username } = req.body ?? {};
        const targetUserId =
          user_id === undefined || user_id === null ? NaN : Number(user_id);
        const usernameStr = typeof username === "string" ? username : null;
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid payload", ["id"]);
        }

        let resolvedUserId: number | null = Number.isFinite(targetUserId)
          ? targetUserId
          : null;
        if (!resolvedUserId && usernameStr) {
          const u = await getUserByUsername(client, usernameStr);
          if (!u) throw new AppError("USER_NOT_FOUND", 404, "User not found");
          resolvedUserId = Number(u.id);
        }
        if (!resolvedUserId) {
          throw validationError("Missing required fields", ["user_id", "username"]);
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

        const actorSeasonMember = await getSeasonMember(client, seasonId, actorId);
        const actorLeagueMember = actorSeasonMember
          ? null
          : await getLeagueMember(client, season.league_id, actorId);
        ensureCommissioner(actorSeasonMember ?? actorLeagueMember);

        const targetUser = await getUserById(client, resolvedUserId);
        if (!targetUser) {
          throw new AppError("USER_NOT_FOUND", 404, "User not found");
        }

        const existingMember = await getSeasonMember(client, seasonId, resolvedUserId);
        if (existingMember) {
          throw new AppError(
            "USER_ALREADY_MEMBER",
            409,
            "That user is already in this season."
          );
        }

        const { invite, created } = await createUserTargetedInvite(client, {
          season_id: seasonId,
          intended_user_id: resolvedUserId,
          created_by_user_id: actorId
        });

        return res.status(created ? 201 : 200).json({ invite: sanitizeInvite(invite) });
      } catch (err) {
        next(err);
      }
    }
  );
}
