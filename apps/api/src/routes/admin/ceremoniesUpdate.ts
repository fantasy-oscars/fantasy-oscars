import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremoniesUpdateRoute(args: { router: Router; client: DbClient }) {
  const { router, client } = args;

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
}

