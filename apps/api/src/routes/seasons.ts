import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../errors.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import {
  getLeagueById,
  getLeagueMember
} from "../data/repositories/leagueRepository.js";
import {
  createSeason,
  getExtantSeasonForLeague,
  getMostRecentSeason,
  listSeasonsForLeague
} from "../data/repositories/seasonRepository.js";
import { runInTransaction, query } from "../data/db.js";
import type { DbClient } from "../data/db.js";
import type { Pool } from "pg";
import { createRateLimitGuard } from "../utils/rateLimitMiddleware.js";
import { registerSeasonInviteRoutes } from "./seasons/invites.js";
import { registerSeasonPublicRoutes } from "./seasons/public.js";
import { registerSeasonSettingsRoutes } from "./seasons/settings.js";
import { registerSeasonMemberRoutes } from "./seasons/members.js";

export function createSeasonsRouter(client: DbClient, authSecret: string): Router {
  const router = express.Router();

  router.use(requireAuth(authSecret));

  const inviteClaimLimiter = createRateLimitGuard({
    windowMs: 60_000,
    max: 10,
    key: (req) => req.ip ?? "unknown"
  });

  const publicSeasonJoinLimiter = createRateLimitGuard({
    windowMs: 5 * 60_000,
    max: 8,
    key: (req) => req.ip ?? "unknown"
  });

  registerSeasonInviteRoutes({ router, client, inviteClaimLimiter });
  registerSeasonPublicRoutes({ router, client, publicSeasonJoinLimiter });
  registerSeasonSettingsRoutes({ router, client });
  registerSeasonMemberRoutes({ router, client });

  // public season routes registered above

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
          `SELECT status FROM ceremony WHERE id = $1`,
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

  router.get(
    "/leagues/:id/seasons",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const leagueId = Number(req.params.id);
        if (Number.isNaN(leagueId)) {
          throw validationError("Invalid league id", ["id"]);
        }
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const member = await getLeagueMember(client, leagueId, userId);
        if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const includeCancelled =
          req.query.include_cancelled === "true" &&
          (req.auth as { is_admin?: boolean })?.is_admin === true;
        const seasons = await listSeasonsForLeague(client, leagueId, {
          includeCancelled
        });
        const response = seasons.map((s) => ({
          id: s.id,
          ceremony_id: s.ceremony_id,
          ceremony_name: s.ceremony_name ?? null,
          status: s.status,
          scoring_strategy_name: s.scoring_strategy_name,
          remainder_strategy: s.remainder_strategy,
          pick_timer_seconds: s.pick_timer_seconds ?? null,
          auto_pick_strategy: s.auto_pick_strategy ?? null,
          created_at: s.created_at,
          ceremony_starts_at: s.ceremony_starts_at ?? null,
          draft_id: s.draft_id ?? null,
          draft_status: s.draft_status ?? null,
          is_active_ceremony: s.ceremony_status
            ? ["PUBLISHED", "LOCKED", "COMPLETE"].includes(
                String(s.ceremony_status).toUpperCase()
              )
            : false
        }));
        return res.json({ seasons: response });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
