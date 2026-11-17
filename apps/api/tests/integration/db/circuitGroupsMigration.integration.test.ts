import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, startTestDatabase } from "../../db.js";
import { insertCategoryEdition, insertCeremony } from "../../factories/db.js";

// Rows as the old hard-coded setup (migration 022) left them: five fixed
// events, two of them without ceremonies, eight categories without templates,
// and results dates entered apart from the ceremony datetime. Every later
// migration then runs, 025 included.
describe("025 circuit groups and derived results date migration", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  const ids = {
    circuit: 0,
    events: {} as Record<string, number>,
    categories: [] as number[],
    globes: 0,
    sag: 0,
    dga: 0,
    oscars: 0,
    drama: 0,
    comedy: 0,
    picture: 0
  };

  beforeAll(async () => {
    db = await startTestDatabase({ migrateBefore: "023_circuit_admin_structure.sql" });
    const pool = db.pool;

    const { rows: series } = await pool.query<{ id: number }>(
      `INSERT INTO series (code, name) VALUES ('2027-season', '2027 Season') RETURNING id::int`
    );
    ids.circuit = series[0]!.id;
    const { rows: events } = await pool.query<{ id: number; code: string }>(
      `INSERT INTO series_event (series_id, code, name, sort_index)
       VALUES ($1, 'CRITICS_CHOICE', 'Critics Choice Awards', 0),
              ($1, 'GOLDEN_GLOBES', 'Golden Globe Awards', 1),
              ($1, 'GUILDS', 'Guild Awards', 2),
              ($1, 'BAFTA', 'BAFTA Film Awards', 3),
              ($1, 'OSCARS', 'Academy Awards', 4)
       RETURNING id::int, code`,
      [ids.circuit]
    );
    ids.events = Object.fromEntries(events.map((e) => [e.code, e.id]));
    const { rows: categories } = await pool.query<{ id: number }>(
      `INSERT INTO series_category (series_id, code, name, kind, sort_index)
       SELECT $1, code, name, kind, ord - 1
       FROM unnest(
         ARRAY['PICTURE','DIRECTOR','ACTOR','ACTRESS','SUPPORTING_ACTOR',
               'SUPPORTING_ACTRESS','SCREENPLAY','ANIMATED_FEATURE'],
         ARRAY['Picture','Director','Actor','Actress','Supporting Actor',
               'Supporting Actress','Screenplay','Animated Feature'],
         ARRAY['FILM','FILM','ACTING','ACTING','ACTING','ACTING','FILM','FILM']
       ) WITH ORDINALITY AS t(code, name, kind, ord)
       RETURNING id::int`,
      [ids.circuit]
    );
    ids.categories = categories.map((c) => c.id);

    const ceremony = async (code: string, startsAt: string | null, resultsOn: string) => {
      const c = await insertCeremony(pool, { code }, false);
      await pool.query(
        `UPDATE ceremony SET starts_at = $2, results_on = $3 WHERE id = $1`,
        [c.id, startsAt, resultsOn]
      );
      return c.id;
    };
    // No datetime: back-filled at 17:00 Pacific on the results date.
    ids.globes = await ceremony("globes-2027", null, "2027-01-10");
    // Agrees with its datetime (18:00 Pacific on Feb 28).
    ids.sag = await ceremony("sag-2027", "2027-03-01T02:00:00Z", "2027-02-28");
    // Disagrees: the datetime (19:00 Pacific on Jan 31) wins.
    ids.dga = await ceremony("dga-2027", "2027-02-01T03:00:00Z", "2027-01-30");
    ids.oscars = await ceremony("oscars-2027", "2027-03-15T01:00:00Z", "2027-03-14");
    await pool.query(
      `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id)
       VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $5), ($1, $7, $8)`,
      [
        ids.circuit,
        ids.globes,
        ids.events.GOLDEN_GLOBES,
        ids.dga,
        ids.events.GUILDS,
        ids.sag,
        ids.oscars,
        ids.events.OSCARS
      ]
    );

    ids.drama = (await insertCategoryEdition(pool, { ceremony_id: ids.globes })).id;
    ids.comedy = (await insertCategoryEdition(pool, { ceremony_id: ids.globes })).id;
    ids.picture = (await insertCategoryEdition(pool, { ceremony_id: ids.oscars })).id;
    await pool.query(
      `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
       VALUES ($1, $2, $3), ($1, $4, $3), ($1, $5, $6)`,
      [
        ids.circuit,
        ids.drama,
        ids.categories[2],
        ids.comedy,
        ids.picture,
        ids.categories[0]
      ]
    );

    await applyMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  it("drops results_on after back-filling starts_at, keeping starts_at where they disagree", async () => {
    const { rows: columns } = await db.pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ceremony'
         AND column_name = 'results_on'`
    );
    expect(columns).toEqual([]);

    const { rows } = await db.pool.query<{ id: number; starts_at: Date; day: string }>(
      `SELECT id::int, starts_at,
         (starts_at AT TIME ZONE 'America/Los_Angeles')::date::text AS day
       FROM ceremony ORDER BY id`
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ids.globes)!.starts_at.toISOString()).toBe(
      "2027-01-11T01:00:00.000Z"
    );
    expect(byId.get(ids.globes)!.day).toBe("2027-01-10");
    expect(byId.get(ids.sag)!.starts_at.toISOString()).toBe("2027-03-01T02:00:00.000Z");
    expect(byId.get(ids.dga)!.starts_at.toISOString()).toBe("2027-02-01T03:00:00.000Z");
    expect(byId.get(ids.dga)!.day).toBe("2027-01-31");
    expect(byId.get(ids.oscars)!.day).toBe("2027-03-14");
  });

  it("removes the empty legacy events, marks multi-ceremony events as groups and closes the order", async () => {
    const { rows } = await db.pool.query(
      `SELECT id::int, code, is_group, sort_index FROM circuit_event ORDER BY sort_index`
    );
    expect(rows).toEqual([
      {
        id: ids.events.GOLDEN_GLOBES,
        code: "GOLDEN_GLOBES",
        is_group: false,
        sort_index: 0
      },
      { id: ids.events.GUILDS, code: "GUILDS", is_group: true, sort_index: 1 },
      { id: ids.events.OSCARS, code: "OSCARS", is_group: false, sort_index: 2 }
    ]);
  });

  it("orders the ceremonies inside each event by id", async () => {
    const { rows } = await db.pool.query(
      `SELECT ceremony_id::int, circuit_event_id::int, sort_index
       FROM circuit_ceremony ORDER BY circuit_event_id, sort_index`
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        // SAG was created first, so it has the lower id.
        { ceremony_id: ids.sag, circuit_event_id: ids.events.GUILDS, sort_index: 0 },
        { ceremony_id: ids.dga, circuit_event_id: ids.events.GUILDS, sort_index: 1 },
        {
          ceremony_id: ids.globes,
          circuit_event_id: ids.events.GOLDEN_GLOBES,
          sort_index: 0
        }
      ])
    );
    expect(rows).toHaveLength(4);
  });

  it("keeps every category and mapping", async () => {
    const { rows: categories } = await db.pool.query<{ id: number }>(
      `SELECT id::int FROM circuit_category ORDER BY sort_index`
    );
    expect(categories.map((c) => c.id)).toEqual(ids.categories);
    const { rows: mappings } = await db.pool.query(
      `SELECT category_edition_id::int, circuit_category_id::int
       FROM circuit_mapping ORDER BY category_edition_id`
    );
    expect(mappings).toEqual([
      { category_edition_id: ids.drama, circuit_category_id: ids.categories[2] },
      { category_edition_id: ids.comedy, circuit_category_id: ids.categories[2] },
      { category_edition_id: ids.picture, circuit_category_id: ids.categories[0] }
    ]);
  });
});
