import express from "express";
import type { Router } from "express";
import { AppError, validationError } from "../../errors.js";
import type { DbClient } from "../../data/db.js";
import { query } from "../../data/db.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";
import { getLeagueMember } from "../../data/repositories/leagueRepository.js";
import { getDraftBySeasonId } from "../../data/repositories/draftRepository.js";
import { getSeasonById } from "../../data/repositories/seasonRepository.js";
import { getSeasonMember } from "../../data/repositories/seasonMemberRepository.js";
import { ensureCommissioner } from "./helpers.js";
import type { AuthedRequest } from "../../auth/middleware.js";

export function registerSeasonInviteesSearchRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  // Commissioner helper: search users to invite to a season.
  // Used by the season "Manage invites" UI combobox.
  router.get(
    "/:id/invitees",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const seasonId = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const q = normalizeForSearch(qRaw);
        if (Number.isNaN(seasonId) || !actorId) {
          throw validationError("Invalid season id", ["id"]);
        }
        if (!q) return res.status(200).json({ users: [] });

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

        const likeRaw = `%${escapeLike(qRaw)}%`;
        const likeNorm = `%${escapeLike(q)}%`;
        const { rows } = await query<{
          id: number;
          username: string;
        }>(
          client,
          `
            SELECT u.id::int, u.username
            FROM app_user u
            WHERE (
                u.username ILIKE $1 ESCAPE '\\'
                OR ${sqlNorm("u.username")} LIKE $2 ESCAPE '\\'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM season_member sm
                WHERE sm.season_id = $3
                  AND sm.user_id = u.id
              )
            ORDER BY u.created_at DESC
            LIMIT 25
          `,
          [likeRaw, likeNorm, seasonId]
        );

        return res.status(200).json({ users: rows });
      } catch (err) {
        next(err);
      }
    }
  );
}
