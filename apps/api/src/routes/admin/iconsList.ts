import type { Router } from "express";
import { AuthedRequest } from "../../auth/middleware.js";
import { type DbClient, query } from "../../data/db.js";

export function registerAdminIconsListRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  router.get("/icons", async (_req: AuthedRequest, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, asset_path
         FROM icon
         ORDER BY code ASC`
      );
      return res.status(200).json({ icons: rows });
    } catch (err) {
      next(err);
    }
  });
}
