import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createPool } from "../../../src/data/db.js";
import { createServer } from "../../../src/server.js";
import { startTestDatabase } from "../../db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

describe("pg pool resilience", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3198";
    process.env.AUTH_SECRET = "test-secret";
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("survives a backend terminated under an idle pooled client and recovers", async () => {
    const pool = createPool(db.connectionString);
    const app = createServer({ db: pool });
    try {
      // Park an idle client in the pool, then kill its backend from another connection.
      const pid = (await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
        .rows[0]!.pid;
      await db.pool.query("SELECT pg_terminate_backend($1)", [pid]);
      await new Promise((r) => setTimeout(r, 500));

      // An unhandled 'error' event would have failed the run; the pool must still work.
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(200);
      expect(res.body.db).toBe("up");
    } finally {
      await pool.end();
    }
  });

  it("reports 503 when the database is unreachable", async () => {
    const pool = createPool("postgres://postgres:pw@127.0.0.1:1/none", {
      max: 2,
      connectionTimeoutMillis: 500,
      idleTimeoutMillis: 1000
    });
    try {
      const res = await request(createServer({ db: pool })).get("/health/ready");
      expect(res.status).toBe(503);
      expect(res.body.db).toBe("down");
    } finally {
      await pool.end();
    }
  });
});
