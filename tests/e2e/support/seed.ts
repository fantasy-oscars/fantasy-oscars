import { E2E_API_ORIGIN, type E2eStack } from "./stack";

export const ADMIN_USERNAME = "e2e-admin";
export const ADMIN_PASSWORD = "secret123";
export const CEREMONY_NAME = "E2E Awards 2035";

/** Category edition ids and their nominees, as inserted by the dataset below. */
export const CATEGORIES = [
  { editionId: 1, name: "Best Picture", nominees: ["Film A", "Film B"] },
  { editionId: 2, name: "Best Director", nominees: ["Film C", "Film D"] },
  { editionId: 3, name: "Best Editing", nominees: ["Film E", "Film F"] }
] as const;

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${E2E_API_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as T;
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

/**
 * Logs the seed admin in and returns the session token from the auth cookie
 * (the API no longer returns it in the body); it is used as a Bearer credential
 * for the seeding calls, which are not made from a browser.
 *
 * The admin logs in once per run: global setup's first call keeps the token in
 * `E2E_ADMIN_TOKEN`, which the workers inherit. Every spec shares this one
 * account and the loopback IP, and the API allows 8 logins per user and IP a
 * minute, so a fresh login per spec would trip the limit as specs are added.
 */
export async function adminLogin(): Promise<string> {
  const cached = process.env.E2E_ADMIN_TOKEN;
  if (cached) return cached;
  const res = await fetch(`${E2E_API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  });
  if (!res.ok) throw new Error(`POST /auth/login -> ${res.status}`);
  for (const cookie of res.headers.getSetCookie()) {
    const match = /^auth_token=([^;]+)/.exec(cookie);
    if (match?.[1]) {
      process.env.E2E_ADMIN_TOKEN = match[1];
      return match[1];
    }
  }
  throw new Error("login did not set an auth_token cookie");
}

/**
 * Creates an admin and a published, active ceremony with three categories of two
 * nominees each (nomination ids 1-6, in category order).
 */
export async function seedCeremony(stack: Pick<E2eStack, "pool">) {
  const reg = await postJson<{ user: { id: number } }>("/auth/register", {
    username: ADMIN_USERNAME,
    email: "e2e-admin@example.com",
    password: ADMIN_PASSWORD
  });
  await stack.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
    reg.user.id
  ]);
  const token = await adminLogin();

  const { rows } = await stack.pool.query<{ id: number }>(
    `INSERT INTO ceremony (code, name, year, starts_at)
     VALUES ('e2e-awards', $1, 2035, '2035-03-01T00:00:00Z')
     RETURNING id::int`,
    [CEREMONY_NAME]
  );
  const ceremony = {
    id: rows[0]!.id,
    code: "e2e-awards",
    name: CEREMONY_NAME,
    year: 2035
  };

  await stack.pool.query(
    `INSERT INTO app_config (id, active_ceremony_id) VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
    [ceremony.id]
  );

  const films = CATEGORIES.flatMap((c) => c.nominees).map((title, i) => ({
    id: i + 1,
    title,
    country: null
  }));
  let nominationId = 0;
  const nominations = CATEGORIES.flatMap((c) =>
    c.nominees.map((title) => ({
      id: ++nominationId,
      category_edition_id: c.editionId,
      film_id: films.find((f) => f.title === title)!.id,
      song_id: null,
      performance_id: null
    }))
  );
  const dataset = {
    icons: [{ id: 1, code: "film", name: "Film", asset_path: "/icons/film.svg" }],
    ceremonies: [
      { id: ceremony.id, code: ceremony.code, name: ceremony.name, year: ceremony.year }
    ],
    category_families: CATEGORIES.map((c) => ({
      id: c.editionId,
      code: c.name.toLowerCase().replace(/\s+/g, "-"),
      name: c.name,
      icon_id: 1,
      default_unit_kind: "FILM"
    })),
    category_editions: CATEGORIES.map((c) => ({
      id: c.editionId,
      ceremony_id: ceremony.id,
      family_id: c.editionId,
      unit_kind: "FILM",
      icon_id: 1,
      sort_index: c.editionId
    })),
    films,
    songs: [],
    performances: [],
    people: [],
    nominations,
    nomination_contributors: []
  };
  await postJson("/admin/nominees/upload", dataset, token);

  await stack.pool.query(`UPDATE ceremony SET status = 'ACTIVE' WHERE id = $1`, [
    ceremony.id
  ]);
  return { ceremonyId: ceremony.id };
}

export const DRAFT_CIRCUIT_NAME = "E2E Draft Season 2035";

/** A contender of the draft Circuit, as the season draft spec uses it. */
export type DraftContender = {
  selectionId: number;
  category: string;
  title: string;
  tmdbId: number;
};

/**
 * Makes a user a super admin through the admin API. Starting a full awards
 * season is gated to super admins, so a spec's commissioner needs this first.
 */
export async function grantSuperAdmin(username: string): Promise<void> {
  const token = await adminLogin();
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`
  };
  const found = await fetch(
    `${E2E_API_ORIGIN}/admin/users?q=${encodeURIComponent(username)}`,
    { headers }
  );
  if (!found.ok) throw new Error(`GET /admin/users -> ${found.status}`);
  const { users } = (await found.json()) as {
    users: Array<{ id: number; username: string }>;
  };
  const user = users.find((u) => u.username === username);
  if (!user) throw new Error(`no user ${username}`);
  const res = await fetch(`${E2E_API_ORIGIN}/admin/users/${user.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ admin_role: "SUPER_ADMIN" })
  });
  if (!res.ok) throw new Error(`PATCH /admin/users/${user.id} -> ${res.status}`);
}

