import express from "express";
import type { Router } from "express";
import { AppError } from "../../errors.js";
import { query } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import { listPendingUserInvitesForUser } from "../../data/repositories/seasonInviteRepository.js";
import { sanitizeInvite } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInvitesInboxRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/invites/inbox",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const userId = Number(req.auth?.sub);
        if (!userId) throw new AppError("UNAUTHORIZED", 401, "Missing auth token");

        const invites = await listPendingUserInvitesForUser(client, userId);
        const seasonIds = invites.map((i) => i.season_id);
        const metaRows: Array<{
          season_id: number;
          league_id: number;
          league_name: string;
          ceremony_id: number;
        }> =
          seasonIds.length === 0
            ? []
            : (
                await query<{
                  season_id: number;
                  league_id: number;
                  league_name: string;
                  ceremony_id: number;
                }>(
                  client,
                  `SELECT s.id AS season_id,
                          s.league_id,
                          l.name AS league_name,
                          s.ceremony_id
                   FROM season s
                   JOIN league l ON l.id = s.league_id
                   WHERE s.id = ANY($1::bigint[])`,
                  [seasonIds]
                )
              ).rows;
        const metaMap = new Map(metaRows.map((m) => [Number(m.season_id), m]));
        const response = invites.map((invite) => {
          const m = metaMap.get(invite.season_id);
          return {
            ...sanitizeInvite(invite),
            league_id: m?.league_id ? Number(m.league_id) : null,
            league_name: m?.league_name ?? null,
            ceremony_id: m?.ceremony_id ? Number(m.ceremony_id) : null
          };
        });

        return res.json({ invites: response });
      } catch (err) {
        next(err);
      }
    }
  );
}

