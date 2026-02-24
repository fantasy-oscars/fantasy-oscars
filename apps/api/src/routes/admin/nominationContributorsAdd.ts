import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query, runInTransaction } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { hasDraftsStartedForCeremony } from "../../data/repositories/draftRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminNominationContributorsAddRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post(
    "/nominations/:id/contributors",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const nominationId = Number(req.params.id);
        if (!Number.isInteger(nominationId) || nominationId <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid nomination id");
        }

        const personIdRaw = (req.body as { person_id?: unknown } | undefined)?.person_id;
        const personId =
          typeof personIdRaw === "number"
            ? personIdRaw
            : typeof personIdRaw === "string" && personIdRaw.trim()
              ? Number(personIdRaw)
              : null;
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const tmdbIdRaw = (req.body as { tmdb_id?: unknown } | undefined)?.tmdb_id;
        const tmdbId =
          typeof tmdbIdRaw === "number"
            ? tmdbIdRaw
            : typeof tmdbIdRaw === "string" && tmdbIdRaw.trim()
              ? Number(tmdbIdRaw)
              : null;

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

        if (!personId && !name) {
          throw new AppError("VALIDATION_FAILED", 400, "person_id or name is required", {
            fields: ["person_id", "name"]
          });
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: metaRows } = await query<{ ceremony_id: number; status: string }>(
            tx,
            `SELECT ce.ceremony_id::int AS ceremony_id, c.status
             FROM nomination n
             JOIN category_edition ce ON ce.id = n.category_edition_id
             JOIN ceremony c ON c.id = ce.ceremony_id
             WHERE n.id = $1`,
            [nominationId]
          );
          const meta = metaRows[0];
          if (!meta) throw new AppError("NOT_FOUND", 404, "Nomination not found");
          if (meta.status !== "DRAFT") {
            throw new AppError(
              "CEREMONY_NOT_DRAFT",
              409,
              "Nominations can only be edited while the ceremony is in draft"
            );
          }
          const draftsStarted = await hasDraftsStartedForCeremony(tx, meta.ceremony_id);
          if (draftsStarted) {
            throw new AppError(
              "DRAFTS_LOCKED",
              409,
              "Nominee structural changes are locked after drafts start"
            );
          }

          let resolvedPersonId: number | null = null;
          if (personId && Number.isFinite(personId)) {
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `SELECT id::int FROM person WHERE id = $1`,
              [Number(personId)]
            );
            if (!personRows[0]?.id)
              throw new AppError("NOT_FOUND", 404, "Person not found");
            resolvedPersonId = personRows[0].id;
          } else if (tmdbId && Number.isFinite(tmdbId)) {
            if (!name) {
              throw new AppError(
                "VALIDATION_FAILED",
                400,
                "name is required when providing tmdb_id",
                { fields: ["name"] }
              );
            }
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO person (full_name, tmdb_id, external_ids, updated_at)
               VALUES ($1, $2::int, jsonb_build_object('tmdb_id', $2::int), now())
               ON CONFLICT (tmdb_id)
               DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()
               RETURNING id::int`,
              [name, Number(tmdbId)]
            );
            resolvedPersonId = personRows[0]?.id ?? null;
          } else {
            const { rows: personRows } = await query<{ id: number }>(
              tx,
              `INSERT INTO person (full_name) VALUES ($1) RETURNING id::int`,
              [name]
            );
            resolvedPersonId = personRows[0]?.id ?? null;
          }

          if (!resolvedPersonId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to resolve person");

          const { rows: sortRows } = await query<{ max: number | null }>(
            tx,
            `SELECT COALESCE(MAX(sort_order), -1)::int AS max
             FROM nomination_contributor
             WHERE nomination_id = $1`,
            [nominationId]
          );
          const nextSortOrder = (sortRows[0]?.max ?? -1) + 1;

          const { rows: insertedRows } = await query<{ id: number }>(
            tx,
            `INSERT INTO nomination_contributor (nomination_id, person_id, role_label, sort_order)
             VALUES ($1, $2, NULL, $3)
             RETURNING id::int`,
            [nominationId, resolvedPersonId, nextSortOrder]
          );
          const nominationContributorId = insertedRows[0]?.id ?? null;
          if (!nominationContributorId)
            throw new AppError("INTERNAL_ERROR", 500, "Failed to add contributor");

          const { rows: peopleRows } = await query<{
            id: number;
            full_name: string;
            tmdb_id: number | null;
            profile_url: string | null;
          }>(
            tx,
            `SELECT id::int, full_name, tmdb_id::int, profile_url
             FROM person WHERE id = $1`,
            [resolvedPersonId]
          );

          return {
            nomination_contributor_id: nominationContributorId,
            person: peopleRows[0]
          };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "add_nomination_contributor",
            target_type: "nomination",
            target_id: nominationId,
            meta: { person_id: result.person?.id ?? null }
          });
        }

        return res.status(201).json({ ok: true, ...result });
      } catch (err) {
        next(err);
      }
    }
  );
}
