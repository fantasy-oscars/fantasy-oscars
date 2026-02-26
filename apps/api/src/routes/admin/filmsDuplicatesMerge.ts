import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

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
            tmdb_id: number | null;
            consolidated_into_film_id: number | null;
          }>(
            tx,
            `SELECT id::int, title, tmdb_id::int, consolidated_into_film_id::int
             FROM film
             WHERE id = $1`,
            [canonicalId]
          );
          const canonical = canonicalRows[0];
          if (!canonical)
            throw new AppError("NOT_FOUND", 404, "Canonical film not found");
          if (canonical.consolidated_into_film_id) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Cannot merge into a film that is already consolidated"
            );
          }

          const { rows: dupRows } = await query<{
            id: number;
            title: string;
            tmdb_id: number | null;
            consolidated_into_film_id: number | null;
          }>(
            tx,
            `SELECT id::int, title, tmdb_id::int, consolidated_into_film_id::int
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

          if (dupRows.some((row) => Boolean(row.consolidated_into_film_id))) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "One or more selected duplicate films are already consolidated"
            );
          }

          const selectedFilms = [canonical, ...dupRows];
          const linkedFilms = selectedFilms.filter((f) => Number.isInteger(f.tmdb_id) && Number(f.tmdb_id) > 0);
          if (linkedFilms.length > 1) {
            throw new AppError(
              "FILM_MERGE_LINK_CONFLICT",
              409,
              "Multiple selected films are linked to TMDB. Unlink at least one before merging.",
              {
                linked_films: linkedFilms.map((f) => ({
                  id: f.id,
                  title: f.title,
                  tmdb_id: f.tmdb_id
                }))
              }
            );
          }

          const effectiveCanonicalId =
            linkedFilms.length === 1 ? linkedFilms[0].id : canonical.id;
          const effectiveCanonical =
            selectedFilms.find((f) => f.id === effectiveCanonicalId) ?? canonical;
          const effectiveDuplicateIds = selectedFilms
            .map((f) => f.id)
            .filter((id) => id !== effectiveCanonicalId);

          const counts = {
            films_consolidated: 0
          };

          for (const dupId of effectiveDuplicateIds) {
            await query(
              tx,
              `UPDATE film
               SET consolidated_into_film_id = $1,
                   consolidated_at = now()
               WHERE id = $2`,
              [effectiveCanonicalId, dupId]
            );
            counts.films_consolidated += 1;
          }

          return {
            canonical: {
              id: effectiveCanonical.id,
              title: effectiveCanonical.title
            },
            counts,
            effective_duplicate_ids: effectiveDuplicateIds
          };
        });

        if (actorId) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: actorId,
            action: "merge_films",
            target_type: "film",
            target_id: result.canonical.id,
            meta: {
              requested_canonical_id: canonicalId,
              canonical: { id: result.canonical.id, title: result.canonical.title },
              duplicate_ids: result.effective_duplicate_ids,
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
