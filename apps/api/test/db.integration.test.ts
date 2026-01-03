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
      "INSERT INTO app_user (handle, email, display_name) VALUES ($1, $2, $3) RETURNING id, handle",
      ["user1", "user1@example.com", "User One"]
    );
    expect(insert.rows[0].handle).toBe("user1");

    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM app_user");
    expect(rows[0].count).toBe(1);
  });

  it("clears state between tests", async () => {
    await truncateAllTables(db.pool);
    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM app_user");
    expect(rows[0].count).toBe(0);
  });
});
