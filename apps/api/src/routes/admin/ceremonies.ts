import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { query, runInTransaction, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { cancelDraftsForCeremony } from "../../data/repositories/draftRepository.js";
import {
  getCeremonyDraftLockedAt,
  lockCeremonyDraft
} from "../../data/repositories/ceremonyRepository.js";
import { AppError } from "../../errors.js";
import { registerAdminCeremonyDraftBoardRoute } from "./ceremonyDraftBoard.js";
import { registerAdminCeremonyDeleteRoute } from "./ceremonyDelete.js";
import { registerAdminCeremonyDraftLockStatusRoute } from "./ceremonyDraftLockStatus.js";
import { registerAdminCeremonyGetRoute } from "./ceremoniesGet.js";
import { registerAdminCeremoniesListRoute } from "./ceremoniesList.js";

export function registerAdminCeremonyRoutes(router: Router, client: DbClient) {
  registerAdminCeremoniesListRoute({ router, client });
  registerAdminCeremonyGetRoute({ router, client });
  registerAdminCeremonyDraftBoardRoute({ router, client });
  registerAdminCeremonyDraftLockStatusRoute({ router, client });
  registerAdminCeremonyDeleteRoute({ router, client });

  router.post(
    "/ceremonies",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const yearRaw = req.body?.year;
        const year = yearRaw === undefined || yearRaw === null ? null : Number(yearRaw);
        const startsAtRaw = req.body?.starts_at;
        const startsAt =
          typeof startsAtRaw === "string" && startsAtRaw.trim()
            ? new Date(startsAtRaw)
            : null;

        if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
        if (!/^[a-z0-9-]+$/.test(code)) {
          throw new AppError(
            "VALIDATION_FAILED",
            400,
            "Code must be lowercase letters/numbers/dashes only"
          );
        }
        if (!name) throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 3000)) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid year");
        }
        if (startsAt && Number.isNaN(startsAt.getTime())) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid starts_at timestamp");
        }

        const { rows } = await query(
          client,
          `INSERT INTO ceremony (code, name, year, starts_at, status, published_at, archived_at)
           VALUES ($1, $2, $3, $4, 'DRAFT', NULL, NULL)
           RETURNING id::int, code, name, year, starts_at, status`,
          [code, name, year, startsAt ? startsAt.toISOString() : null]
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_ceremony",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: { code, name, starts_at: ceremony.starts_at ?? null }
          });
        }

        return res.status(201).json({ ceremony });
      } catch (err) {
        // Unique constraint violation on ceremony.code
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Ceremony code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/drafts",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { rows } = await query(
          client,
          `INSERT INTO ceremony (code, name, year, starts_at, status, published_at, archived_at)
           VALUES (NULL, NULL, NULL, NULL, 'DRAFT', NULL, NULL)
           RETURNING id::int, code, name, year, starts_at, status`,
          []
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "create_ceremony_draft",
            target_type: "ceremony",
            target_id: ceremony.id,
            meta: {}
          });
        }

        return res.status(201).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const name =
          typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
        const code =
          typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
        const startsAtRaw = req.body?.starts_at;
        const startsAt =
          typeof startsAtRaw === "string" && startsAtRaw.trim()
            ? new Date(startsAtRaw)
            : startsAtRaw === null
              ? null
              : undefined;
        const warningHoursRaw = req.body?.draft_warning_hours;
        const warningHours =
          warningHoursRaw === undefined ? undefined : Number(warningHoursRaw);

        if (code !== undefined) {
          if (!code) throw new AppError("VALIDATION_FAILED", 400, "Code is required");
          if (!/^[a-z0-9-]+$/.test(code)) {
            throw new AppError(
              "VALIDATION_FAILED",
              400,
              "Code must be lowercase letters/numbers/dashes only"
            );
          }
        }
        if (name !== undefined && !name) {
          throw new AppError("VALIDATION_FAILED", 400, "Name is required");
        }
        if (startsAt && startsAt instanceof Date && Number.isNaN(startsAt.getTime())) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid starts_at timestamp");
        }
        if (
          warningHours !== undefined &&
          (!Number.isInteger(warningHours) || warningHours < 0 || warningHours > 24 * 14)
        ) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid draft_warning_hours");
        }

        const { rows: beforeRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [id]
        );
        const status = beforeRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status === "ARCHIVED") {
          throw new AppError(
            "CEREMONY_ARCHIVED",
            409,
            "Archived ceremonies are read-only"
          );
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        function push(fieldSql: string, value: unknown) {
          updates.push(fieldSql.replace("$X", `$${params.length + 1}`));
          params.push(value);
        }

        if (code !== undefined) push(`code = $X`, code);
        if (name !== undefined) push(`name = $X`, name);
        if (startsAt !== undefined) {
          push(
            `starts_at = $X`,
            startsAt instanceof Date ? startsAt.toISOString() : startsAt
          );
        }
        if (warningHours !== undefined) push(`draft_warning_hours = $X`, warningHours);

        if (updates.length === 0) {
          throw new AppError("VALIDATION_FAILED", 400, "No fields to update");
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET ${updates.join(", ")}
           WHERE id = $1
           RETURNING id::int, code, name, year, starts_at, status, draft_warning_hours::int, draft_locked_at, published_at, archived_at`,
          params
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "update_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: { fields: Object.keys(req.body ?? {}) }
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        // Unique constraint violation on ceremony.code
        if ((err as { code?: string })?.code === "23505") {
          next(new AppError("VALIDATION_FAILED", 400, "Ceremony code already exists"));
          return;
        }
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/publish",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{
          status: string;
          code: string | null;
          name: string | null;
        }>(client, `SELECT status, code, name FROM ceremony WHERE id = $1`, [id]);
        const row = ceremonyRows[0];
        const status = row?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "DRAFT") {
          throw new AppError(
            "CEREMONY_NOT_DRAFT",
            409,
            "Only draft ceremonies can be published"
          );
        }
        if (!row?.code || !row.code.trim() || !row?.name || !row.name.trim()) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "Code and name are required to publish"
          );
        }

        const { rows: statsRows } = await query<{
          categories_total: number;
          categories_with_nominees: number;
        }>(
          client,
          `WITH cats AS (
             SELECT ce.id
             FROM category_edition ce
             WHERE ce.ceremony_id = $1
           ),
           nom AS (
             SELECT DISTINCT n.category_edition_id
             FROM nomination n
             JOIN cats ON cats.id = n.category_edition_id
             WHERE n.status = 'ACTIVE'
           )
           SELECT
             (SELECT COUNT(*)::int FROM cats) AS categories_total,
             (SELECT COUNT(*)::int FROM nom) AS categories_with_nominees`,
          [id]
        );
        const stats = statsRows[0] ?? {
          categories_total: 0,
          categories_with_nominees: 0
        };
        if (stats.categories_total === 0) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "No categories exist for this ceremony"
          );
        }
        if (stats.categories_with_nominees !== stats.categories_total) {
          throw new AppError(
            "CEREMONY_INCOMPLETE",
            409,
            "All categories must have nominees before publishing"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'PUBLISHED',
               published_at = COALESCE(published_at, now())
           WHERE id = $1
           RETURNING id::int, code, name, year, starts_at, status, published_at`,
          [id]
        );
        const ceremony = rows[0];

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "publish_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/lock",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const result = await runInTransaction(client as Pool, async (tx) => {
          const { rows: ceremonyRows } = await query<{ status: string }>(
            tx,
            `SELECT status FROM ceremony WHERE id = $1`,
            [id]
          );
          const status = ceremonyRows[0]?.status;
          if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
          if (status === "ARCHIVED") {
            throw new AppError(
              "CEREMONY_ARCHIVED",
              409,
              "Archived ceremonies cannot be locked"
            );
          }
          if (status !== "PUBLISHED" && status !== "LOCKED") {
            throw new AppError(
              "CEREMONY_NOT_PUBLISHED",
              409,
              "Only published ceremonies can be locked"
            );
          }

          const lockedAtBefore = await getCeremonyDraftLockedAt(tx, id);
          const lockedAt =
            lockedAtBefore ?? (await lockCeremonyDraft(tx, id)) ?? lockedAtBefore;

          const { rows: updatedRows } = await query(
            tx,
            `UPDATE ceremony
             SET status = 'LOCKED'
             WHERE id = $1
             RETURNING id::int, status`,
            [id]
          );
          void updatedRows;

          const cancelled = await cancelDraftsForCeremony(tx, id);

          return { draft_locked_at: lockedAt, cancelled_count: cancelled.length };
        });

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "lock_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: { cancelled_drafts: result.cancelled_count }
          });
        }

        return res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/ceremonies/:id/archive",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
        }

        const { rows: ceremonyRows } = await query<{ status: string }>(
          client,
          `SELECT status FROM ceremony WHERE id = $1`,
          [id]
        );
        const status = ceremonyRows[0]?.status;
        if (!status) throw new AppError("NOT_FOUND", 404, "Ceremony not found");
        if (status !== "LOCKED") {
          throw new AppError(
            "CEREMONY_NOT_LOCKED",
            409,
            "Ceremony must be locked before archiving"
          );
        }

        const { rows } = await query(
          client,
          `UPDATE ceremony
           SET status = 'ARCHIVED',
               archived_at = COALESCE(archived_at, now())
           WHERE id = $1
           RETURNING id::int, status, archived_at`,
          [id]
        );

        if (req.auth?.sub) {
          await insertAdminAudit(client as Pool, {
            actor_user_id: Number(req.auth.sub),
            action: "archive_ceremony",
            target_type: "ceremony",
            target_id: id,
            meta: {}
          });
        }

        return res.status(200).json({ ceremony: rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );
}
