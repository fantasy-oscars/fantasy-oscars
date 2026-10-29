import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";
import {
  adminCeremonyIdParam,
  adminCeremonyNameBody
} from "@fantasy-oscars/shared/schemas";
import { parseBody, parseParams } from "../../utils/validate.js";

export function registerAdminCeremonyNameUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post("/ceremonies/:id/name", async (req: AuthedRequest, res, next) => {
    try {
      const { id } = parseParams(adminCeremonyIdParam, req.params);
      const { name } = parseBody(adminCeremonyNameBody, req.body);
      const { rows } = await query(
        client,
        `UPDATE ceremony SET name = $1
         WHERE id = $2
         RETURNING id, code, name, year`,
        [name, id]
      );
      const ceremony = rows[0];
      if (!ceremony) {
        throw new AppError("NOT_FOUND", 404, "Ceremony not found");
      }

      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "ceremony_name_update",
          target_type: "ceremony",
          target_id: ceremony.id,
          meta: { name }
        });
      }
      return res.status(200).json({ ceremony });
    } catch (err) {
      next(err);
    }
  });
}
