import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertCeremony, insertUser } from "../factories/db.js";
import crypto from "crypto";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let authSecret = "test-secret";
let api: ApiAgent;
async function setActiveCeremony(id: number) {
  await db.pool.query(
    `INSERT INTO app_config (id, active_ceremony_id)
     VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
    [id]
  );
}

async function createActiveCeremony() {
  const ceremony = await insertCeremony(db.pool);
  await setActiveCeremony(ceremony.id);
  return ceremony;
}

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.post(path).set("content-type", "application/json").send(body);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function getJson<T>(
  path: string,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.get(path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

describe("leagues integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3104";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    authSecret = process.env.AUTH_SECRET;
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
  });

  function signToken(claims: Record<string, unknown>) {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac("sha256", authSecret)
      .update(data)
      .digest("base64url");
    return `${data}.${signature}`;
  }

  it("creates a league, initial season, and owner membership for the active ceremony", async () => {
    const ceremony = await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const res = await post<{
      league: { id: number; code: string; ceremony_id: number };
      season: { id: number; ceremony_id: number };
    }>(
      "/leagues",
      {
        code: "league-1",
        name: "League One",
        max_members: 10,
        is_public: true
      },
      token
    );
    expect(res.status).toBe(201);
    expect(res.json.league.code).toBe("league-1");
    expect(res.json.league.ceremony_id).toBe(ceremony.id);
    expect(res.json.season.ceremony_id).toBe(ceremony.id);
    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [res.json.league.id, user.id]
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  it("requires auth for create", async () => {
    await createActiveCeremony();
    const res = await post<{ error: { code: string } }>("/leagues", {
      code: "unauth",
      name: "No Auth",
      max_members: 10
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects creating a league when no active ceremony configured", async () => {
    await insertCeremony(db.pool, {}, false);
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const res = await post<{ error: { code: string } }>(
      "/leagues",
      {
        code: "wrong-ceremony",
        name: "Wrong Ceremony",
        max_members: 10
      },
      token
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("ACTIVE_CEREMONY_NOT_SET");
  });

  it("rejects missing required fields", async () => {
    await createActiveCeremony();
    const token = signToken({ sub: "1", handle: "u1" });
    const res = await post<{ error: { code: string } }>(
      "/leagues",
      { name: "No code" },
      token
    );
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("gets a league by id", async () => {
    await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "league-2",
        name: "League Two",
        max_members: 10,
        is_public: false
      },
      token
    );
    const leagueId = createRes.json.league.id;
    const res = await getJson<{ league: { id: number } }>(`/leagues/${leagueId}`, token);
    expect(res.status).toBe(200);
    expect(res.json.league.id).toBe(leagueId);
  });

  it("requires auth for get by id", async () => {
    await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "no-auth-get",
        name: "No Auth Get",
        max_members: 8,
        is_public: true
      },
      token
    );
    const leagueId = createRes.json.league.id;

    const res = await getJson<{ error: { code: string } }>(`/leagues/${leagueId}`);

    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("lists leagues for the current user", async () => {
    await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    await post<{ league: { id: number } }>(
      "/leagues",
      { code: "list-1", name: "List One", max_members: 5 },
      token
    );

    const res = await getJson<{ leagues: Array<{ code: string }> }>("/leagues", token);
    expect(res.status).toBe(200);
    expect(res.json.leagues.map((l) => l.code)).toContain("list-1");
  });

  it("returns invite-only error for legacy join endpoint", async () => {
    const ceremony = await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "join-legacy",
        name: "Join Legacy",
        ceremony_id: ceremony.id,
        max_members: 10,
        roster_size: 5,
        is_public: false
      },
      token
    );

    const res = await post<{ error: { code: string } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      token
    );

    expect(res.status).toBe(410);
    expect(res.json.error.code).toBe("INVITE_ONLY_MEMBERSHIP");
  });

  it("returns roster for commissioners with roles and handles", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const member = await insertUser(db.pool, {
      handle: "member1",
      display_name: "Member One"
    });
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "r-1", name: "Roster", max_members: 5 },
      ownerToken
    );
    const leagueId = createRes.json.league.id;
    await db.pool.query(
      `INSERT INTO league_member (league_id, user_id, role) VALUES ($1,$2,'MEMBER')`,
      [leagueId, member.id]
    );

    const res = await getJson<{
      members: Array<{
        user_id: number;
        role: string;
        handle: string;
        display_name: string;
      }>;
    }>(`/leagues/${leagueId}/members`, ownerToken);

    expect(res.status).toBe(200);
    const handles = res.json.members.map((m) => m.handle).sort();
    expect(handles).toEqual([member.handle, owner.handle].sort());
  });

  it("owner can transfer ownership to a member", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const target = await insertUser(db.pool, { handle: "new-owner" });
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "transfer-1", name: "Transfer", max_members: 5 },
      ownerToken
    );
    const leagueId = createRes.json.league.id;
    await db.pool.query(
      `INSERT INTO league_member (league_id, user_id, role) VALUES ($1,$2,'MEMBER')`,
      [leagueId, target.id]
    );

    const res = await post<{ ok: boolean }>(
      `/leagues/${leagueId}/transfer`,
      { user_id: target.id },
      ownerToken
    );
    expect(res.status).toBe(200);

    const { rows } = await db.pool.query<{ role: string }>(
      `SELECT role FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [leagueId, target.id]
    );
    expect(rows[0].role).toBe("OWNER");
  });

  it("prevents removing the last commissioner", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "remove-1", name: "Remove", max_members: 5 },
      ownerToken
    );
    const leagueId = createRes.json.league.id;

    const res = await api
      .delete(`/leagues/${leagueId}/members/${owner.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it("lists public leagues and allows join when under cap", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const joiner = await insertUser(db.pool, { id: owner.id + 1 });
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const joinToken = signToken({ sub: String(joiner.id), handle: joiner.handle });

    const created = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "pub-1", name: "Public One", max_members: 3, is_public: true },
      ownerToken
    );
    expect(created.status).toBe(201);

    const list = await getJson<{ leagues: Array<{ id: number }> }>(
      "/leagues/public",
      joinToken
    );
    expect(list.status).toBe(200);
    expect(list.json.leagues.some((l) => l.id === created.json.league.id)).toBe(true);

    const joined = await post<{ league: { id: number } }>(
      `/leagues/${created.json.league.id}/join`,
      {},
      joinToken
    );
    expect(joined.status).toBe(200);

    const roster = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM season_member WHERE season_id = (SELECT id FROM season WHERE league_id = $1)`,
      [created.json.league.id]
    );
    expect(Number(roster.rows[0].count)).toBe(1);
  });

  it("enforces full cap on public join", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const joiner = await insertUser(db.pool, { id: owner.id + 1 });
    const third = await insertUser(db.pool, { id: owner.id + 2 });
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const joinToken = signToken({ sub: String(joiner.id), handle: joiner.handle });
    const thirdToken = signToken({ sub: String(third.id), handle: third.handle });

    const created = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "pub-2", name: "Public Two", max_members: 2, is_public: true },
      ownerToken
    );
    expect(created.status).toBe(201);

    const firstJoin = await post<{ league: { id: number } }>(
      `/leagues/${created.json.league.id}/join`,
      {},
      joinToken
    );
    expect(firstJoin.status).toBe(200);

    const secondJoin = await post<{ error: { code: string } }>(
      `/leagues/${created.json.league.id}/join`,
      {},
      thirdToken
    );
    expect(secondJoin.status).toBe(409);
    expect(secondJoin.json.error.code).toBe("LEAGUE_FULL");
  });

  it("commissioner can remove a member", async () => {
    await createActiveCeremony();
    const owner = await insertUser(db.pool);
    const member = await insertUser(db.pool, { handle: "dropme" });
    const ownerToken = signToken({ sub: String(owner.id), handle: owner.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "remove-2", name: "Remove2", max_members: 5 },
      ownerToken
    );
    const leagueId = createRes.json.league.id;
    await db.pool.query(
      `INSERT INTO league_member (league_id, user_id, role) VALUES ($1,$2,'MEMBER')`,
      [leagueId, member.id]
    );

    const res = await api
      .delete(`/leagues/${leagueId}/members/${member.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);

    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [leagueId, member.id]
    );
    expect(Number(rows[0].count)).toBe(0);
  });
});
