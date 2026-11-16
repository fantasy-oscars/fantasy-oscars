import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, startTestDatabase } from "../../db.js";
import {
  insertCategoryEdition,
  insertCeremony,
  insertCeremonyWinner,
  insertNomination,
  insertUser
} from "../../factories/db.js";

const MIGRATION = "021_ceremony_lifecycle_active.sql";

type Row = { id: number; status: string; results_finalized_at: Date | null };

describe("021 ceremony lifecycle migration", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  let rows: Map<number, Row>;

  const auditAt = new Date("2026-03-03T05:00:00Z");
  const winnerAt = new Date("2026-03-02T04:00:00Z");
  const archivedAt = new Date("2025-04-01T12:00:00Z");

  beforeAll(async () => {
    db = await startTestDatabase({ migrateBefore: MIGRATION });
    const pool = db.pool;
    const setStatus = (id: number, status: string) =>
      pool.query(`UPDATE ceremony SET status = $2 WHERE id = $1`, [id, status]);
    // A trigger stamps updated_at on update, so write the timestamp on insert.
    const insertWinnerAt = async (ceremonyId: number, at: Date) => {
      const category = await insertCategoryEdition(pool, { ceremony_id: ceremonyId });
      const nomination = await insertNomination(pool, {
        category_edition_id: category.id,
        ceremony_id: ceremonyId
      });
      await pool.query(
        `INSERT INTO ceremony_winner
           (ceremony_id, category_edition_id, nomination_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)`,
        [ceremonyId, category.id, nomination.id, at]
      );
    };

    // One ceremony per pre-migration status, plus the finalized-at fallbacks.
    await insertCeremony(pool, { id: 1, code: "draft" });
    await insertCeremony(pool, { id: 2, code: "published" }, false);
    await setStatus(2, "PUBLISHED");
    await insertCeremony(pool, { id: 3, code: "locked" }, false);
    await insertCeremonyWinner(pool, { ceremony_id: 3 });
    await setStatus(3, "LOCKED");

    // Finalized with an audit entry: the audit time wins over the winner time.
    const admin = await insertUser(pool, { id: 900 });
    await insertCeremony(pool, { id: 4, code: "complete-audited" }, false);
    await insertWinnerAt(4, winnerAt);
    await pool.query(
      `INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, created_at)
       VALUES ($1, 'finalize_winners', 'ceremony', $2, $3)`,
      [admin.id, 4, auditAt]
    );
    await setStatus(4, "COMPLETE");

    // Finalized without an audit entry: falls back to the latest winner write.
    await insertCeremony(pool, { id: 5, code: "complete-winners" }, false);
    await insertWinnerAt(5, winnerAt);
    await setStatus(5, "COMPLETE");

    // Archived after finalizing (has winners) and soft-deleted (no winners).
    await insertCeremony(pool, { id: 6, code: "archived-results" }, false);
    await insertCeremonyWinner(pool, { ceremony_id: 6 });
    await pool.query(
      `UPDATE ceremony SET status = 'ARCHIVED', archived_at = $2 WHERE id = $1`,
      [6, archivedAt]
    );
    await insertCeremony(pool, { id: 7, code: "archived-empty" }, false);
    await pool.query(
      `UPDATE ceremony SET status = 'ARCHIVED', archived_at = $2 WHERE id = $1`,
      [7, archivedAt]
    );

    await applyMigrations(pool);

    const result = await pool.query<Row>(
      `SELECT id::int, status, results_finalized_at FROM ceremony ORDER BY id`
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

  it.each([
    [1, "DRAFT"],
    [2, "ACTIVE"],
    [3, "LOCKED"],
    [4, "LOCKED"],
    [5, "LOCKED"],
    [6, "ARCHIVED"],
    [7, "ARCHIVED"]
  ])("maps ceremony %i to %s", (id, status) => {
    expect(rows.get(id)?.status).toBe(status);
  });

  it("leaves results unfinalized where no finalize happened", () => {
    expect(rows.get(1)?.results_finalized_at).toBeNull();
    expect(rows.get(2)?.results_finalized_at).toBeNull();
    expect(rows.get(3)?.results_finalized_at).toBeNull();
    expect(rows.get(7)?.results_finalized_at).toBeNull();
  });

  it("dates finalized results from the finalize audit entry", () => {
    expect(rows.get(4)?.results_finalized_at?.toISOString()).toBe(auditAt.toISOString());
  });

  it("falls back to the latest winner write without an audit entry", () => {
    expect(rows.get(5)?.results_finalized_at?.toISOString()).toBe(winnerAt.toISOString());
  });

  it("dates archived ceremonies with winners from archived_at", () => {
    expect(rows.get(6)?.results_finalized_at?.toISOString()).toBe(
      archivedAt.toISOString()
    );
  });

  it("rejects the retired statuses", async () => {
    for (const status of ["COMPLETE", "UNKNOWN"]) {
      await expect(
        db.pool.query(`UPDATE ceremony SET status = $1 WHERE id = 1`, [status])
      ).rejects.toThrow(/ceremony_status_check/);
    }
  });
});
