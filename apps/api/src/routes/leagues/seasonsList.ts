import type express from "express";
import { idParam, includeCancelledQuerySchema } from "@fantasy-oscars/shared/schemas";
import { AppError } from "../../errors.js";
import { parseParams, parseQuery } from "../../utils/validate.js";
import { requireAuth, type AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";
import type { DbClient } from "../../data/db.js";
import {
  getLeagueById,
  getLeagueMember
} from "../../data/repositories/leagueRepository.js";
import { listSeasonsForLeague } from "../../data/repositories/seasonRepository.js";

export function registerLeagueSeasonsListRoute(args: {
  router: express.Router;
  client: DbClient;
  authSecret: string;
}): void {
  const { router, client, authSecret } = args;

  router.get(
    "/:id/seasons",
    requireAuth(authSecret),
    async (req: AuthedRequest, res, next) => {
      try {
        const { id: leagueId } = parseParams(idParam, req.params, {
          message: "That link doesn't look right"
        });
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const league = await getLeagueById(client, leagueId);
        if (!league) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");

        const isSuperAdmin = hasSuperAdminAccess(req.auth);
        if (!isSuperAdmin) {
          const member = await getLeagueMember(client, leagueId, userId);
          if (!member) throw new AppError("LEAGUE_NOT_FOUND", 404, "League not found");
        }

        const { include_cancelled } = parseQuery(includeCancelledQuerySchema, req.query);
        const includeCancelled =
          include_cancelled && (req.auth as { is_admin?: boolean })?.is_admin === true;
        const seasons = await listSeasonsForLeague(client, leagueId, {
          includeCancelled
        });

        const response = seasons.map((s) => ({
          id: s.id,
          league_id: s.league_id,
          ceremony_id: s.ceremony_id,
          ceremony_name: s.ceremony_name ?? null,
          ceremony_code: s.ceremony_code ?? null,
          status: s.status,
          scoring_strategy_name: s.scoring_strategy_name,
          category_weights:
            (s as { category_weights?: unknown }).category_weights ?? null,
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

        return res.status(200).json({ seasons: response });
      } catch (err) {
        next(err);
      }
    }
  );
}
