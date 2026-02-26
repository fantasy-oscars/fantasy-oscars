import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { hasSuperAdminAccess } from "../../auth/roles.js";
import { query } from "../../data/db.js";
import type { DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminSeasonDeleteRoutes(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/seasons/search",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = `%${q.toLowerCase()}%`;
        const { rows } = await query<{
          id: number;
          league_id: number;
          league_name: string;
          ceremony_name: string;
          ceremony_code: string | null;
        }>(
          client,
          `SELECT s.id::int,
                  s.league_id::int,
                  l.name AS league_name,
                  c.name AS ceremony_name,
                  c.code AS ceremony_code
           FROM season s
           JOIN league l ON l.id = s.league_id
           JOIN ceremony c ON c.id = s.ceremony_id
           ${q ? "WHERE LOWER(c.name) LIKE $1 OR LOWER(c.code) LIKE $1 OR LOWER(l.name) LIKE $1" : ""}
           ORDER BY s.created_at DESC
           LIMIT 500`,
          q ? [like] : []
        );
        return res.status(200).json({ seasons: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/seasons/:id/delete-preview",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid season id");
        }

        const { rows } = await query<{
          id: number;
          status: string;
          ceremony_name: string | null;
          ceremony_code: string | null;
          league_name: string | null;
        }>(
          client,
          `SELECT s.id::int,
                  s.status,
                  c.name AS ceremony_name,
                  c.code AS ceremony_code,
                  l.name AS league_name
           FROM season s
           JOIN ceremony c ON c.id = s.ceremony_id
           JOIN league l ON l.id = s.league_id
           WHERE s.id = $1`,
          [id]
        );

        const season = rows[0];
        if (!season) throw new AppError("NOT_FOUND", 404, "Season not found");

        return res.status(200).json({
          season,
          consequences: { seasons_removed: 1 }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/seasons/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        if (!hasSuperAdminAccess(req.auth)) {
          throw new AppError("FORBIDDEN", 403, "Super admin access required");
        }
        const id = Number(req.params.id);
        const actorId = Number(req.auth?.sub);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid season id");
        }
        if (!Number.isInteger(actorId) || actorId <= 0) {
          throw new AppError("UNAUTHORIZED", 401, "Missing auth token");
        }

        const { rows } = await query<{ id: number }>(
          client,
          `DELETE FROM season
           WHERE id = $1
           RETURNING id::int`,
          [id]
        );
        if (!rows[0]) throw new AppError("NOT_FOUND", 404, "Season not found");

        await insertAdminAudit(client as Pool, {
          actor_user_id: actorId,
          action: "delete_season",
          target_type: "season",
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
