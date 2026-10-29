import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "../../../src/server.js";
import { listExpectedMigrations } from "../../../src/data/migrations.js";
import { startTestDatabase } from "../../db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

describe("GET /health/ready (database)", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3199";
    process.env.AUTH_SECRET = "test-secret";
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  it("is 503 until the migration history is complete, then 200", async () => {
    const app = createServer({ db: db.pool });
    const before = await request(app).get("/health/ready");
    expect(before.status).toBe(503);
    expect(before.body.db).toBe("up");

    await db.pool.query(
      `CREATE TABLE IF NOT EXISTS migration_history (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
    );
    for (const f of listExpectedMigrations()) {
      await db.pool.query(`INSERT INTO migration_history (filename) VALUES ($1)`, [f]);
    }
    const after = await request(app).get("/health/ready");
    expect(after.status).toBe(200);
    expect(after.body.ok).toBe(true);
  });
});
