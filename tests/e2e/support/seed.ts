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
 */
export async function adminLogin(): Promise<string> {
  const res = await fetch(`${E2E_API_ORIGIN}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  });
  if (!res.ok) throw new Error(`POST /auth/login -> ${res.status}`);
  for (const cookie of res.headers.getSetCookie()) {
    const match = /^auth_token=([^;]+)/.exec(cookie);
    if (match?.[1]) return match[1];
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

  await stack.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
    ceremony.id
  ]);
  return { ceremonyId: ceremony.id };
}
