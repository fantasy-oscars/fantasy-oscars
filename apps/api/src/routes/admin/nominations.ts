import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";
import { buildTmdbImageUrl, fetchTmdbPersonDetails } from "../../lib/tmdb.js";
import { registerAdminNominationListRoute } from "./nominationsList.js";
import { registerAdminNominationChangeRoute } from "./nominationsChange.js";
import { registerAdminNominationReorderRoute } from "./nominationsReorder.js";

export function registerAdminNominationRoutes(router: Router, client: DbClient) {
  registerAdminNominationListRoute({ router, client });
  registerAdminNominationChangeRoute({ router, client });
  registerAdminNominationReorderRoute({ router, client });

  router.post(
    "/ceremonies/:id/nominations",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const ceremonyId = Number(req.params.id);
        if (!Number.isInteger(ceremonyId) || ceremonyId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const categoryEditionId = Number(req.body?.category_edition_id);
        if (!Number.isInteger(categoryEditionId) || categoryEditionId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "category_edition_id is required");
        }

        const filmIdRaw = req.body?.film_id;
        const filmId =
          typeof filmIdRaw === "number"
            ? filmIdRaw
            : typeof filmIdRaw === "string" && filmIdRaw.trim()
              ? Number(filmIdRaw)
              : null;
        const filmTitle =
          typeof req.body?.film_title === "string" ? req.body.film_title.trim() : "";
        const songTitle =
          typeof req.body?.song_title === "string" ? req.body.song_title.trim() : "";

        const contributorsRaw = req.body?.contributors;
        const contributors = Array.isArray(contributorsRaw)
          ? (contributorsRaw as unknown[])
              .filter((c) => c && typeof c === "object")
              .map((c) => c as Record<string, unknown>)
          : [];

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [ceremonyId]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }
          const draftsStarted = await hasDraftsStartedForCeremony(tx, ceremonyId);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          const { rows: catRows } = await query<{ unit_kind: string }>(
            tx,
            `SELECT ce.unit_kind
             FROM category_edition ce
             WHERE ce.id = $1 AND ce.ceremony_id = $2`,
            [categoryEditionId, ceremonyId]
          );
          const unitKind = catRows[0]?.unit_kind;
          if (!unitKind)
            throw new AppError("NOT_FOUND", 404, "Category not found for ceremony");

          // Resolve the film.
          let resolvedFilmId: number | null = null;
          if (filmId && Number.isFinite(filmId)) {
            const { rows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM film WHERE id = $1`,
              [Number(filmId)]
            );
            if (!rows[0]?.id) throw new AppError("NOT_FOUND", 404, "Film not found");
            resolvedFilmId = rows[0].id;
          } else if (filmTitle) {
            const { rows } = await query<{ id: number }>(
              tx,
              `INSERT INTO film (title, country) VALUES ($1, NULL) RETURNING id::int`,
              [filmTitle]
            );
            resolvedFilmId = rows[0]?.id ?? null;
          } else {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "film_id or film_title is required",
              { fields: ["film_id", "film_title"] }
            );
          }

          if (!resolvedFilmId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve film");

          let nominationId: number | null = null;
          const { rows: sortRows } = await query<{ max: number | null }>(
            tx,
            `SELECT COALESCE(MAX(sort_order), -1)::int AS max
             FROM nomination
             WHERE category_edition_id = $1`,
            [categoryEditionId]
          );
          const nextSortOrder = (sortRows[0]?.max ?? -1) + 1;

          if (unitKind === "SONG") {
            if (!songTitle) {
              throw new AppError("VALIDATION_FAILED", 400, "song_title is required", {
                fields: ["song_title"]
              });
            }
            const { rows: songRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO song (title, film_id) VALUES ($1, $2) RETURNING id::int`,
              [songTitle, resolvedFilmId]
            );
            const songId = songRows[0]?.id ?? null;
            if (!songId)
              throw new AppError("INTERNAL_ERROR", 500, "Failed to create song");

            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, song_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, songId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          } else if (unitKind === "PERFORMANCE") {
            // Performance-style categories are film-scoped, but the nominees are people pulled from
            // the film's credits. A single nomination can include multiple people (ties / duos / groups).
            if (contributors.length < 1) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "Performance categories require at least one contributor",
                { fields: ["contributors"] }
              );
            }
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, film_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, resolvedFilmId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          } else {
            // FILM default.
            const { rows: nomRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO nomination (category_edition_id, film_id, sort_order)
               VALUES ($1, $2, $3)
               RETURNING id::int`,
              [categoryEditionId, resolvedFilmId, nextSortOrder]
            );
            nominationId = nomRows[0]?.id ?? null;
          }

          if (!nominationId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to create nomination");

          // Contributors (people) can be attached to any nomination (e.g. directors, producers, songwriters).
          // For PERFORMANCE categories, at least one is required.
          if (contributors.length > 0) {
            let sort = 0;
            for (const c of contributors) {
              const personName = typeof c.name === "string" ? c.name.trim() : "";
              if (!personName) continue;
              const tmdbIdRaw = c.tmdb_id;
              const tmdbId =
                typeof tmdbIdRaw === "number"
                  ? tmdbIdRaw
                  : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
                    ? Number(tmdbIdRaw)
                    : null;
              const roleLabel =
                typeof c.role_label === "string" ? c.role_label.trim() : null;

              const { rows: personRows } = await query<{ id: number }>(
                tx,
                tmdbId && Number.isFinite(tmdbId)
                  ? `INSERT INTO person (full_name, tmdb_id, external_ids, updated_at)
                     VALUES ($1, $2::int, jsonb_build_object('tmdb_id', $2::int), now())
                     ON CONFLICT (tmdb_id)
                     DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
                     RETURNING id::int`
                  : `INSERT INTO person (full_name) VALUES ($1) RETURNING id::int`,
                tmdbId && Number.isFinite(tmdbId)
                  ? [personName, Number(tmdbId)]
                  : [personName]
              );
              const personId = personRows[0]?.id ?? null;
              if (!personId) continue;

              // Best-effort: if this is a performance nomination and no role label was supplied,
              // try to infer the character name from the film's stored TMDB credits.
              let inferredRole: string | null = roleLabel;
              if (
                !inferredRole &&
                unitKind === "PERFORMANCE" &&
                tmdbId &&
                Number.isFinite(tmdbId)
              ) {
                try {
                  const { rows: filmRows } = await query<{ tmdb_credits: unknown }>(
                    tx,
                    `SELECT tmdb_credits FROM film WHERE id = $1`,
                    [resolvedFilmId]
                  );
                  const credits = filmRows[0]?.tmdb_credits as
                    | {
                        cast?: Array<{
                          id?: number;
                          tmdb_id?: number;
                          character?: string | null;
                          profile_path?: string | null;
                        }>;
                      }
                    | null
                    | undefined;
                  const cast = Array.isArray(credits?.cast) ? credits!.cast! : [];
                  const match = cast.find(
                    (p) => Number(p?.tmdb_id ?? p?.id) === Number(tmdbId)
                  );
                  const character =
                    typeof match?.character === "string" ? match.character.trim() : "";
                  inferredRole = character ? character : null;

                  // If the person doesn't have a profile image yet, use the film credits profile_path.
                  const profilePath =
                    typeof match?.profile_path === "string" ? match.profile_path : null;
                  if (profilePath) {
                    const { rows: existingRows } = await query<{
                      profile_url: string | null;
                      profile_path: string | null;
                    }>(tx, `SELECT profile_url, profile_path FROM person WHERE id = $1`, [
                      personId
                    ]);
                    const existing = existingRows[0];
                    if (!existing?.profile_url && !existing?.profile_path) {
                      const profileUrl = await buildTmdbImageUrl(
                        "profile",
                        profilePath,
                        "w185"
                      );
                      await query(
                        tx,
                        `UPDATE person
                         SET profile_path = $2,
                             profile_url = $3,
                             updated_at = now()
                         WHERE id = $1`,
                        [personId, profilePath, profileUrl]
                      );
                    }
                  }
                } catch {
                  // Ignore; role label is optional and should not block nominee creation.
                }
              }

              // Best-effort: hydrate person profile image from TMDB when we have a tmdb_id.
              if (tmdbId && Number.isFinite(tmdbId)) {
                try {
                  const { rows: existingRows } = await query<{
                    profile_url: string | null;
                    profile_path: string | null;
                  }>(tx, `SELECT profile_url, profile_path FROM person WHERE id = $1`, [
                    personId
                  ]);
                  const existing = existingRows[0];
                  if (!existing?.profile_url && !existing?.profile_path) {
                    const details = await fetchTmdbPersonDetails(Number(tmdbId));
                    const profilePath = details?.profile_path ?? null;
                    const profileUrl = await buildTmdbImageUrl(
                      "profile",
                      profilePath,
                      "w185"
                    );
                    await query(
                      tx,
                      `UPDATE person
                       SET profile_path = $2,
                           profile_url = $3,
                           updated_at = now()
                       WHERE id = $1`,
                      [personId, profilePath, profileUrl]
                    );
                  }
                } catch {
                  // Ignore; person image is a convenience, not a requirement.
                }
              }

              await query(
                tx,
                `INSERT INTO nomination_contributor (nomination_id, person_id, role_label, sort_order)
                 VALUES ($1, $2, $3, $4)`,
                [nominationId, personId, inferredRole, sort]
              );
              sort += 1;
            }
          } else if (unitKind === "PERFORMANCE") {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Performance categories require at least one contributor",
              { fields: ["contributors"] }
            );
          }

          return { nomination_id: nominationId };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_nomination_manual",
            target_type: "ceremony",
            target_id: ceremonyId,
            meta: {
              category_edition_id: categoryEditionId,
              nomination_id: result.nomination_id
            }
          });
        }

        return res.status(201).json({ ok: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/nominations/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: rows0 } = await query<{
            id: number;
            category_edition_id: number;
            song_id: number | null;
            performance_id: number | null;
            ceremony_id: number;
          }>(
            tx,
            `SELECT
               n.id::int,
               n.category_edition_id::int,
               n.song_id::int,
               n.performance_id::int,
               ce.ceremony_id::int
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const row = rows0[0];
          if (!row) throw new AppError("NOT_FOUND", 404, "Nomination not found");

          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [row.ceremony_id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be deleted while the ceremony is in draft"
            );
          }

          const draftsStarted = await hasDraftsStartedForCeremony(tx, row.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          // Remove dependent rows first (no ON DELETE CASCADE on these FKs).
          await query(tx, `DELETE FROM nomination_contributor WHERE nomination_id = $1`, [
            nominationId
          ]);
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE nomination_id = $1`,
            [nominationId]
          );
          await query(
            tx,
            `DELETE FROM nomination_change_audit WHERE replacement_nomination_id = $1`,
            [nominationId]
          );

          // Now remove the nomination.
          await query(tx, `DELETE FROM nomination WHERE id = $1`, [nominationId]);

          // Best-effort cleanup of now-unreferenced song/performance rows.
          if (row.song_id) {
            await query(
              tx,
              `DELETE FROM song
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE song_id = $1)`,
              [row.song_id]
            );
          }
          if (row.performance_id) {
            await query(
              tx,
              `DELETE FROM performance
               WHERE id = $1
                 AND NOT EXISTS (SELECT 1 FROM nomination WHERE performance_id = $1)`,
              [row.performance_id]
            );
          }

          return {
            ceremony_id: row.ceremony_id,
            category_edition_id: row.category_edition_id
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "delete_nomination",
            target_type: "nomination",
            target_id: nominationId,
            meta: result
          });
        }

        return res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );
}
