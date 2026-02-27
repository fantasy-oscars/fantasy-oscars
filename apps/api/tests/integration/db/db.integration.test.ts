import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, truncateAllTables } from "../../db.js";

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
      "INSERT INTO app_user (username, email) VALUES ($1, $2) RETURNING id, username",
      ["user1", "user1@example.com"]
    );
    expect(insert.rows[0].username).toBe("user1");

    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM app_user");
    expect(rows[0].count).toBe(1);
  });

  it("assigns avatar_key even when inserts pass null", async () => {
    const insert = await db.pool.query(
      `INSERT INTO app_user (username, email, avatar_key)
       VALUES ($1, $2, $3)
       RETURNING avatar_key`,
      ["user-null-avatar", "user-null-avatar@example.com", null]
    );
    expect(typeof insert.rows[0].avatar_key).toBe("string");
    expect(insert.rows[0].avatar_key.length).toBeGreaterThan(0);
  });

  it("clears state between tests", async () => {
    await truncateAllTables(db.pool);
    const { rows } = await db.pool.query("SELECT count(*)::int AS count FROM app_user");
    expect(rows[0].count).toBe(0);
  });
});
