import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminCeremonyNameUpdateRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post("/ceremonies/:id/name", async (req: AuthedRequest, res, next) => {
    try {
      const id = Number(req.params.id);
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
      }
      if (!name) {
        throw new AppError("VALIDATION_FAILED", 400, "Name is required");
      }

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

