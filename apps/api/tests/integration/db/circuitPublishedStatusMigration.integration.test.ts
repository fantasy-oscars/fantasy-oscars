import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, startTestDatabase } from "../../db.js";

const MIGRATION = "034_circuit_published_status.sql";

type Row = {
  id: number;
  status: string;
  activated_at: Date | null;
  archived_at: Date | null;
  published_at: Date | null;
};

const activatedAt = new Date("2026-01-05T18:00:00Z");
const archivedAt = new Date("2026-04-01T12:00:00Z");

describe("034 circuit published status migration", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  let rows: Map<number, Row>;

  beforeAll(async () => {
    db = await startTestDatabase({ migrateBefore: MIGRATION });
    const pool = db.pool;

    // One Circuit per pre-migration status.
    await pool.query(
      `INSERT INTO circuit (id, code, name, status, activated_at, archived_at) VALUES
         (1, 'draft', 'Draft', 'DRAFT', NULL, NULL),
         (2, 'active', 'Active', 'ACTIVE', $1, NULL),
         (3, 'archived', 'Archived', 'ARCHIVED', $1, $2)`,
      [activatedAt, archivedAt]
    );
    await expect(
      pool.query(`UPDATE circuit SET status = 'PUBLISHED' WHERE id = 1`)
    ).rejects.toThrow(/circuit_status_check/);

    await applyMigrations(pool);

    const result = await pool.query<Row>(
      `SELECT id::int, status, activated_at, archived_at, published_at
       FROM circuit ORDER BY id`
    );
    rows = new Map(result.rows.map((r) => [r.id, r]));
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it("records the migration in the history", async () => {
    const { rows: history } = await db.pool.query(
      `SELECT 1 FROM migration_history WHERE filename = $1`,
      [MIGRATION]
    );
    expect(history).toHaveLength(1);
  });

  it("leaves existing rows unchanged", () => {
    expect(rows.get(1)).toEqual({
      id: 1,
      status: "DRAFT",
      activated_at: null,
      archived_at: null,
      published_at: null
    });
    expect(rows.get(2)).toEqual({
      id: 2,
      status: "ACTIVE",
      activated_at: activatedAt,
      archived_at: null,
      published_at: null
    });
    expect(rows.get(3)).toEqual({
      id: 3,
      status: "ARCHIVED",
      activated_at: activatedAt,
      archived_at: archivedAt,
      published_at: null
    });
  });

  it("allows a Circuit to be published", async () => {
    const publishedAt = new Date("2026-11-01T09:00:00Z");
    const { rows: updated } = await db.pool.query<Row>(
      `UPDATE circuit SET status = 'PUBLISHED', published_at = $2 WHERE id = $1
       RETURNING status, published_at`,
      [1, publishedAt]
    );
    expect(updated[0]).toEqual({ status: "PUBLISHED", published_at: publishedAt });
  });

  it("rejects statuses outside the lifecycle", async () => {
    for (const status of ["LIVE", "published", "UNKNOWN"]) {
      await expect(
        db.pool.query(`UPDATE circuit SET status = $1 WHERE id = 1`, [status])
      ).rejects.toThrow(/circuit_status_check/);
    }
  });
});
