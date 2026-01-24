import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import {
  insertCategoryEdition,
  insertNomination,
  insertCeremony,
  insertUser
} from "../factories/db.js";
import { resetAllRateLimiters } from "../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function post<T>(
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  json: T;
  headers: Record<string, string | string[] | undefined>;
}> {
  const res = await api
    .post(path)
    .set({ "content-type": "application/json", ...headers })
    .send(body ?? {});
  return { status: res.status, json: res.body as T, headers: res.headers };
}

describe("admin routes", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3101";
    process.env.AUTH_SECRET = "test-secret";
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    api = createApiAgent(app);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
  });

  it("rejects non-admin users", async () => {
    const ceremony = await db.pool.query(
      `INSERT INTO ceremony (code, name, year) VALUES ('oscars-2026', 'Oscars 2026', 2026) RETURNING id`
    );
    const ceremonyId = ceremony.rows[0].id as number;

    await post("/auth/register", {
      username: "user1",
      email: "user1@example.com",
      password: "secret123"
    });
    const login = await post<{ token: string }>("/auth/login", {
      username: "user1",
      password: "secret123"
    });

    const res = await post<{ error: { code: string } }>(
      `/admin/ceremonies/${ceremonyId}/name`,
      { name: "New Name" },
      { Authorization: `Bearer ${login.json.token}` }
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");
  });

  it("allows admin users to update ceremony names", async () => {
    const ceremony = await db.pool.query(
      `INSERT INTO ceremony (code, name, year) VALUES ('oscars-2027', 'Oscars 2027', 2027) RETURNING id`
    );
    const ceremonyId = ceremony.rows[0].id as number;

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      username: "admin1",
      email: "admin1@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);

    const login = await post<{ token: string }>("/auth/login", {
      username: "admin1",
      password: "secret123"
    });

    const res = await post<{ ceremony: { id: number; name: string } }>(
      `/admin/ceremonies/${ceremonyId}/name`,
      { name: "Updated Oscars" },
      { Authorization: `Bearer ${login.json.token}` }
    );

    expect(res.status).toBe(200);
    expect(res.json.ceremony.name).toBe("Updated Oscars");
  });

  it("upserts winner for active ceremony and locks drafts on first write", async () => {
    const ceremony = await insertCeremony(db.pool, { code: "oscars-2028", year: 2028 });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id) VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );
    const category = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
    const nomination = await insertNomination(db.pool, {
      category_edition_id: category.id
    });

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      username: "admin2",
      email: "admin2@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);
    const login = await post<{ token: string }>("/auth/login", {
      username: "admin2",
      password: "secret123"
    });

    const res = await post<{
      winner: { nomination_id: number };
      draft_locked_at: string;
    }>(
      "/admin/winners",
      {
        category_edition_id: category.id,
        nomination_id: nomination.id
      },
      { Authorization: `Bearer ${login.json.token}` }
    );

    expect(res.status).toBe(200);
    expect(res.json.winner.nomination_id).toBe(nomination.id);
    expect(res.json.draft_locked_at).toBeTruthy();

    const { rows } = await db.pool.query<{ draft_locked_at: Date }>(
      `SELECT draft_locked_at FROM ceremony WHERE id = $1`,
      [ceremony.id]
    );
    expect(rows[0].draft_locked_at).toBeTruthy();

    const auditRows = await db.pool.query<{ action: string }>(
      `SELECT action FROM admin_audit_log WHERE actor_user_id = $1`,
      [reg.user.id]
    );
    expect(auditRows.rows.some((r) => r.action === "winner_upsert")).toBe(true);
  });

  it("uploads nominees dataset idempotently for active ceremony", async () => {
    const ceremony = await insertCeremony(db.pool, { code: "oscars-2029", year: 2029 });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      username: "admin3",
      email: "admin3@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);
    const login = await post<{ token: string }>("/auth/login", {
      username: "admin3",
      password: "secret123"
    });

    const dataset = {
      icons: [],
      ceremonies: [
        { id: ceremony.id, code: "oscars-2029", name: "Oscars 2029", year: 2029 }
      ],
      category_families: [],
      category_editions: [],
      films: [],
      songs: [],
      performances: [],
      people: [],
      nominations: [],
      nomination_contributors: []
    };

    const first = await post<{ ok: boolean }>("/admin/nominees/upload", dataset, {
      Authorization: `Bearer ${login.json.token}`
    });
    expect(first.status).toBe(200);
    expect(first.json.ok).toBe(true);

    const second = await post<{ ok: boolean }>("/admin/nominees/upload", dataset, {
      Authorization: `Bearer ${login.json.token}`
    });
    expect(second.status).toBe(200);

    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM ceremony`
    );
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("rejects nominee upload after drafts start", async () => {
    const ceremony = await insertCeremony(db.pool, { code: "oscars-2031", year: 2031 });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );
    // create league/season/draft with status IN_PROGRESS to simulate started draft
    const owner = await insertUser(db.pool);
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO league (code, name, ceremony_id, max_members, roster_size, is_public, created_by_user_id)
       VALUES ('l-2031', 'League 2031', $1, 10, 5, false, $2)
       RETURNING id`,
      [ceremony.id, owner.id]
    );
    const leagueId = rows[0].id;
    const { rows: seasonRows } = await db.pool.query<{ id: number }>(
      `INSERT INTO season (league_id, ceremony_id, status) VALUES ($1, $2, 'EXTANT') RETURNING id`,
      [leagueId, ceremony.id]
    );
    const seasonId = seasonRows[0].id;
    await db.pool.query(
      `INSERT INTO draft (league_id, season_id, status, draft_order_type, current_pick_number, version)
       VALUES ($1, $2, 'IN_PROGRESS', 'SNAKE', 1, 1)`,
      [leagueId, seasonId]
    );

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      username: "admin5",
      email: "admin5@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);
    const login = await post<{ token: string }>("/auth/login", {
      username: "admin5",
      password: "secret123"
    });

    const dataset = {
      icons: [],
      ceremonies: [
        { id: ceremony.id, code: "oscars-2031", name: "Oscars 2031", year: 2031 }
      ],
      category_families: [],
      category_editions: [],
      films: [],
      songs: [],
      performances: [],
      people: [],
      nominations: [],
      nomination_contributors: []
    };

    const res = await post<{ error: { code: string } }>(
      "/admin/nominees/upload",
      dataset,
      { Authorization: `Bearer ${login.json.token}` }
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFTS_LOCKED");
  });

  it("rejects nominee upload when ceremonies mismatch active", async () => {
    const ceremony = await insertCeremony(db.pool, { code: "oscars-2030", year: 2030 });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      username: "admin4",
      email: "admin4@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);
    const login = await post<{ token: string }>("/auth/login", {
      username: "admin4",
      password: "secret123"
    });

    const badDataset = {
      icons: [],
      ceremonies: [{ id: ceremony.id + 1, code: "other", name: "Other", year: 2031 }],
      category_families: [],
      category_editions: [],
      films: [],
      songs: [],
      performances: [],
      people: [],
      nominations: [],
      nomination_contributors: []
    };

    const res = await post<{ error: { code: string; details?: unknown } }>(
      "/admin/nominees/upload",
      badDataset,
      { Authorization: `Bearer ${login.json.token}` }
    );
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_FAILED");
  });
});
