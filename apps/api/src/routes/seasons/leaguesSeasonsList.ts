import type express from "express";
import { AppError, validationError } from "../../errors.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";
import type { DbClient } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { listSeasonsForLeague } from "../../data/repositories/seasonRepository.js";

export function registerSeasonsLeaguesSeasonsListRoute(args: {
  router: express.Router;
  client: DbClient;
}): void {
  const { router, client } = args;

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

        const isSuperAdmin = hasSuperAdminAccess(req.auth);
        if (!isSuperAdmin) {
          const member = await getLeagueMember(client, leagueId, userId);
          if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }

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
}
