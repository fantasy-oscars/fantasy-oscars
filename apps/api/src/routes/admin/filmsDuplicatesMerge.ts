import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { sqlNorm } from "../../domain/search.js";

export function registerAdminFilmDuplicatesMergeRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.post(
    "/films/:canonicalId/merge",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const canonicalId = Number(req.params.canonicalId);
        if (!Number.isInteger(canonicalId) || canonicalId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid canonical film id");
        }

        const duplicateIdsRaw = (req.body as { duplicate_ids?: unknown } | undefined)
          ?.duplicate_ids;
        if (!Array.isArray(duplicateIdsRaw) || duplicateIdsRaw.length === 0) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "duplicate_ids must be a non-empty array",
            {
              fields: ["duplicate_ids"]
            }
          );
        }
        const duplicateIds = Array.from(
          new Set(
            duplicateIdsRaw
              .map((v) =>
                typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
              )
              .filter((v) => Number.isInteger(v) && v > 0)
              .map((v) => Number(v))
          )
        ).filter((id) => id !== canonicalId);
        if (duplicateIds.length === 0) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "No valid duplicate_ids provided",
            {
              fields: ["duplicate_ids"]
            }
          );
        }

        const actorId = Number(req.auth?.sub) || null;

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: canonicalRows } = await query<{
            id: number;
            title: string;
            norm_title: string;
          }>(
            tx,
            `SELECT id::int, title, ${sqlNorm("title")} AS norm_title
             FROM film
             WHERE id = $1`,
            [canonicalId]
          );
          const canonical = canonicalRows[0];
          if (!canonical)
            throw new AppError("NOT_FOUND", 404, "Canonical film not found");

          const { rows: dupRows } = await query<{
            id: number;
            title: string;
            norm_title: string;
          }>(
            tx,
            `SELECT id::int, title, ${sqlNorm("title")} AS norm_title
             FROM film
             WHERE id = ANY($1::int[])
             ORDER BY id ASC`,
            [duplicateIds]
          );

          const foundIds = new Set(dupRows.map((r) => r.id));
          const missing = duplicateIds.filter((id) => !foundIds.has(id));
          if (missing.length > 0) {
            throw new AppError(
              "NOT_FOUND",
              404,
              "One or more duplicate films not found",
              {
                missing_ids: missing
              }
            );
          }

          for (const d of dupRows) {
            if (d.norm_title !== canonical.norm_title) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "Can only merge films with the same title",
                {
                  canonical: { id: canonical.id, title: canonical.title },
                  duplicate: { id: d.id, title: d.title }
                }
              );
            }
          }

          const counts = {
            nominations_repointed: 0,
            songs_repointed: 0,
            performances_repointed: 0,
            performance_collisions_resolved: 0,
            film_credits_repointed: 0,
            film_credit_conflicts_deleted: 0,
            films_deleted: 0
          };

          for (const dupId of duplicateIds) {
            // Nominations referencing this film directly.
            const nomRes = await query(
              tx,
              `UPDATE nomination
               SET film_id = $1
               WHERE film_id = $2`,
              [canonicalId, dupId]
            );
            counts.nominations_repointed += nomRes.rowCount ?? 0;

            // Songs referencing this film.
            const songRes = await query(
              tx,
              `UPDATE song
               SET film_id = $1
               WHERE film_id = $2`,
              [canonicalId, dupId]
            );
            counts.songs_repointed += songRes.rowCount ?? 0;

            // Performance rows may collide on (film_id, person_id).
            const { rows: perfCollisions } = await query<{
              dup_perf_id: number;
              can_perf_id: number;
            }>(
              tx,
              `SELECT p_dup.id::int AS dup_perf_id, p_can.id::int AS can_perf_id
               FROM performance p_dup
               JOIN performance p_can
                 ON p_can.film_id = $1
                AND p_can.person_id = p_dup.person_id
               WHERE p_dup.film_id = $2`,
              [canonicalId, dupId]
            );
            for (const c of perfCollisions) {
              const repoint = await query(
                tx,
                `UPDATE nomination
                 SET performance_id = $1
                 WHERE performance_id = $2`,
                [c.can_perf_id, c.dup_perf_id]
              );
              counts.performance_collisions_resolved += repoint.rowCount ?? 0;
              await query(tx, `DELETE FROM performance WHERE id = $1`, [c.dup_perf_id]);
            }

            const perfRes = await query(
              tx,
              `UPDATE performance
               SET film_id = $1
               WHERE film_id = $2`,
              [canonicalId, dupId]
            );
            counts.performances_repointed += perfRes.rowCount ?? 0;

            // Film credits may collide on (film_id, tmdb_credit_id) when present.
            const delCreditRes = await query(
              tx,
              `DELETE FROM film_credit fc
               USING film_credit existing
               WHERE fc.film_id = $2
                 AND fc.tmdb_credit_id IS NOT NULL
                 AND existing.film_id = $1
                 AND existing.tmdb_credit_id = fc.tmdb_credit_id`,
              [canonicalId, dupId]
            );
            counts.film_credit_conflicts_deleted += delCreditRes.rowCount ?? 0;

            const creditRes = await query(
              tx,
              `UPDATE film_credit
               SET film_id = $1
               WHERE film_id = $2`,
              [canonicalId, dupId]
            );
            counts.film_credits_repointed += creditRes.rowCount ?? 0;

            await query(tx, `DELETE FROM film WHERE id = $1`, [dupId]);
            counts.films_deleted += 1;
          }

          return { canonical, counts };
        });

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "merge_films",
            target_type: "film",
            target_id: canonicalId,
            meta: {
              canonical: { id: result.canonical.id, title: result.canonical.title },
              duplicate_ids: duplicateIds,
              counts: result.counts
            }
          });
        }

        return res.status(200).json({ ok: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );
}
