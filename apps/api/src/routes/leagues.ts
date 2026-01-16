import express from "express";
import { validationError, AppError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  createLeague,
  createLeagueMember,
  getLeagueById,
  getLeagueMember,
  countLeagueMembers
} from "../data/repositories/leagueRepository.js";
import { getDraftByLeagueId } from "../data/repositories/draftRepository.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import type { DbClient } from "../data/db.js";

export function createLeaguesRouter(client: DbClient, authSecret: string) {
  const router = express.Router();

  router.post("/", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const { code, name, ceremony_id, max_members, roster_size, is_public } =
        req.body ?? {};
      const creator = req.auth;
      if (!creator?.sub) {
        throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
      }

      if (!code || !name || !ceremony_id || !max_members || !roster_size) {
        throw validationError("Missing required fields", [
          "code",
          "name",
          "ceremony_id",
          "max_members",
          "roster_size"
        ]);
      }

      const activeCeremonyId = await getActiveCeremonyId(client);
      if (!activeCeremonyId) {
        throw new AppError(
          "ACTIVE_CEREMONY_NOT_SET",
          409,
          "Active ceremony is not configured"
        );
      }
      if (Number(ceremony_id) !== Number(activeCeremonyId)) {
        throw new AppError(
          "CEREMONY_INACTIVE",
          409,
          "Leagues can only be created for the active ceremony"
        );
      }

      const league = await createLeague(client, {
        code: String(code),
        name: String(name),
        ceremony_id: Number(ceremony_id),
        max_members: Number(max_members),
        roster_size: Number(roster_size),
        is_public: Boolean(is_public),
        created_by_user_id: Number(creator.sub)
      });

      return res.status(201).json({ league });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", requireAuth(authSecret), async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        throw validationError("Invalid league id", ["id"]);
      }
      const league = await getLeagueById(client, id);
      if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
      return res.json({ league });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/join",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const activeCeremonyId = await getActiveCeremonyId(client);
        if (!activeCeremonyId) {
          throw new AppError(
            "ACTIVE_CEREMONY_NOT_SET",
            409,
            "Active ceremony is not configured"
          );
        }
        if (Number(league.ceremony_id) !== Number(activeCeremonyId)) {
          throw new AppError(
            "CEREMONY_INACTIVE",
            409,
            "This league is not in the active ceremony"
          );
        }

        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const draft = await getDraftByLeagueId(client, leagueId);
        if (draft && draft.status !== "PENDING") {
          throw new AppError("DRAFT_ALREADY_STARTED", 409, "Draft already started");
        }

        const existingMember = await getLeagueMember(client, leagueId, userId);
        if (existingMember) {
          return res.status(200).json({ member: existingMember });
        }

        const memberCount = await countLeagueMembers(client, leagueId);
        const ownerMember = await getLeagueMember(
          client,
          leagueId,
          league.created_by_user_id
        );
        const occupiedSlots = memberCount + (ownerMember ? 0 : 1);

        if (occupiedSlots >= league.max_members) {
          throw new AppError("LEAGUE_FULL", 409, "League is full");
        }

        const member = await createLeagueMember(client, {
          league_id: leagueId,
          user_id: userId
        });
        return res.status(201).json({ member });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
