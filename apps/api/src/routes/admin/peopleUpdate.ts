import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import { buildTmdbImageUrl, fetchTmdbPersonDetails } from "../../lib/tmdb.js";

export function registerAdminPeopleUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.patch("/people/:id", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid person id");
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
          full_name: string;
          tmdb_id: number | null;
          profile_url: string | null;
        }>(
          tx,
          `SELECT id::int, full_name, tmdb_id::int, profile_url
           FROM person
           WHERE id = $1`,
          [id]
        );
        const existing = existingRows[0];
        if (!existing) throw new AppError("NOT_FOUND", 404, "Person not found");

        if (tmdbId === null) {
          const { rows } = await query(
            tx,
            `UPDATE person
             SET tmdb_id = NULL,
                 external_ids = NULL,
                 profile_path = NULL,
                 profile_url = NULL,
                 updated_at = now()
             WHERE id = $1
             RETURNING id::int, full_name, tmdb_id::int, profile_url`,
            [id]
          );
          return { person: rows[0], hydrated: false };
        }

        const details = await fetchTmdbPersonDetails(Number(tmdbId));
        const profilePath = details?.profile_path ?? null;
        const profileUrl = await buildTmdbImageUrl("profile", profilePath, "w185");

        let rows: unknown[] = [];
        try {
          ({ rows } = await query(
            tx,
            `UPDATE person
             SET tmdb_id = $2::int,
                 external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('tmdb_id', $2::int),
                 full_name = COALESCE(NULLIF($3, ''), full_name),
                 profile_path = $4,
                 profile_url = $5,
                 updated_at = now()
             WHERE id = $1
             RETURNING id::int, full_name, tmdb_id::int, profile_url`,
            [id, Number(tmdbId), String(details?.name ?? ""), profilePath, profileUrl]
          ));
        } catch (err) {
          const pg = err as { code?: unknown; constraint?: unknown };
          if (pg?.code === "23505" && pg?.constraint === "person_tmdb_id_key") {
            const { rows: dupeRows } = await query<{
              id: number;
              full_name: string;
            }>(
              tx,
              `SELECT id::int, full_name
               FROM person
               WHERE tmdb_id = $1::int
               ORDER BY id ASC
               LIMIT 1`,
              [Number(tmdbId)]
            );
            const dupe = dupeRows[0];
            throw new AppError(
              "TMDB_ID_ALREADY_LINKED",
              409,
              dupe?.full_name
                ? `That TMDB id is already linked to “${dupe.full_name}”.`
                : "That TMDB id is already linked to another contributor.",
              dupe
                ? {
                    tmdb_id: Number(tmdbId),
                    linked_person_id: dupe.id,
                    linked_person_name: dupe.full_name
                  }
                : { tmdb_id: Number(tmdbId) }
            );
          }
          throw err;
        }
        return { person: rows[0], hydrated: true };
      });

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "link_person_tmdb",
          target_type: "person",
          target_id: id,
          meta: { tmdb_id: tmdbId, hydrated: result.hydrated }
        });
      }

      return res.status(200).json({ person: result.person, hydrated: result.hydrated });
    } catch (err) {
      next(err);
    }
  });
}
