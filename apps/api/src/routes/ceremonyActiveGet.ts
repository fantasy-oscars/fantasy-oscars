import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";
import { getActiveCeremonyId } from "../data/repositories/appConfigRepository.js";
import { AppError } from "../errors.js";

export function registerActiveCeremonyGetRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/active", async (_req, res, next) => {
    try {
      const activeId = await getActiveCeremonyId(client);
      if (!activeId) {
        throw new AppError("ACTIVE_CEREMONY_NOT_SET", 404, "Active ceremony not set");
      }
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status FROM ceremony WHERE id = $1`,
        [activeId]
      );
      const ceremony = rows[0];
      if (!ceremony) {
        throw new AppError("ACTIVE_CEREMONY_INVALID", 500, "Active ceremony is invalid");
      }
      return res.json({ ceremony });
    } catch (err) {
      next(err);
    }
  });
}

