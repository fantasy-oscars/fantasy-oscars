import express from "express";
import type { Router } from "express";
import type { DbClient } from "../data/db.js";
import { query } from "../data/db.js";

export function createCeremoniesRouter(client: DbClient): Router {
  const router = express.Router();

  // "Active" to users: published or locked. (Locked stays visible, but blocks new seasons/drafts.)
  router.get("/active", async (_req, res, next) => {
    try {
      const { rows } = await query(
        client,
        `SELECT id::int, code, name, year, starts_at, status
         FROM ceremony
         WHERE status IN ('PUBLISHED','LOCKED')
         ORDER BY year DESC, id DESC`
      );
      return res.status(200).json({ ceremonies: rows });
    } catch (err) {
      next(err);
    }
  });

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

  return router;
}
