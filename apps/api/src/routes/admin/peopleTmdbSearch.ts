import type express from "express";
import type { Router } from "express";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import {
  buildTmdbImageUrlFromConfig,
  getTmdbImageConfig,
  searchTmdbPeople
} from "../../lib/tmdb.js";

export function registerAdminPeopleTmdbSearchRoute(args: {
  router: Router;
  client: DbClient;
}): void {
  const { router, client } = args;

  router.get(
    "/people/tmdb-search",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q || q.length < 2) return res.status(200).json({ results: [] });

        const tmdbResults = (await searchTmdbPeople(q)).slice(0, 12);
        const tmdbIds = tmdbResults
          .map((r) => Number(r.id))
          .filter((id) => Number.isInteger(id) && id > 0);
        const linkedByTmdbId = new Map<
          number,
          { person_id: number; person_name: string }
        >();
        if (tmdbIds.length > 0) {
          const { rows } = await query<{
            person_id: number;
            person_name: string;
            tmdb_id: number;
          }>(
            client,
            `SELECT id::int AS person_id, full_name AS person_name, tmdb_id::int
             FROM person
             WHERE tmdb_id = ANY($1::int[])
             ORDER BY id ASC`,
            [tmdbIds]
          );
          for (const row of rows) {
            linkedByTmdbId.set(Number(row.tmdb_id), {
              person_id: Number(row.person_id),
              person_name: row.person_name
            });
          }
        }

        const cfg = await getTmdbImageConfig();
        const results = tmdbResults.map((person) => {
          const tmdbId = Number(person.id);
          const linked = linkedByTmdbId.get(tmdbId) ?? null;
          return {
            tmdb_id: tmdbId,
            name: person.name,
            known_for_department: person.known_for_department ?? null,
            profile_url: buildTmdbImageUrlFromConfig(
              cfg,
              "profile",
              person.profile_path ?? null,
              "w185"
            ),
            linked_person_id: linked?.person_id ?? null,
            linked_person_name: linked?.person_name ?? null
          };
        });

        return res.status(200).json({ results });
      } catch (err) {
        next(err);
      }
    }
  );
}
