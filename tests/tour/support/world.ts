import { E2E_API_ORIGIN, type E2eStack } from "../../e2e/support/stack";

/**
 * The tour's seed world: two ceremonies of one awards season, a Circuit over both
 * with three film categories mapped to each ceremony's, and four players. Dates are
 * relative to today (Pacific), so the season starts before its first scoring day;
 * `advanceDays` (clock.ts) moves the world through it.
 */

export const PASSWORD = "tour-secret-123";
export const ADMIN_USERNAME = "tour-admin";
export const CIRCUIT_NAME = "Awards Season 2035";
export const LEAGUE_NAME = "Friday Film Club";

/** The player the tour follows ("you"), who also runs the league. */
export const YOU = "cora";
/** Seeded league-mates; Pia accepts an invite in the browser, the others are added. */
export const MATES = ["pia", "theo", "emmy"] as const;
/** Registers in the browser and joins through an invite link. */
export const NEWCOMER = "nadia";

export const FILMS = [
  "The Long Field",
  "Paper Moons",
  "Salt and Iron",
  "Northbound",
  "A Quiet Harbor",
  "Glass Orchard",
  "The Cartographer's Daughter",
  "Low Tide",
  "Kingfisher",
  "Summer of Lanterns",
  "Static",
  "Blue Hour"
] as const;
export type Film = (typeof FILMS)[number];

export const CATEGORIES = [
  "Best Picture",
  "Best Screenplay",
  "Best Cinematography"
] as const;
/** Material Symbols names, one per category. */
const CATEGORY_ICONS = ["emoji_events", "description", "videocam"] as const;
export type Category = (typeof CATEGORIES)[number];

type CeremonySpec = {
  code: string;
  name: string;
  event: string;
  /** Days from today (Pacific) to the nominations announcement and to the ceremony. */
  nominationsIn: number;
  ceremonyIn: number;
  nominees: Record<Category, Film[]>;
  winners: Record<Category, Film>;
};

export const CEREMONIES: readonly CeremonySpec[] = [
  {
    code: "northlight-2035",
    name: "Northlight Awards 2035",
    event: "Northlight Awards",
    nominationsIn: 2,
    ceremonyIn: 6,
    nominees: {
      "Best Picture": [
        "The Long Field",
        "Paper Moons",
        "Salt and Iron",
        "Northbound",
        "Kingfisher"
      ],
      "Best Screenplay": [
        "Paper Moons",
        "A Quiet Harbor",
        "Glass Orchard",
        "Low Tide",
        "Static"
      ],
      "Best Cinematography": [
        "The Long Field",
        "Northbound",
        "Summer of Lanterns",
        "Blue Hour",
        "Kingfisher"
      ]
    },
    winners: {
      "Best Picture": "Paper Moons",
      "Best Screenplay": "Glass Orchard",
      "Best Cinematography": "Northbound"
    }
  },
  {
    code: "grand-awards-2035",
    name: "Grand Awards 2035",
    event: "Grand Awards",
    nominationsIn: 9,
    ceremonyIn: 14,
    nominees: {
      "Best Picture": [
        "The Long Field",
        "Paper Moons",
        "Salt and Iron",
        "The Cartographer's Daughter",
        "Kingfisher"
      ],
      "Best Screenplay": [
        "Paper Moons",
        "Salt and Iron",
        "Glass Orchard",
        "Low Tide",
        "Blue Hour"
      ],
      "Best Cinematography": [
        "The Long Field",
        "Northbound",
        "Summer of Lanterns",
        "Static",
        "Kingfisher"
      ]
    },
    winners: {
      "Best Picture": "The Long Field",
      "Best Screenplay": "Low Tide",
      "Best Cinematography": "Summer of Lanterns"
    }
  }
];

