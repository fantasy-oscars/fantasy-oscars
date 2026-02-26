import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";
import { query } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminLeagueDeleteRoutes(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

  router.get(
    "/leagues/search",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = `%${q.toLowerCase()}%`;
        const { rows } = await query<{ id: number; name: string; code: string }>(
          client,
          `SELECT id::int, name, code
           FROM league
           ${q ? "WHERE LOWER(name) LIKE $1 OR LOWER(code) LIKE $1" : ""}
           ORDER BY created_at DESC
           LIMIT 500`,
          q ? [like] : []
        );
        return res.status(200).json({ leagues: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/leagues/:id/delete-preview",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid league id");
        }

        const { rows: leagueRows } = await query<{ id: number; name: string }>(
          client,
          `SELECT id::int, name
           FROM league
           WHERE id = $1`,
          [id]
        );
        const league = leagueRows[0];
        if (!league) throw new AppError("NOT_FOUND", 404, "League not found");

        const { rows: countRows } = await query<{ seasons_removed: number }>(
          client,
          `SELECT COUNT(*)::int AS seasons_removed
           FROM season
           WHERE league_id = $1`,
          [id]
        );

        return res.status(200).json({
          league,
          consequences: {
            seasons_removed: Number(countRows[0]?.seasons_removed ?? 0)
          }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/leagues/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const id = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid league id");
        }
        if (!Number.isInteger(actorId) || actorId <= 0) {
          throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        }

        const { rows } = await query<{ id: number }>(
          client,
          `DELETE FROM league
           WHERE id = $1
           RETURNING id::int`,
          [id]
        );
        if (!rows[0]) throw new AppError("NOT_FOUND", 404, "League not found");

        await insertAdminAudit(client as Pool, {
          actor_user_id: actorId,
          action: "delete_league",
          target_type: "league",
          target_id: id,
          meta: {}
        });

        return res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
}
