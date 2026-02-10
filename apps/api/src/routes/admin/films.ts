import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { escapeLike, normalizeForSearch, sqlNorm } from "../../domain/search.js";
import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  getTmdbImageConfig,
  parseReleaseYear
} from "../../lib/tmdb.js";

export function registerAdminFilmRoutes(router: Router, client: DbClient) {
  router.post(
    "/films/import",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object") {
          throw new AppError("VALIDATION_FAILED", 400, "Missing JSON body", {
            fields: ["body"]
          });
        }

        const filmsRaw = (body as { films?: unknown }).films;
        const films = Array.isArray(filmsRaw)
          ? filmsRaw
          : Array.isArray(body)
            ? (body as unknown[])
            : null;
        if (!films) {
          throw new AppError("VALIDATION_FAILED", 400, "Dataset must include films", {
            fields: ["films"]
          });
        }

        // Best-effort hydration: if TMDB is configured, pull canonical film details (title/year/poster)
        // and store credits payload on the film. We intentionally do NOT hydrate individual people.
        const tmdbHydratedById = new Map<
          number,
          {
            title: string;
            releaseYear: number | null;
            posterPath: string | null;
            posterUrl: string | null;
            credits: unknown | null;
          }
        >();
        const tmdbErrors: Array<{ tmdb_id: number; error: string }> = [];
        const tmdbIdsToHydrate: number[] = [];

        for (const item of films) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const tmdbIdRaw =
            obj.external_ids && typeof obj.external_ids === "object"
              ? (obj.external_ids as { tmdb_id?: unknown }).tmdb_id
              : (obj as { tmdb_id?: unknown }).tmdb_id;
          const tmdbId =
            typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : null;
          if (tmdbId && Number.isFinite(tmdbId)) tmdbIdsToHydrate.push(Number(tmdbId));
        }

        if (tmdbIdsToHydrate.length > 0) {
          try {
            const cfg = await getTmdbImageConfig();
            for (const tmdbId of tmdbIdsToHydrate) {
              if (tmdbHydratedById.has(tmdbId)) continue;
              try {
                const movie = await fetchTmdbMovieDetailsWithCredits(tmdbId);
                const releaseYear = parseReleaseYear(movie.release_date ?? null);
                const posterPath = movie.poster_path ?? null;
                const posterUrl = buildTmdbImageUrlFromConfig(
                  cfg,
                  "poster",
                  posterPath,
                  "w500"
                );
                const credits = movie.credits
                  ? {
                      cast: Array.isArray(movie.credits.cast)
                        ? movie.credits.cast.map((c) => ({
                            tmdb_id: c.id,
                            name: c.name,
                            character: c.character ?? null,
                            order: c.order ?? null,
                            credit_id: c.credit_id ?? null,
                            profile_path: c.profile_path ?? null
                          }))
                        : [],
                      crew: Array.isArray(movie.credits.crew)
                        ? movie.credits.crew.map((c) => ({
                            tmdb_id: c.id,
                            name: c.name,
                            department: c.department ?? null,
                            job: c.job ?? null,
                            credit_id: c.credit_id ?? null,
                            profile_path: c.profile_path ?? null
                          }))
                        : []
                    }
                  : null;
                tmdbHydratedById.set(tmdbId, {
                  title: movie.title,
                  releaseYear,
                  posterPath,
                  posterUrl,
                  credits
                });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "TMDB request failed";
                tmdbErrors.push({ tmdb_id: tmdbId, error: message });
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "TMDB not configured";
            for (const tmdbId of tmdbIdsToHydrate) {
              tmdbErrors.push({ tmdb_id: tmdbId, error: message });
            }
          }
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          let upserted = 0;
          let hydrated = 0;

          for (const item of films) {
            if (!item || typeof item !== "object") continue;
            const obj = item as Record<string, unknown>;
            const ref = typeof obj.ref === "string" ? obj.ref.trim() : null;
            const name =
              typeof obj.name === "string"
                ? obj.name.trim()
                : typeof obj.title === "string"
                  ? obj.title.trim()
                  : null;
            const year =
              typeof obj.year === "number"
                ? obj.year
                : typeof obj.year === "string" && obj.year.trim()
                  ? Number(obj.year)
                  : null;
            const tmdbIdRaw =
              obj.external_ids && typeof obj.external_ids === "object"
                ? (obj.external_ids as { tmdb_id?: unknown }).tmdb_id
                : (obj as { tmdb_id?: unknown }).tmdb_id;
            const tmdbId =
              typeof tmdbIdRaw === "number"
                ? tmdbIdRaw
                : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                  ? Number(tmdbIdRaw)
                  : null;

            if (tmdbId && Number.isFinite(tmdbId)) {
              const hydratedRow = tmdbHydratedById.get(Number(tmdbId)) ?? null;
              const effectiveTitle = hydratedRow?.title ?? name ?? null;
              if (!effectiveTitle) continue;

              const effectiveYear =
                hydratedRow?.releaseYear ??
                (Number.isFinite(Number(year)) ? Number(year) : null);
              const effectivePosterPath = hydratedRow?.posterPath ?? null;
              const effectivePosterUrl = hydratedRow?.posterUrl ?? null;
              const effectiveCredits = hydratedRow?.credits ?? null;

              await query(
                tx,
                `INSERT INTO film (title, country, tmdb_id, ref, release_year, external_ids, poster_path, poster_url, tmdb_credits, tmdb_last_synced_at)
                 VALUES ($1, NULL, $2::int, $3, $4, $5::jsonb, $6::text, $7::text, $8::jsonb, CASE WHEN $6 IS NOT NULL OR $7 IS NOT NULL OR $8 IS NOT NULL THEN now() ELSE NULL END)
                 ON CONFLICT (tmdb_id)
                 DO UPDATE SET
                   title = EXCLUDED.title,
                   ref = COALESCE(film.ref, EXCLUDED.ref),
                   release_year = COALESCE(film.release_year, EXCLUDED.release_year),
                   poster_path = COALESCE(EXCLUDED.poster_path, film.poster_path),
                   poster_url = COALESCE(EXCLUDED.poster_url, film.poster_url),
                   tmdb_credits = COALESCE(EXCLUDED.tmdb_credits, film.tmdb_credits),
                   external_ids = COALESCE(film.external_ids, EXCLUDED.external_ids),
                   tmdb_last_synced_at = CASE WHEN EXCLUDED.poster_path IS NOT NULL OR EXCLUDED.poster_url IS NOT NULL OR EXCLUDED.tmdb_credits IS NOT NULL THEN now() ELSE film.tmdb_last_synced_at END`,
                [
                  effectiveTitle,
                  Number(tmdbId),
                  ref,
                  effectiveYear,
                  (obj as { external_ids?: unknown }).external_ids ?? null,
                  effectivePosterPath,
                  effectivePosterUrl,
                  effectiveCredits ? JSON.stringify(effectiveCredits) : null
                ]
              );
              upserted += 1;
              if (hydratedRow) hydrated += 1;
              continue;
            }

            if (ref) {
              if (!name) continue;
              await query(
                tx,
                `INSERT INTO film (title, country, tmdb_id, ref, release_year, external_ids)
                 VALUES ($1, NULL, NULL, $2, $3, $4)
                 ON CONFLICT (ref)
                 DO UPDATE SET
                   title = EXCLUDED.title,
                   release_year = COALESCE(film.release_year, EXCLUDED.release_year),
                   external_ids = COALESCE(film.external_ids, EXCLUDED.external_ids)`,
                [
                  name,
                  ref,
                  Number.isFinite(Number(year)) ? Number(year) : null,
                  (obj as { external_ids?: unknown }).external_ids ?? null
                ]
              );
              upserted += 1;
              continue;
            }

            if (!name) continue;
            await query(tx, `INSERT INTO film (title, country) VALUES ($1, NULL)`, [
              name
            ]);
            upserted += 1;
          }

          return { upserted, hydrated };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "import_films",
            target_type: "film",
            target_id: null,
            meta: { hydrated: result.hydrated, tmdb_errors: tmdbErrors }
          });
        }

        return res.status(200).json({ ok: true, ...result, tmdb_errors: tmdbErrors });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const like = q ? `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;
        const { rows } = await query(
          client,
          `SELECT
             id::int,
             title,
             release_year::int,
             tmdb_id::int,
             poster_url
           FROM film
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\')
           ORDER BY title ASC, release_year DESC NULLS LAST, id ASC
           LIMIT 500`,
          [like]
        );
        return res.status(200).json({ films: rows });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films/by-tmdb/:tmdbId",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const tmdbId = Number(req.params.tmdbId);
        if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "tmdbId must be a positive integer"
          );
        }
        const { rows } = await query<{ id: number; title: string; tmdb_id: number }>(
          client,
          `SELECT id::int, title, tmdb_id::int
           FROM film
           WHERE tmdb_id = $1::int
           ORDER BY id ASC
           LIMIT 1`,
          [tmdbId]
        );
        const film = rows[0];
        if (!film) throw new AppError("NOT_FOUND", 404, "Film not found");
        return res.status(200).json({ film });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films/:id/credits",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }
        const { rows } = await query<{ tmdb_credits: unknown | null }>(
          client,
          `SELECT tmdb_credits FROM film WHERE id = $1`,
          [id]
        );
        const credits = rows[0]?.tmdb_credits ?? null;
        // Don't over-validate; this payload is sourced from TMDB and stored as jsonb.
        return res.status(200).json({ credits });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/films/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid film id");
        }

        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          tmdbIdRaw === null || tmdbIdRaw === undefined
            ? null
            : typeof tmdbIdRaw === "number"
              ? tmdbIdRaw
              : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                ? Number(tmdbIdRaw)
                : NaN;

        if (tmdbId !== null && (!Number.isInteger(tmdbId) || tmdbId <= 0)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "tmdb_id must be a positive integer",
            {
              fields: ["tmdb_id"]
            }
          );
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: existingRows } = await query<{
            id: number;
            title: string;
            release_year: number | null;
            tmdb_id: number | null;
          }>(
            tx,
            `SELECT id::int, title, release_year::int, tmdb_id::int
             FROM film
             WHERE id = $1`,
            [id]
          );
          const existing = existingRows[0];
          if (!existing) throw new AppError("NOT_FOUND", 404, "Film not found");

          if (tmdbId === null) {
            const { rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = NULL,
                   external_ids = NULL,
                   poster_path = NULL,
                   poster_url = NULL,
                   tmdb_last_synced_at = NULL,
                   tmdb_credits = NULL
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [id]
            );
            return { film: rows[0], hydrated: false };
          }

          // Hydrate details + credits from TMDB and store them on the film record.
          const cfg = await getTmdbImageConfig();
          const movie = await fetchTmdbMovieDetailsWithCredits(Number(tmdbId));
          const releaseYear = parseReleaseYear(movie.release_date ?? null);
          const posterPath = movie.poster_path ?? null;
          const posterUrl = buildTmdbImageUrlFromConfig(
            cfg,
            "poster",
            posterPath,
            "w500"
          );
          const credits = movie.credits
            ? {
                cast: Array.isArray(movie.credits.cast)
                  ? movie.credits.cast.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      character: c.character ?? null,
                      order: c.order ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : [],
                crew: Array.isArray(movie.credits.crew)
                  ? movie.credits.crew.map((c) => ({
                      tmdb_id: c.id,
                      name: c.name,
                      department: c.department ?? null,
                      job: c.job ?? null,
                      credit_id: c.credit_id ?? null,
                      profile_path: c.profile_path ?? null
                    }))
                  : []
              }
            : null;

          let rows: unknown[] = [];
          try {
            ({ rows } = await query(
              tx,
              `UPDATE film
               SET tmdb_id = $2::int,
                   external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('tmdb_id', $2::int),
                   title = $3,
                   release_year = $4,
                   poster_path = $5,
                   poster_url = $6,
                   tmdb_last_synced_at = now(),
                   tmdb_credits = $7
               WHERE id = $1
               RETURNING id::int, title, release_year::int, tmdb_id::int, poster_url`,
              [
                id,
                Number(tmdbId),
                movie.title,
                releaseYear,
                posterPath,
                posterUrl,
                credits ? JSON.stringify(credits) : null
              ]
            ));
          } catch (err) {
            // Friendly feedback for a common admin mistake: trying to link the same TMDB id twice.
            const pg = err as { code?: unknown; constraint?: unknown };
            if (pg?.code === "23505" && pg?.constraint === "film_tmdb_id_key") {
              const { rows: dupeRows } = await query<{
                id: number;
                title: string;
              }>(
                tx,
                `SELECT id::int, title
                 FROM film
                 WHERE tmdb_id = $1::int
                 ORDER BY id ASC
                 LIMIT 1`,
                [Number(tmdbId)]
              );
              const dupe = dupeRows[0];
              throw new AppError(
                "TMDB_ID_ALREADY_LINKED",
                409,
                dupe?.title
                  ? `That TMDB id is already linked to “${dupe.title}”.`
                  : "That TMDB id is already linked to another film.",
                dupe
                  ? {
                      tmdb_id: Number(tmdbId),
                      linked_film_id: dupe.id,
                      linked_film_title: dupe.title
                    }
                  : { tmdb_id: Number(tmdbId) }
              );
            }
            throw err;
          }
          return { film: rows[0], hydrated: true };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "link_film_tmdb",
            target_type: "film",
            target_id: id,
            meta: { tmdb_id: tmdbId, hydrated: result.hydrated }
          });
        }

        return res.status(200).json({ film: result.film, hydrated: result.hydrated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/films/duplicates",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const likeRaw = q ? `%${escapeLike(q)}%` : null;
        const likeNorm = q ? `%${escapeLike(normalizeForSearch(q))}%` : null;

        const { rows } = await query<{
          norm_title: string;
          count: number;
          films: Array<{
            id: number;
            title: string;
            release_year: number | null;
            tmdb_id: number | null;
            poster_url: string | null;
            tmdb_last_synced_at: string | null;
          }>;
        }>(
          client,
          `WITH f AS (
             SELECT
               id::int,
               title,
               release_year::int,
               tmdb_id::int,
               poster_url,
               tmdb_last_synced_at,
               ${sqlNorm("title")} AS norm_title
             FROM film
           )
           SELECT
             norm_title,
             count(*)::int AS count,
             json_agg(
               json_build_object(
                 'id', id,
                 'title', title,
                 'release_year', release_year,
                 'tmdb_id', tmdb_id,
                 'poster_url', poster_url,
                 'tmdb_last_synced_at', tmdb_last_synced_at
               )
               ORDER BY (tmdb_id IS NULL) ASC, tmdb_last_synced_at DESC NULLS LAST, id ASC
             ) AS films
           FROM f
           WHERE ($1::text IS NULL OR title ILIKE $1 ESCAPE '\\' OR norm_title LIKE $2 ESCAPE '\\')
           GROUP BY norm_title
           HAVING count(*) > 1
           ORDER BY max(tmdb_last_synced_at) DESC NULLS LAST, min(id) ASC
           LIMIT 200`,
          [likeRaw, likeNorm]
        );

        return res.status(200).json({ groups: rows });
      } catch (err) {
        next(err);
      }
    }
  );

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
