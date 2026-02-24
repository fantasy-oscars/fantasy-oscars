import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";

export function registerCeremoniesPublishedRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  // Ceremonies that commissioners can create seasons for.
  router.get("/published", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status = 'PUBLISHED'
         ORDER BY year DESC, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });
}
