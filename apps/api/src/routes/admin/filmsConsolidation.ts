import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminFilmConsolidationRoutes(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.get(
    "/films/:id/consolidated",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }
        const pageRaw = Number(req.query.page);
        const pageSizeRaw = Number(req.query.page_size);
        const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const pageSize =
          Number.isInteger(pageSizeRaw) && pageSizeRaw > 0
            ? Math.min(pageSizeRaw, 100)
            : 8;
        const offset = (page - 1) * pageSize;

        const { rows: canonicalRows } = await query<{ id: number }>(
          client,
          `SELECT id::int FROM film WHERE id = $1`,
          [id]
        );
        if (!canonicalRows[0]) throw new AppError("NOT_FOUND", 404, "Film not found");

        const { rows } = await query<{
          id: number;
          title: string;
          release_year: number | null;
          tmdb_id: number | null;
          poster_url: string | null;
          is_nominated: boolean;
          total: number;
        }>(
          client,
          `WITH child_rows AS (
             SELECT
               f.id::int,
               f.title,
               f.release_year::int,
               f.tmdb_id::int,
               f.poster_url,
               EXISTS (
                 SELECT 1
                 FROM nomination n
                 LEFT JOIN song s ON s.id = n.song_id
                 LEFT JOIN performance p ON p.id = n.performance_id
                 WHERE n.status = 'ACTIVE'
                   AND COALESCE(n.film_id, s.film_id, p.film_id) = f.id
               ) AS is_nominated
             FROM film f
             WHERE f.consolidated_into_film_id = $1
           ),
           counted AS (
             SELECT COUNT(*)::int AS total FROM child_rows
           )
           SELECT
             c.id,
             c.title,
             c.release_year,
             c.tmdb_id,
             c.poster_url,
             c.is_nominated,
             counted.total::int AS total
           FROM child_rows c
           CROSS JOIN counted
           ORDER BY c.title ASC, c.release_year DESC NULLS LAST, c.id ASC
           LIMIT $2
           OFFSET $3`,
          [id, pageSize, offset]
        );
        const total = Number(rows[0]?.total ?? 0);
        const films = rows.map(({ total: _total, ...rest }) => rest);

        return res.status(200).json({
          films,
          total,
          page,
          page_size: pageSize
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/films/:canonicalId/consolidated/:filmId/decouple",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const canonicalId = Number(req.params.canonicalId);
        const filmId = Number(req.params.filmId);
        if (!Number.isInteger(canonicalId) || canonicalId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid canonical film id");
        }
        if (!Number.isInteger(filmId) || filmId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: existingRows } = await query<{ id: number }>(
            tx,
            `SELECT id::int
             FROM film
             WHERE id = $1
               AND consolidated_into_film_id = $2`,
            [filmId, canonicalId]
          );
          if (!existingRows[0]) {
            throw new AppError(
              "NOT_FOUND",
              404,
              "Consolidated film not found for that canonical record"
            );
          }

          const { rows } = await query(
            tx,
            `UPDATE film
             SET consolidated_into_film_id = NULL,
                 consolidated_at = NULL
             WHERE id = $1
             RETURNING id::int, title`,
            [filmId]
          );
          return rows[0];
        });

        const actorId = Number(req.auth?.sub) || null;
        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "decouple_film_consolidation",
            target_type: "film",
            target_id: filmId,
            meta: { canonical_id: canonicalId, decoupled_film_id: filmId }
          });
        }

        return res.status(200).json({ ok: true, film: result });
      } catch (err) {
        next(err);
      }
    }
  );
}
