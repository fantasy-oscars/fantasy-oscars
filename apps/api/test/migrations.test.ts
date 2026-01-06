import { describe, expect, it } from "vitest";
import { startTestDatabase } from "./db.js";

describe("migrations", () => {
  it("apply cleanly and expose core tables", async () => {
    let pool;
    let stop;

    try {
      const started = await startTestDatabase();
      pool = started.pool;
      stop = started.stop;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("container runtime")) {
        // Environment without Docker/testcontainers; skip instead of failing the suite.
        return;
      }
      throw err;
    }

    try {
      const { rows } = await pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'icon','person','film','song','performance',
            'ceremony','category_family','category_edition',
            'nomination','nomination_contributor',
            'app_user','auth_password','auth_password_reset',
            'league','league_member','draft','draft_seat','draft_pick'
          )
      `);

      const tables = rows.map((r) => r.tablename);
      expect(tables).toEqual(
        expect.arrayContaining([
          "icon",
          "person",
          "film",
          "song",
          "performance",
          "ceremony",
          "category_family",
          "category_edition",
          "nomination",
          "nomination_contributor",
          "app_user",
          "auth_password",
          "league",
          "league_member",
          "draft",
          "draft_seat",
          "draft_pick"
        ])
      );
    } finally {
      if (stop) await stop();
    }
  }, 20000);
});
