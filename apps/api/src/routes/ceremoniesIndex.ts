import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";

export function registerCeremoniesIndexRoute({
  router,
  client
}: {
  router: Router;
  client: DbClient;
}): void {
  // User-visible ceremony index: active (published/locked) and archived.
  router.get("/", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status IN ('PUBLISHED','LOCKED','COMPLETE','ARCHIVED')
         ORDER BY starts_at DESC NULLS LAST, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });
}
