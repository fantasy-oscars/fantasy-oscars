import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import {
  buildTmdbImageUrlFromConfig,
  fetchTmdbMovieDetailsWithCredits,
  getTmdbImageConfig,
  parseReleaseYear
} from "../../lib/tmdb.js";

export function registerAdminFilmImportRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

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
                const message = err instanceof Error ? err.message : "TMDB request failed";
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
            await query(tx, `INSERT INTO film (title, country) VALUES ($1, NULL)`, [name]);
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
}

