import type express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import type { DbClient } from "../../data/db.js";
import { getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import {
  addSeasonMember,
  getSeasonMember,
  listSeasonMembers
} from "../../data/repositories/seasonMemberRepository.js";

export function registerSeasonMembersListRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
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
}
