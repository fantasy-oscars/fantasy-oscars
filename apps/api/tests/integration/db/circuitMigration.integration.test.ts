import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, startTestDatabase } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertIcon
} from "../../factories/db.js";

const MIGRATION = "023_circuit_admin_structure.sql";
// Later migrations reshape these rows again (025 tidies events); stop before them.
const NEXT_MIGRATION = "024_password_reset_token.sql";

// Rows written with the schema migration 022 left behind, then migrated.
describe("023 circuit migration", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  const ids = {
    circuit: 0,
    globes: 0,
    oscars: 0,
    picture: 0,
    actor: 0,
    actorTemplate: 0,
    actorIcon: 0,
    globesCeremony: 0,
    oscarsCeremony: 0,
    drama: 0,
    comedy: 0,
    bestPicture: 0
  };

  beforeAll(async () => {
    db = await startTestDatabase({ migrateBefore: MIGRATION });
    const pool = db.pool;

    const icon = await insertIcon(pool, { code: "actor-icon" });
    const template = await insertCategoryFamily(pool, {
      code: "actor",
      name: "Lead Actor",
      icon_id: icon.id,
      icon_variant: "inverted",
      default_unit_kind: "PERFORMANCE"
    });
    ids.actorTemplate = template.id;
    ids.actorIcon = icon.id;

    const { rows: series } = await pool.query<{ id: number }>(
      `INSERT INTO series (code, name, status, activated_at)
       VALUES ('2026-27', 'Awards Season', 'ACTIVE', now()) RETURNING id::int`
    );
    ids.circuit = series[0]!.id;
    const { rows: events } = await pool.query<{ id: number }>(
      `INSERT INTO series_event (series_id, code, name, sort_index)
       VALUES ($1, 'GOLDEN_GLOBES', 'Golden Globe Awards', 1),
              ($1, 'OSCARS', 'Academy Awards', 4)
       RETURNING id::int`,
      [ids.circuit]
    );
    ids.globes = events[0]!.id;
    ids.oscars = events[1]!.id;
    const { rows: categories } = await pool.query<{ id: number }>(
      `INSERT INTO series_category (series_id, code, name, kind, sort_index)
       VALUES ($1, 'PICTURE', 'Best Picture', 'FILM', 0),
              ($1, 'ACTOR', 'Best Actor', 'ACTING', 2)
       RETURNING id::int`,
      [ids.circuit]
    );
    ids.picture = categories[0]!.id;
    ids.actor = categories[1]!.id;

    const globes = await insertCeremony(pool, { code: "globes-2027" }, false);
    const oscars = await insertCeremony(pool, { code: "oscars-2027" }, false);
    ids.globesCeremony = globes.id;
    ids.oscarsCeremony = oscars.id;
    await pool.query(
      `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [ids.circuit, globes.id, ids.globes, oscars.id, ids.oscars]
    );
    ids.drama = (
      await insertCategoryEdition(pool, { ceremony_id: globes.id, code: "actor-drama" })
    ).id;
    ids.comedy = (
      await insertCategoryEdition(pool, { ceremony_id: globes.id, code: "actor-comedy" })
    ).id;
    ids.bestPicture = (
      await insertCategoryEdition(pool, { ceremony_id: oscars.id, code: "best-picture" })
    ).id;
    await pool.query(
      `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [ids.circuit, ids.drama, ids.actor, ids.bestPicture, ids.picture]
    );

    await applyMigrations(pool, { before: NEXT_MIGRATION });
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it("keeps the Circuit row", async () => {
    const { rows } = await db.pool.query(
      `SELECT id::int, code, name, status FROM circuit`
    );
    expect(rows).toEqual([
      { id: ids.circuit, code: "2026-27", name: "Awards Season", status: "ACTIVE" }
    ]);
  });

  it("keeps events, now free of the fixed code list", async () => {
    const { rows } = await db.pool.query(
      `SELECT id::int, circuit_id::int, code, sort_index
       FROM circuit_event ORDER BY sort_index`
    );
    expect(rows).toEqual([
      { id: ids.globes, circuit_id: ids.circuit, code: "GOLDEN_GLOBES", sort_index: 1 },
      { id: ids.oscars, circuit_id: ids.circuit, code: "OSCARS", sort_index: 4 }
    ]);
    await db.pool.query(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
       VALUES ($1, 'guilds', 'Guild Awards', 5)`,
      [ids.circuit]
    );
  });

  it("keeps categories and links the template whose code matches", async () => {
    const { rows } = await db.pool.query(
      `SELECT id::int, code, kind, category_family_id::int, icon_id::int, icon_variant
       FROM circuit_category ORDER BY sort_index`
    );
    expect(rows).toEqual([
      {
        id: ids.picture,
        code: "PICTURE",
        kind: "FILM",
        category_family_id: null,
        icon_id: null,
        icon_variant: "default"
      },
      {
        id: ids.actor,
        code: "ACTOR",
        kind: "ACTING",
        category_family_id: ids.actorTemplate,
        icon_id: ids.actorIcon,
        icon_variant: "inverted"
      }
    ]);
  });

  it("keeps associations and mappings", async () => {
    const { rows: associations } = await db.pool.query(
      `SELECT circuit_id::int, ceremony_id::int, circuit_event_id::int
       FROM circuit_ceremony ORDER BY ceremony_id`
    );
    expect(associations).toEqual([
      {
        circuit_id: ids.circuit,
        ceremony_id: ids.globesCeremony,
        circuit_event_id: ids.globes
      },
      {
        circuit_id: ids.circuit,
        ceremony_id: ids.oscarsCeremony,
        circuit_event_id: ids.oscars
      }
    ]);
    const { rows: mappings } = await db.pool.query(
      `SELECT category_edition_id::int, circuit_category_id::int
       FROM circuit_mapping ORDER BY category_edition_id`
    );
    expect(mappings).toEqual([
      { category_edition_id: ids.drama, circuit_category_id: ids.actor },
      { category_edition_id: ids.bestPicture, circuit_category_id: ids.picture }
    ]);
  });

  it("lets a second category of the same ceremony map to the same Circuit category", async () => {
    await db.pool.query(
      `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
       VALUES ($1, $2, $3)`,
      [ids.circuit, ids.comedy, ids.actor]
    );
    const { rows } = await db.pool.query(
      `SELECT 1 FROM circuit_mapping WHERE circuit_category_id = $1`,
      [ids.actor]
    );
    expect(rows).toHaveLength(2);
  });

  it("continues the renamed sequences", async () => {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name) VALUES ('2027-28', 'Next') RETURNING id::int`
    );
    expect(rows[0]!.id).toBeGreaterThan(ids.circuit);
  });

  it("records the migration in the history", async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM migration_history WHERE filename = $1`,
      [MIGRATION]
    );
    expect(rows).toHaveLength(1);
  });
});
