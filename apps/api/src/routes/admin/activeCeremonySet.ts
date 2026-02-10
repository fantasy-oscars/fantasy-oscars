import type { Router } from "express";
import type { Pool } from "pg";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";
import { setActiveCeremonyId } from "../../data/repositories/appConfigRepository.js";
import { insertAdminAudit } from "../../data/repositories/adminAuditRepository.js";
import { AppError } from "../../errors.js";

export function registerAdminActiveCeremonySetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.post("/ceremony/active", async (req: AuthedRequest, res, next) => {
    try {
      const ceremonyIdRaw = req.body?.ceremony_id;
      const ceremonyId = Number(ceremonyIdRaw);
      if (!ceremonyIdRaw || Number.isNaN(ceremonyId)) {
        throw new AppError("VALIDATION_FAILED", 400, "Invalid ceremony id");
      }

      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year FROM ceremony WHERE id = $1`,
        [ceremonyId]
      );
      const ceremony = rows[0];
      if (!ceremony) {
        throw new AppError("NOT_FOUND", 404, "Ceremony not found");
      }

      await setActiveCeremonyId(client, ceremonyId);
      if (req.auth?.sub) {
        await insertAdminAudit(client as Pool, {
          actor_user_id: Number(req.auth.sub),
          action: "set_active_ceremony",
          target_type: "ceremony",
          target_id: ceremony.id
        });
      }
      return res.status(200).json({ ceremony });
    } catch (err) {
      next(err);
    }
  });
}

