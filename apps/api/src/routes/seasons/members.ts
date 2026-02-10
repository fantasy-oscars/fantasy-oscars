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
  getSeasonMember,
  listSeasonMembers,
  removeSeasonMember,
  transferSeasonOwnership
} from "../../data/repositories/seasonMemberRepository.js";
import { getUserByUsername } from "./helpers.js";

export function registerSeasonMemberRoutes(args: {
  router: express.Router;
  client: DbClient;
}) {
  const { router, client } = args;

  async function ensureSeasonMember(
    db: DbClient,
    seasonId: number,
    leagueId: number,
    userId: number
  ) {
    const existing = await getSeasonMember(db, seasonId, userId);
    if (existing) return existing;

    const leagueMember = await getLeagueMember(db, leagueId, userId);
    if (!leagueMember) {
      // Keep 404 to avoid leaking season existence to non-members.
      throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
    }

    const inserted = await addSeasonMember(db, {
      season_id: seasonId,
      user_id: userId,
      league_member_id: leagueMember.id,
      role: leagueMember.role
    });
    if (inserted) return inserted;

    // Race / conflict: refetch.
    const refetched = await getSeasonMember(db, seasonId, userId);
    if (!refetched) {
      throw new AppError("INTERNAL_ERROR", 500, "Failed to join season");
    }
    return refetched;
  }

  router.get(
    "/:id/members",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        if (Number.isNaN(seasonId)) {
          throw validationError("Invalid season id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }

        // Early-MVP ergonomics: if the season_member row wasn't seeded, auto-join league members.
        await ensureSeasonMember(client, seasonId, season.league_id, userId);

        const members = await listSeasonMembers(client, seasonId);
        return res.json({ members });
      } catch (err) {
        next(err);
      }
    }
  );

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
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
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

  router.post(
    "/:id/transfer-ownership",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const targetUserId = Number(req.body?.user_id);
        if (Number.isNaN(seasonId) || !actorId || Number.isNaN(targetUserId)) {
          throw validationError("Invalid ids", ["id", "user_id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("OWNERSHIP_LOCKED", 409, "Season ownership is locked");
        }

        const actorMember = await getSeasonMember(client, seasonId, actorId);
        if (
          !actorMember ||
          (actorMember.role !== "OWNER" && actorMember.role !== "CO_OWNER")
        ) {
          throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
        }

        const ok = await transferSeasonOwnership(client, seasonId, targetUserId);
        if (!ok) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "User is not a season participant"
          );
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/leave",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const userId = Number(req.auth?.sub);
        if (Number.isNaN(seasonId) || !userId) {
          throw validationError("Invalid season id", ["id"]);
        }

        const season = await getSeasonById(client, seasonId);
        if (!season || season.status !== "EXTANT") {
          throw new AppError("SEASON_NOT_FOUND", 404, "Season not found");
        }
        const draft = await getDraftBySeasonId(client, seasonId);
        const draftsStarted = Boolean(draft && draft.status !== "PENDING");
        if (draftsStarted) {
          throw new AppError("MEMBERSHIP_LOCKED", 409, "Season membership is locked");
        }

        const member = await getSeasonMember(client, seasonId, userId);
        if (!member)
          throw new AppError("SEASON_MEMBER_NOT_FOUND", 404, "Season member not found");
        if (member.role === "OWNER") {
          throw new AppError(
            "FORBIDDEN",
            403,
            "Owner cannot leave; transfer ownership or cancel season"
          );
        }

        await removeSeasonMember(client, seasonId, userId);

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}

