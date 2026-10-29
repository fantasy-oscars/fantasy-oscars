import express from "express";
import type { Router } from "express";
import type { Pool } from "pg";
import { getMigrationStatus } from "../data/migrations.js";

export function healthHandler(_req: unknown, res: { json: (body: unknown) => void }) {
  res.json({ ok: true, service: "api", status: "healthy" });
}

/** Liveness (`/health`) never touches the DB; readiness (`/health/ready`) does. */
export function createHealthRouter(pool: Pick<Pool, "query">): Router {
  const router = express.Router();
  router.get("/", healthHandler);
  router.get("/ready", async (_req, res) => {
    let db: "up" | "down" = "down";
    let migrations: { applied: string | null; expected: string | null } = {
      applied: null,
      expected: null
    };
    let ok = false;
    try {
      await pool.query("SELECT 1");
      db = "up";
      const status = await getMigrationStatus(pool);
      migrations = { applied: status.applied, expected: status.expected };
      ok = status.pending.length === 0;
    } catch {
      ok = false;
    }
    res.status(ok ? 200 : 503).json({ ok, db, migrations });
  });
  return router;
}
