import type express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import type { AuthedRequest } from "../../auth/middleware.js";
import { query, type DbClient } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { validationError } from "../../errors.js";
import { adminCeremonyCreateBody } from "@fantasy-oscars/shared/schemas";
import { parseBody } from "../../utils/validate.js";

export function registerAdminCeremoniesCreateRoute(args: {
  router: Router;
  client: DbClient;
}) {
  const { router, client } = args;

  router.post(
    "/ceremonies",
    async (req: AuthedRequest, res: express.Response, next: express.NextFunction) => {
      try {
        const {
          code,
          name,
          year,
          starts_at: startsAt
        } = parseBody(adminCeremonyCreateBody, req.body);

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
          next(validationError("Ceremony code already exists", ["code"]));
          return;
        }
        next(err);
      }
    }
  );
}