export type World = {
  databaseUrl: string;
  circuitId: number;
  ceremonies: Array<{
    id: number;
    code: string;
    name: string;
    /** Category edition id and nomination id per category and nominee. */
    categories: Record<
      Category,
      { editionId: number; nominations: Record<string, number> }
    >;
  }>;
  /** Circuit selection id per category and film. */
  selections: Record<Category, Record<Film, number>>;
  /** TMDB id per film (film search is answered from these). */
  tmdbIds: Record<Film, number>;
};

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<T> {
  const res = await fetch(`${E2E_API_ORIGIN}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Signs in through the API and returns the session token from the auth cookie. */
export async function apiLogin(username: string): Promise<string> {
  const res = await fetch(`${E2E_API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD })
  });
  if (!res.ok) throw new Error(`login ${username} -> ${res.status}`);
  for (const cookie of res.headers.getSetCookie()) {
    const match = /^auth_token=([^;]+)/.exec(cookie);
    if (match?.[1]) return match[1];
  }
  throw new Error("login did not set an auth_token cookie");
}

export { api as tourApi };

/** Today's date in America/Los_Angeles, `YYYY-MM-DD`. */
export function pacificToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    now
  );
}

export async function seedWorld(stack: E2eStack): Promise<World> {
  const { pool } = stack;

  // The admin registers through the API (it seeds the password hash every other
  // account copies); registration is rate limited, so players are written directly.
  const reg = await api<{ user: { id: number } }>("POST", "/auth/register", {
    username: ADMIN_USERNAME,
    email: `${ADMIN_USERNAME}@example.com`,
    password: PASSWORD
  });
  await pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [reg.user.id]);
  for (const username of [YOU, ...MATES]) {
    await pool.query(
      `WITH admin AS (
         SELECT u.avatar_key, p.password_hash, p.password_algo
         FROM app_user u JOIN auth_password p ON p.user_id = u.id
         WHERE u.username = $1
       ), created AS (
         INSERT INTO app_user (username, email, avatar_key)
         SELECT $2, $2 || '@example.com', avatar_key FROM admin
         RETURNING id
       )
       INSERT INTO auth_password (user_id, password_hash, password_algo, password_set_at)
       SELECT created.id, admin.password_hash, admin.password_algo, now()
       FROM created, admin`,
      [ADMIN_USERNAME, username]
    );
  }
  // Starting a full awards season is gated to super admins (as in the e2e
  // suite's `grantSuperAdmin`), so the commissioner needs the role.
  await pool.query(
    `UPDATE app_user SET is_admin = TRUE, admin_role = 'SUPER_ADMIN' WHERE username = $1`,
    [YOU]
  );
  const token = await apiLogin(ADMIN_USERNAME);
  const today = pacificToday();

  // Ceremonies, with dates relative to today.
  const ceremonyIds: number[] = [];
  for (const [i, c] of CEREMONIES.entries()) {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO ceremony (code, name, year, nominations_on, starts_at)
       VALUES ($1, $2, 2035, $3::date + $4::int,
               (($3::date + $5::int) + time '17:00') AT TIME ZONE 'America/Los_Angeles')
       RETURNING id::int`,
      [c.code, c.name, today, c.nominationsIn, c.ceremonyIn]
    );
    ceremonyIds.push(rows[0]!.id);
    if (i === CEREMONIES.length - 1) {
      await pool.query(
        `INSERT INTO app_config (id, active_ceremony_id) VALUES (TRUE, $1)
         ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
        [rows[0]!.id]
      );
    }
  }

  // One nominee upload for both ceremonies: category families shared, editions per ceremony.
  const films = FILMS.map((title, i) => ({ id: i + 1, title, country: null }));
  const filmId = (title: Film) => films.find((f) => f.title === title)!.id;
  let editionId = 0;
  let nominationId = 0;
  const editions: Array<{
    id: number;
    ceremony_id: number;
    family_id: number;
    unit_kind: string;
    icon_id: number;
    sort_index: number;
  }> = [];
  const nominations: Array<{
    id: number;
    category_edition_id: number;
    film_id: number;
    song_id: null;
    performance_id: null;
  }> = [];
  const worldCeremonies: World["ceremonies"] = [];
  for (const [ci, c] of CEREMONIES.entries()) {
    const categories = {} as World["ceremonies"][number]["categories"];
    for (const [fi, category] of CATEGORIES.entries()) {
      const id = ++editionId;
      editions.push({
        id,
        ceremony_id: ceremonyIds[ci]!,
        family_id: fi + 1,
        unit_kind: "FILM",
        icon_id: fi + 1,
        sort_index: fi + 1
      });
      const byFilm: Record<string, number> = {};
      for (const film of c.nominees[category]) {
        const nid = ++nominationId;
        nominations.push({
          id: nid,
          category_edition_id: id,
          film_id: filmId(film),
          song_id: null,
          performance_id: null
        });
        byFilm[film] = nid;
      }
      categories[category] = { editionId: id, nominations: byFilm };
    }
    worldCeremonies.push({
      id: ceremonyIds[ci]!,
      code: c.code,
      name: c.name,
      categories
    });
  }
  await api(
    "POST",
    "/admin/nominees/upload",
    {
      icons: CATEGORY_ICONS.map((code, i) => ({
        id: i + 1,
        code,
        name: code,
        asset_path: `/icons/${code}.svg`
      })),
      ceremonies: CEREMONIES.map((c, i) => ({
        id: ceremonyIds[i],
        code: c.code,
        name: c.name,
        year: 2035
      })),
      category_families: CATEGORIES.map((name, i) => ({
        id: i + 1,
        code: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        icon_id: i + 1,
        default_unit_kind: "FILM"
      })),
      category_editions: editions,
      films,
      songs: [],
      performances: [],
      people: [],
      nominations,
      nomination_contributors: []
    },
    token
  );
  await pool.query(`UPDATE ceremony SET status = 'ACTIVE' WHERE id = ANY($1::bigint[])`, [
    ceremonyIds
  ]);

  // TMDB ids, so a pick resolves to its existing selection without calling TMDB.
  const tmdbIds = {} as Record<Film, number>;
  for (const title of FILMS) {
    tmdbIds[title] = 951000 + filmId(title);
    await pool.query(`UPDATE film SET tmdb_id = $1 WHERE id = $2`, [
      tmdbIds[title],
      filmId(title)
    ]);
  }

  // The Circuit: one event per ceremony, three categories mapped to each ceremony's.
  const circuit = await pool.query<{ id: number }>(
    `INSERT INTO circuit (code, name, status, activated_at)
     VALUES ('awards-season-2035', $1, 'ACTIVE', now()) RETURNING id::int`,
    [CIRCUIT_NAME]
  );
  const circuitId = circuit.rows[0]!.id;
  for (const [i, c] of CEREMONIES.entries()) {
    const event = await pool.query<{ id: number }>(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index, is_group)
       VALUES ($1, $2, $3, $4, FALSE) RETURNING id::int`,
      [circuitId, c.code, c.event, i]
    );
    await pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, 0)`,
      [circuitId, ceremonyIds[i], event.rows[0]!.id]
    );
  }
  const selections = {} as World["selections"];
  for (const [i, category] of CATEGORIES.entries()) {
    // The template's icon is copied, as an admin add does.
    const row = await pool.query<{ id: number }>(
      `INSERT INTO circuit_category
         (circuit_id, code, name, kind, sort_index, category_family_id, icon_id, icon_variant)
       SELECT $1, $2, $3, 'FILM', $4, cf.id, cf.icon_id, cf.icon_variant
       FROM category_family cf WHERE cf.id = $5
       RETURNING id::int`,
      [circuitId, category.toLowerCase().replace(/\s+/g, "-"), category, i, i + 1]
    );
    const circuitCategoryId = row.rows[0]!.id;
    for (const c of worldCeremonies) {
      await pool.query(
        `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
         VALUES ($1, $2, $3)`,
        [circuitId, c.categories[category].editionId, circuitCategoryId]
      );
    }
    selections[category] = {} as Record<Film, number>;
    for (const title of FILMS) {
      const selection = await pool.query<{ id: number }>(
        `INSERT INTO circuit_selection
           (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id)
         VALUES ($1, $2, NULL, $3, NULL) RETURNING id::int`,
        [circuitCategoryId, tmdbIds[title], filmId(title)]
      );
      selections[category][title] = selection.rows[0]!.id;
    }
  }

  return {
    databaseUrl: stack.databaseUrl,
    circuitId,
    ceremonies: worldCeremonies,
    selections,
    tmdbIds
  };
}
