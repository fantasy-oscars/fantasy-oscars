import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Pool } from "pg";
import { createHealthRouter } from "../../../src/routes/health.js";
import { listExpectedMigrations } from "../../../src/data/migrations.js";

function appWith(query: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use("/health", createHealthRouter({ query } as unknown as Pick<Pool, "query">));
  return app;
}

const expectedFiles = listExpectedMigrations();
const latest = expectedFiles[expectedFiles.length - 1];

describe("GET /health/ready", () => {
  it("returns 200 when the DB is reachable and migrations are current", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("migration_history")
        ? { rows: expectedFiles.map((filename) => ({ filename })) }
        : { rows: [{ "?column?": 1 }] }
    );
    const res = await request(appWith(query)).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      db: "up",
      migrations: { applied: latest, expected: latest }
    });
  });

  it("returns 503 when the DB is unreachable", async () => {
    const query = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const res = await request(appWith(query)).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      ok: false,
      db: "down",
      migrations: { applied: null, expected: null }
    });
  });

  it("returns 503 when migrations are behind", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes("migration_history")
        ? { rows: expectedFiles.slice(0, 1).map((filename) => ({ filename })) }
        : { rows: [] }
    );
    const res = await request(appWith(query)).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.db).toBe("up");
    expect(res.body.migrations.expected).toBe(latest);
    expect(res.body.migrations.applied).toBe(expectedFiles[0]);
  });

  it("keeps /health liveness free of DB access", async () => {
    const query = vi.fn();
    const res = await request(appWith(query)).get("/health");
    expect(res.status).toBe(200);
    expect(query).not.toHaveBeenCalled();
  });
});
