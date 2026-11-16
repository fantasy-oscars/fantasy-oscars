import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertCategoryEdition, insertCeremony } from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

type ForeignKey = { constraint_name: string; child_table: string; parent_table: string };

/**
 * Foreign keys between the circuit_* tables and the Season and ceremony-draft
 * tables, in either direction (ADR 0005, section 10). Circuit tables may
 * reference shared reference data such as ceremony, category_edition and
 * category_family (ADR 0006). Joining on
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
         fk.child_table LIKE 'circuit%' AS child_circuit,
         fk.parent_table LIKE 'circuit%' AS parent_circuit,
         fk.child_table ~ '^(season|draft)(_|$)' AS child_season_or_draft,
         fk.parent_table ~ '^(season|draft)(_|$)' AS parent_season_or_draft
       FROM fk
     )
     SELECT constraint_name, child_table, parent_table
     FROM classified
     WHERE (child_circuit AND parent_season_or_draft)
        OR (parent_circuit AND NOT child_circuit)
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

async function insertCircuitWithStructure(code: string) {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit (code, name) VALUES ($1, $1) RETURNING id::int`,
    [code]
  );
  const circuitId = rows[0]!.id;
  const { rows: events } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
     VALUES ($1, 'golden-globes', 'Golden Globe Awards', 0) RETURNING id::int`,
    [circuitId]
  );
  const { rows: categories } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
     VALUES ($1, 'actor', 'Actor', 'ACTING', 0),
            ($1, 'picture', 'Picture', 'FILM', 1)
     RETURNING id::int`,
    [circuitId]
  );
  return {
    circuitId,
    eventId: events[0]!.id,
    actorId: categories[0]!.id,
    pictureId: categories[1]!.id
  };
}

describe("circuit schema", () => {
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
    it("has no foreign key between circuit_* and the Season or draft tables", async () => {
      expect(await forbiddenForeignKeys(db.pool)).toEqual([]);
    });

    it("detects a circuit_* table that references a Season table", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(
          `CREATE TABLE circuit_probe (season_id bigint REFERENCES season(id))`
        );
        expect(await forbiddenForeignKeys(client)).toEqual([
          expect.objectContaining({
            child_table: "circuit_probe",
            parent_table: "season"
          })
        ]);
      });
    });

    it("detects an existing table that gains a reference to a circuit_* table", async () => {
      await inRolledBackTransaction(async (client) => {
        await client.query(
          `ALTER TABLE draft ADD COLUMN circuit_id bigint REFERENCES circuit(id)`
        );
        expect(await forbiddenForeignKeys(client)).toEqual([
          expect.objectContaining({ child_table: "draft", parent_table: "circuit" })
        ]);
      });
    });

    it("lets a Circuit category reference its category template", async () => {
      const { rows } = await db.pool.query<{ parent: string; delete_rule: string }>(
        `SELECT ccu.table_name::text AS parent, rc.delete_rule::text AS delete_rule
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = rc.unique_constraint_name
         WHERE kcu.table_name = 'circuit_category'
           AND kcu.column_name = 'category_family_id'`
      );
      expect(rows).toEqual([{ parent: "category_family", delete_rule: "SET NULL" }]);
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

  describe("names", () => {
    it("leaves no table, column, constraint, index or sequence named after series", async () => {
      const { rows } = await db.pool.query<{ kind: string; name: string }>(
        `SELECT 'relation' AS kind, c.relname::text AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname ILIKE '%series%'
         UNION ALL
         SELECT 'constraint', con.conname::text
         FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
         WHERE n.nspname = 'public' AND con.conname ILIKE '%series%'
         UNION ALL
         SELECT 'column', table_name || '.' || column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name ILIKE '%series%'`
      );
      expect(rows).toEqual([]);
    });
  });

  describe("constraints", () => {
    it("maps several categories of one ceremony to one Circuit category", async () => {
      const { circuitId, eventId, actorId } = await insertCircuitWithStructure("2026-27");
      const ceremony = await insertCeremony(db.pool, {}, false);
      const drama = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      const comedy = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id)
         VALUES ($1, $2, $3)`,
        [circuitId, ceremony.id, eventId]
      );
      for (const edition of [drama, comedy]) {
        await db.pool.query(
          `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
           VALUES ($1, $2, $3)`,
          [circuitId, edition.id, actorId]
        );
      }
      const { rows } = await db.pool.query(
        `SELECT 1 FROM circuit_mapping WHERE circuit_category_id = $1`,
        [actorId]
      );
      expect(rows).toHaveLength(2);
    });

    it("maps a ceremony category at most once per Circuit", async () => {
      const { circuitId, eventId, actorId, pictureId } =
        await insertCircuitWithStructure("2026-27");
      const ceremony = await insertCeremony(db.pool, {}, false);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id)
         VALUES ($1, $2, $3)`,
        [circuitId, ceremony.id, eventId]
      );
      const insertMapping = (categoryId: number) =>
        db.pool.query(
          `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
           VALUES ($1, $2, $3)`,
          [circuitId, edition.id, categoryId]
        );
      await insertMapping(actorId);
      expect(await pgErrorCode(insertMapping(actorId))).toBe("23505");
      expect(await pgErrorCode(insertMapping(pictureId))).toBe("23505");
    });

    it("keeps associations and mappings inside one Circuit", async () => {
      const a = await insertCircuitWithStructure("circuit-a");
      const b = await insertCircuitWithStructure("circuit-b");
      const ceremony = await insertCeremony(db.pool, {}, false);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id)
             VALUES ($1, $2, $3)`,
            [a.circuitId, ceremony.id, b.eventId]
          )
        )
      ).toBe("23503");
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
             VALUES ($1, $2, $3)`,
            [a.circuitId, edition.id, b.pictureId]
          )
        )
      ).toBe("23503");
    });

    it("allows a ceremony in more than one Circuit", async () => {
      const a = await insertCircuitWithStructure("circuit-a");
      const b = await insertCircuitWithStructure("circuit-b");
      const ceremony = await insertCeremony(db.pool, {}, false);
      for (const c of [a, b]) {
        await db.pool.query(
          `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id)
           VALUES ($1, $2, $3)`,
          [c.circuitId, ceremony.id, c.eventId]
        );
      }
      const { rows } = await db.pool.query(
        `SELECT 1 FROM circuit_ceremony WHERE ceremony_id = $1`,
        [ceremony.id]
      );
      expect(rows).toHaveLength(2);
    });

    it("accepts any event or category code, unique within a Circuit", async () => {
      const { circuitId } = await insertCircuitWithStructure("2026-27");
      await db.pool.query(
        `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
         VALUES ($1, 'cesars', 'César Awards', 1)`,
        [circuitId]
      );
      await db.pool.query(
        `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
         VALUES ($1, 'documentary', 'Documentary', 'FILM', 2)`,
        [circuitId]
      );
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
             VALUES ($1, 'cesars', 'Again', 2)`,
            [circuitId]
          )
        )
      ).toBe("23505");
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
             VALUES ($1, 'documentary', 'Again', 'FILM', 3)`,
            [circuitId]
          )
        )
      ).toBe("23505");
    });

    it("limits kind to FILM or ACTING, and fixes status and activation time", async () => {
      const { circuitId } = await insertCircuitWithStructure("2026-27");
      const cases: Array<[string, unknown[]]> = [
        [
          `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
           VALUES ($1, 'song', 'Song', 'SONG', 2)`,
          [circuitId]
        ],
        [
          `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index, icon_variant)
           VALUES ($1, 'score', 'Score', 'FILM', 2, 'upside-down')`,
          [circuitId]
        ],
        [`UPDATE circuit SET status = 'ACTIVE' WHERE id = $1`, [circuitId]],
        [
          `UPDATE circuit SET status = 'LIVE', activated_at = now() WHERE id = $1`,
          [circuitId]
        ]
      ];
      for (const [sql, params] of cases) {
        expect(await pgErrorCode(db.pool.query(sql, params)), sql).toBe("23514");
      }
    });
  });
});
