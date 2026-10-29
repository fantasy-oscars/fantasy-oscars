import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError, validationError } from "../../errors.js";
import {
  adminCeremonyIdParam,
  adminCeremonyUpdateBody
} from "@fantasy-oscars/shared/schemas";
import { definedKeys, parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminCeremoniesUpdateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.patch(
    "/ceremonies/:id",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const { id } = parseParams(adminCeremonyIdParam, req.params);

        const body = parseBody(adminCeremonyUpdateBody, req.body);
        const {
          name,
          code,
          starts_at: startsAt,
          draft_warning_hours: warningHours
        } = body;

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
          push(`starts_at = $X`, startsAt === null ? null : startsAt.toISOString());
        }
        if (warningHours !== undefined) push(`draft_warning_hours = $X`, warningHours);

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
            meta: { fields: definedKeys(body) }
          });
        }

        return res.status(200).json({ ceremony });
      } catch (err) {
        // Unique constraint violation on ceremony.code
        if ((err as { code?: string })?.code === "23505") {
          next(validationError("Ceremony code already exists", ["code"]));
          return;
        }
        next(err);
      }
    }
  );
}