/** The season draft spec's four players; they sign in with the admin's password. */
export const DRAFT_PLAYERS = [
  "draft-cora",
  "draft-pia",
  "draft-theo",
  "draft-emmy"
] as const;

/**
 * An active Circuit over the seeded ceremony for the season draft spec: one
 * event, the film categories Best Picture and Best Director, and a contender
 * for each of the six films in each (twelve in all). The films get TMDB ids,
 * so a pick of one resolves to its existing selection without calling TMDB.
 * Its players are written here, with the admin's password hash, because
 * registration allows only a few accounts a minute from one address.
 */
export async function seedDraftCircuit(
  stack: Pick<E2eStack, "pool">,
  ceremonyId: number
): Promise<{ circuitId: number; contenders: DraftContender[] }> {
  const { pool } = stack;
  for (const username of DRAFT_PLAYERS) {
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
  const circuit = await pool.query<{ id: number }>(
    `INSERT INTO circuit (code, name, status, activated_at)
     VALUES ('e2e-draft-season', $1, 'ACTIVE', now()) RETURNING id::int`,
    [DRAFT_CIRCUIT_NAME]
  );
  const circuitId = circuit.rows[0]!.id;
  const event = await pool.query<{ id: number }>(
    `INSERT INTO circuit_event (circuit_id, code, name, sort_index, is_group)
     VALUES ($1, 'e2e-awards', $2, 0, FALSE) RETURNING id::int`,
    [circuitId, CEREMONY_NAME]
  );
  await pool.query(
    `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
     VALUES ($1, $2, $3, 0)`,
    [circuitId, ceremonyId, event.rows[0]!.id]
  );

  const titles = CATEGORIES.flatMap((c) => c.nominees);
  const films = (
    await pool.query<{ id: number; title: string }>(
      `UPDATE film SET tmdb_id = 940000 + id WHERE title = ANY($1::text[])
       RETURNING id::int, title`,
      [titles]
    )
  ).rows.sort((a, b) => titles.indexOf(a.title) - titles.indexOf(b.title));

  const contenders: DraftContender[] = [];
  for (const [i, category] of ["Best Picture", "Best Director"].entries()) {
    const row = await pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, $2, $3, 'FILM', $4) RETURNING id::int`,
      [circuitId, category.toLowerCase().replace(/\s+/g, "-"), category, i]
    );
    for (const film of films) {
      const selection = await pool.query<{ id: number }>(
        `INSERT INTO circuit_selection
           (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id)
         VALUES ($1, $2, NULL, $3, NULL) RETURNING id::int`,
        [row.rows[0]!.id, 940000 + film.id, film.id]
      );
      contenders.push({
        selectionId: selection.rows[0]!.id,
        category,
        title: film.title,
        tmdbId: 940000 + film.id
      });
    }
  }
  return { circuitId, contenders };
}
