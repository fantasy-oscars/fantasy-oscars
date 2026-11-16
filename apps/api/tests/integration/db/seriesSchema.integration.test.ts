import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertCategoryEdition, insertCeremony } from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

type ForeignKey = { constraint_name: string; child_table: string; parent_table: string };

/**
 * Foreign keys between the series_* tables and the Season and ceremony-draft
 * tables, in either direction (ADR 0005, sections 1 and 10). Joining on
 * constraint names can only add rows, never drop the real parent, so a
 * violation is never missed.
 */
async function forbiddenForeignKeys(client: Pool | PoolClient): Promise<ForeignKey[]> {
  const { rows } = await client.query<ForeignKey>(
    `WITH fk AS (
       SELECT DISTINCT
         rc.constraint_name::text AS constraint_name,
         child.table_name::text AS child_table,
         parent.table_name::text AS parent_table
       FROM information_schema.referential_constraints rc
       JOIN information_schema.table_constraints child
         ON child.constraint_schema = rc.constraint_schema
        AND child.constraint_name = rc.constraint_name
        AND child.constraint_type = 'FOREIGN KEY'
       JOIN information_schema.table_constraints parent
         ON parent.constraint_schema = rc.unique_constraint_schema
        AND parent.constraint_name = rc.unique_constraint_name
       WHERE rc.constraint_schema = 'public'
     ),
     classified AS (
       SELECT fk.*,
         fk.child_table LIKE 'series%' AS child_series,
         fk.parent_table LIKE 'series%' AS parent_series,
         fk.child_table ~ '^(season|draft)(_|$)' AS child_season_or_draft,
         fk.parent_table ~ '^(season|draft)(_|$)' AS parent_season_or_draft
       FROM fk
     )
     SELECT constraint_name, child_table, parent_table
     FROM classified
     WHERE (child_series AND parent_season_or_draft)
        OR (parent_series AND NOT child_series)
     ORDER BY child_table, constraint_name`
  );
  return rows;
}

async function inRolledBackTransaction(fn: (client: PoolClient) => Promise<void>) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

async function insertSeriesWithStructure(code: string) {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO series (code, name) VALUES ($1, $1) RETURNING id::int`,
    [code]
  );
  const seriesId = rows[0]!.id;
  const { rows: events } = await db.pool.query<{ id: number }>(
    `INSERT INTO series_event (series_id, code, name, sort_index)
     VALUES ($1, 'OSCARS', 'Academy Awards', 4) RETURNING id::int`,
    [seriesId]
  );
  const { rows: categories } = await db.pool.query<{ id: number }>(
    `INSERT INTO series_category (series_id, code, name, kind, sort_index)
     VALUES ($1, 'PICTURE', 'Best Picture', 'FILM', 0),
            ($1, 'DIRECTOR', 'Best Director', 'FILM', 1)
     RETURNING id::int`,
    [seriesId]
  );
  return {
    seriesId,
    eventId: events[0]!.id,
    pictureId: categories[0]!.id,
    directorId: categories[1]!.id
  };
}

describe("series schema", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
  });

  describe("independence from Season and ceremony drafts", () => {
    it("has no foreign key between series_* and the Season or draft tables", async () => {
      expect(await forbiddenForeignKeys(db.pool)).toEqual([]);
    });

    it("detects a series_* table that references a Season table", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(
          `CREATE TABLE series_probe (season_id bigint REFERENCES season(id))`
        );
        expect(await forbiddenForeignKeys(client)).toEqual([
          expect.objectContaining({ child_table: "series_probe", parent_table: "season" })
        ]);
      });
    });

    it("detects an existing table that gains a reference to a series_* table", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(
          `ALTER TABLE draft ADD COLUMN series_id bigint REFERENCES series(id)`
        );
        expect(await forbiddenForeignKeys(client)).toEqual([
          expect.objectContaining({ child_table: "draft", parent_table: "series" })
        ]);
      });
    });

    it("adds only the two nullable date columns to ceremony", async () => {
      const { rows } = await db.pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ceremony'
           AND column_name IN ('nominations_on', 'results_on')
         ORDER BY column_name`
      );
      expect(rows).toEqual([
        { column_name: "nominations_on", data_type: "date", is_nullable: "YES" },
        { column_name: "results_on", data_type: "date", is_nullable: "YES" }
      ]);
    });
  });

  describe("constraints", () => {
    it("maps a category edition to at most one canonical category per Series", async () => {
      const { seriesId, eventId, pictureId, directorId } =
        await insertSeriesWithStructure("2026-27");
      const ceremony = await insertCeremony(db.pool, {}, false);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await db.pool.query(
        `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id) VALUES ($1, $2, $3)`,
        [seriesId, ceremony.id, eventId]
      );
      await db.pool.query(
        `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
         VALUES ($1, $2, $3)`,
        [seriesId, edition.id, pictureId]
      );
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
             VALUES ($1, $2, $3)`,
            [seriesId, edition.id, directorId]
          )
        )
      ).toBe("23505");
    });

    it("keeps associations and mappings inside one Series", async () => {
      const a = await insertSeriesWithStructure("series-a");
      const b = await insertSeriesWithStructure("series-b");
      const ceremony = await insertCeremony(db.pool, {}, false);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id) VALUES ($1, $2, $3)`,
            [a.seriesId, ceremony.id, b.eventId]
          )
        )
      ).toBe("23503");
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
             VALUES ($1, $2, $3)`,
            [a.seriesId, edition.id, b.pictureId]
          )
        )
      ).toBe("23503");
    });

    it("allows a ceremony in more than one Series", async () => {
      const a = await insertSeriesWithStructure("series-a");
      const b = await insertSeriesWithStructure("series-b");
      const ceremony = await insertCeremony(db.pool, {}, false);
      for (const s of [a, b]) {
        await db.pool.query(
          `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id) VALUES ($1, $2, $3)`,
          [s.seriesId, ceremony.id, s.eventId]
        );
      }
      const { rows } = await db.pool.query(
        `SELECT 1 FROM series_ceremony WHERE ceremony_id = $1`,
        [ceremony.id]
      );
      expect(rows).toHaveLength(2);
    });

    it("fixes codes, kind by code, status and activation time", async () => {
      const { seriesId } = await insertSeriesWithStructure("2026-27");
      const cases: Array<[string, unknown[]]> = [
        [
          `INSERT INTO series_category (series_id, code, name, kind, sort_index)
           VALUES ($1, 'ACTOR', 'Best Actor', 'FILM', 2)`,
          [seriesId]
        ],
        [
          `INSERT INTO series_category (series_id, code, name, kind, sort_index)
           VALUES ($1, 'SCREENPLAY', 'Best Screenplay', 'ACTING', 6)`,
          [seriesId]
        ],
        [
          `INSERT INTO series_category (series_id, code, name, kind, sort_index)
           VALUES ($1, 'DOCUMENTARY', 'Best Documentary', 'FILM', 8)`,
          [seriesId]
        ],
        [
          `INSERT INTO series_event (series_id, code, name, sort_index)
           VALUES ($1, 'SAG', 'Actor Awards', 5)`,
          [seriesId]
        ],
        [`UPDATE series SET status = 'ACTIVE' WHERE id = $1`, [seriesId]],
        [
          `UPDATE series SET status = 'LIVE', activated_at = now() WHERE id = $1`,
          [seriesId]
        ]
      ];
      for (const [sql, params] of cases) {
        expect(await pgErrorCode(db.pool.query(sql, params)), sql).toBe("23514");
      }
    });
  });
});
