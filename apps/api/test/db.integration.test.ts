import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, truncateAllTables } from "./db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

describe("database integration", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    if (db) {
      await db.stop();
    }
  });

  it("applies migrations and allows basic CRUD", async () => {
    const insert = await db.pool.query(
      "INSERT INTO sample_items (name) VALUES ($1) RETURNING id, name",
      ["first"]
    );
    expect(insert.rows[0].name).toBe("first");

    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM sample_items");
    expect(rows[0].count).toBe(1);
  });

  it("clears state between tests", async () => {
    await truncateAllTables(db.pool);
    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM sample_items");
    expect(rows[0].count).toBe(0);
  });
});
