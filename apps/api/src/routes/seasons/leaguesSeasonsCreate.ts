import type express from "express";
import type { Pool } from "pg";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { getActiveCeremonyId } from "../../data/repositories/appConfigRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import {
  createSeason,
  getExtantSeasonForLeague,
  getMostRecentSeason
} from "../../data/repositories/seasonRepository.js";
import { query, runInTransaction } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";

export function registerSeasonsLeaguesSeasonsCreateRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const ceremonyIdRaw = req.body?.ceremony_id;
        const ceremonyId =
          ceremonyIdRaw === undefined || ceremonyIdRaw === null
            ? null
            : Number(ceremonyIdRaw);

        // Back-compat: if no ceremony_id provided, fall back to the legacy single-active ceremony.
        const fallbackActiveCeremonyId = ceremonyId
          ? null
          : await getActiveCeremonyId(client);
        const chosenCeremonyId = ceremonyId ?? fallbackActiveCeremonyId;
        if (!chosenCeremonyId || Number.isNaN(Number(chosenCeremonyId))) {
          throw new AppError(
            "CEREMONY_REQUIRED",
            409,
            "Ceremony is required to create a season"
          );
        }

        const ceremonyIdNum = Number(chosenCeremonyId);
        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1 AND deleted_at IS NULL`,
          [ceremonyIdNum]
        );
        const ceremonyStatus = ceremonyRows[0]?.status;
        if (!ceremonyStatus) {
          throw new AppError("CEREMONY_NOT_FOUND", 404, "Ceremony not found");
        }
        if (ceremonyStatus === "LOCKED") {
          throw new AppError("CEREMONY_LOCKED", 409, "Ceremony is locked");
        }
        if (ceremonyStatus !== "PUBLISHED") {
          throw new AppError("CEREMONY_NOT_PUBLISHED", 409, "Ceremony is not published");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const league = await getLeagueById(tx, leagueId);
          if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

          const member = await getLeagueMember(tx, leagueId, userId);
          const isCommissioner =
            league.created_by_user_id === userId ||
            (member && (member.role === "OWNER" || member.role === "CO_OWNER"));
          if (!isCommissioner) {
            throw new AppError("FORBIDDEN", 403, "Commissioner permission required");
          }

          const existing = await getExtantSeasonForLeague(tx, leagueId);
          if (existing && existing.ceremony_id === ceremonyIdNum) {
            throw new AppError(
              "SEASON_EXISTS",
              409,
              "An active season already exists for this ceremony"
            );
          }

          const prior = await getMostRecentSeason(tx, leagueId);
          const season = await createSeason(tx, {
            league_id: leagueId,
            ceremony_id: ceremonyIdNum,
            status: "EXTANT"
          });

          // Ensure the creator is always a season commissioner for the season they create.
          await query(
            tx,
            `INSERT INTO season_member (season_id, user_id, league_member_id, role)
             VALUES ($1, $2, $3, 'OWNER')
             ON CONFLICT (season_id, user_id)
             DO UPDATE SET
               role = 'OWNER',
               league_member_id = COALESCE(EXCLUDED.league_member_id, season_member.league_member_id)`,
            [season.id, userId, member?.id ?? null]
          );

          // Participant seeding: league_member is season participation proxy; ensure at least commissioner present.
          if (!member) {
            // backfill commissioner membership if somehow missing
            // ownership is enforced in leagues routes; here keep non-fatal.
          }

          return { season, prior };
        });

        return res.status(201).json({ season: result.season });
      } catch (err) {
        next(err);
      }
    }
  );
}
