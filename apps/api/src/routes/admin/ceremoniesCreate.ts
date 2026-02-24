import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremoniesCreateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

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
}
