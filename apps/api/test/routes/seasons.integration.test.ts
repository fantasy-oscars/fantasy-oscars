import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertCeremony, insertNomination, insertUser } from "../factories/db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import crypto from "crypto";

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

describe("seasons integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3115";
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

  it("creates an additional season for the active ceremony and lists seasons", async () => {
    const ceremony1 = await createActiveCeremony();
    const ceremony2 = await insertCeremony(db.pool, { year: ceremony1.year + 1 }, false);
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    // Create league (creates initial season for ceremony1)
    const leagueRes = await post<{ league: { id: number } }>(
      "/leagues",
      { code: "sea-1", name: "Seasons League", max_members: 5 },
      token
    );
    expect(leagueRes.status).toBe(201);

    // Switch active ceremony to ceremony2
    await setActiveCeremony(ceremony2.id);

    const createSeasonRes = await post<{ season: { id: number; ceremony_id: number } }>(
      `/seasons/leagues/${leagueRes.json.league.id}/seasons`,
      {},
      token
    );
    expect(createSeasonRes.status).toBe(201);
    expect(createSeasonRes.json.season.ceremony_id).toBe(ceremony2.id);

    const listRes = await getJson<{
      seasons: Array<{ id: number; ceremony_id: number; is_active_ceremony: boolean }>;
    }>(`/seasons/leagues/${leagueRes.json.league.id}/seasons`, token);
    expect(listRes.status).toBe(200);
    expect(listRes.json.seasons.length).toBe(2);
    expect(
      listRes.json.seasons.some(
        (s) => s.is_active_ceremony && s.ceremony_id === ceremony2.id
      )
    ).toBe(true);
  });

  it("cancels a season and hides it from listings", async () => {
    await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const leagueRes = await post<{ league: { id: number }; season: { id: number } }>(
      "/leagues",
      { code: "cancel-1", name: "Cancel League", max_members: 3 },
      token
    );
    expect(leagueRes.status).toBe(201);

    const cancelRes = await post<{ season: { id: number; status: string } }>(
      `/seasons/seasons/${leagueRes.json.season.id}/cancel`,
      {},
      token
    );
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.json.season.status).toBe("CANCELLED");

    const listRes = await getJson<{ seasons: Array<{ id: number }> }>(
      `/seasons/leagues/${leagueRes.json.league.id}/seasons`,
      token
    );
    expect(listRes.status).toBe(200);
    expect(listRes.json.seasons.length).toBe(0);
  });

  it("allows commissioner to set scoring strategy while draft pending", async () => {
    await createActiveCeremony();
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const leagueRes = await post<{ league: { id: number }; season: { id: number } }>(
      "/leagues",
      { code: "score-1", name: "Score League", max_members: 3 },
      token
    );
    expect(leagueRes.status).toBe(201);

    const seasonId = leagueRes.json.season.id;
    const draftRes = await post<{ draft: { id: number } }>(
      "/drafts",
      { league_id: leagueRes.json.league.id },
      token
    );
    expect(draftRes.status).toBe(201);

    const updateRes = await post<{ season: { scoring_strategy_name: string } }>(
      `/seasons/seasons/${seasonId}/scoring`,
      { scoring_strategy_name: "negative" },
      token
    );
    expect(updateRes.status).toBe(200);
    expect(updateRes.json.season.scoring_strategy_name).toBe("negative");

    const listRes = await getJson<{ seasons: Array<{ scoring_strategy_name: string }> }>(
      `/seasons/leagues/${leagueRes.json.league.id}/seasons`,
      token
    );
    expect(listRes.status).toBe(200);
    expect(listRes.json.seasons[0].scoring_strategy_name).toBe("negative");
  });

  it("blocks scoring strategy change after draft start", async () => {
    const ceremony = await createActiveCeremony();
    const user = await insertUser(db.pool);
    const user2 = await insertUser(db.pool, { id: user.id + 1 });
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const leagueRes = await post<{ league: { id: number }; season: { id: number } }>(
      "/leagues",
      { code: "score-2", name: "Score Lock League", max_members: 3 },
      token
    );
    expect(leagueRes.status).toBe(201);

    const draftRes = await post<{ draft: { id: number } }>(
      "/drafts",
      { league_id: leagueRes.json.league.id },
      token
    );
    expect(draftRes.status).toBe(201);

    // add second participant
    const ownerLm = await db.pool.query<{ id: number }>(
      `SELECT id::int FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [leagueRes.json.league.id, user.id]
    );
    const lm = await db.pool.query<{ id: number }>(
      `INSERT INTO league_member (league_id, user_id, role)
       VALUES ($1,$2,'MEMBER') RETURNING id::int`,
      [leagueRes.json.league.id, user2.id]
    );
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1,$2,$3,'OWNER')`,
      [leagueRes.json.season.id, user.id, ownerLm.rows[0].id]
    );
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1,$2,$3,'MEMBER')`,
      [leagueRes.json.season.id, user2.id, lm.rows[0].id]
    );

    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1) ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1) ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [ceremony.id]
    );
    await insertNomination(db.pool, { ceremony_id: ceremony.id });

    await db.pool.query(
      `UPDATE draft SET status = 'IN_PROGRESS', current_pick_number = 1 WHERE id = $1`,
      [draftRes.json.draft.id]
    );

    const updateRes = await post<{ error: { code: string } }>(
      `/seasons/seasons/${leagueRes.json.season.id}/scoring`,
      { scoring_strategy_name: "negative" },
      token
    );
    expect(updateRes.status).toBe(409);
    expect(updateRes.json.error.code).toBe("SEASON_SCORING_LOCKED");
  });

  it("creates a public season for the active ceremony and allows open join", async () => {
    const previousMax = process.env.PUBLIC_SEASON_MAX_MEMBERS;
    const previousRoster = process.env.PUBLIC_SEASON_ROSTER_SIZE;
    process.env.PUBLIC_SEASON_MAX_MEMBERS = "2";
    process.env.PUBLIC_SEASON_ROSTER_SIZE = "2";
    try {
      const ceremony = await createActiveCeremony();
      const creator = await insertUser(db.pool, { handle: "creator" });
      const joiner = await insertUser(db.pool, { handle: "joiner" });
      const another = await insertUser(db.pool, { handle: "another" });
      const creatorToken = signToken({ sub: String(creator.id), handle: creator.handle });
      const joinerToken = signToken({ sub: String(joiner.id), handle: joiner.handle });
      const anotherToken = signToken({ sub: String(another.id), handle: another.handle });

      const listRes = await getJson<{
        seasons: Array<{ season_id: number; ceremony_id: number; max_members: number }>;
      }>("/seasons/public", creatorToken);
      expect(listRes.status).toBe(200);
      expect(listRes.json.seasons[0].ceremony_id).toBe(ceremony.id);
      const seasonId = listRes.json.seasons[0].season_id;

      const joinRes = await post<{ season: { id: number } }>(
        `/seasons/public/${seasonId}/join`,
        {},
        joinerToken
      );
      expect(joinRes.status).toBe(200);

      const secondJoin = await post<{ season: { id: number } }>(
        `/seasons/public/${seasonId}/join`,
        {},
        anotherToken
      );
      expect(secondJoin.status).toBe(200);

      const fullJoin = await post<{ error: { code: string } }>(
        `/seasons/public/${seasonId}/join`,
        {},
        creatorToken
      );
      expect(fullJoin.status).toBe(409);
      expect(fullJoin.json.error.code).toBe("PUBLIC_SEASON_FULL");

      const { rows } = await db.pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM season_member WHERE season_id = $1`,
        [seasonId]
      );
      expect(Number(rows[0].count)).toBe(2);
    } finally {
      process.env.PUBLIC_SEASON_MAX_MEMBERS = previousMax;
      process.env.PUBLIC_SEASON_ROSTER_SIZE = previousRoster;
    }
  });

  it("keeps public seasons out of league listings", async () => {
    await createActiveCeremony();
    const creator = await insertUser(db.pool, { handle: "owner2" });
    const joiner = await insertUser(db.pool, { handle: "member2" });
    const creatorToken = signToken({ sub: String(creator.id), handle: creator.handle });
    const joinerToken = signToken({ sub: String(joiner.id), handle: joiner.handle });

    const listRes = await getJson<{
      seasons: Array<{ season_id: number; league_id: number }>;
    }>("/seasons/public", creatorToken);
    expect(listRes.status).toBe(200);
    expect(listRes.json.seasons.length).toBeGreaterThan(0);
    const seasonId = listRes.json.seasons[0].season_id;
    const publicLeagueId = listRes.json.seasons[0].league_id;

    await post<{ season: { id: number } }>(
      `/seasons/public/${seasonId}/join`,
      {},
      joinerToken
    );

    const leaguesRes = await api
      .get("/leagues")
      .set("Authorization", `Bearer ${joinerToken}`);
    expect(leaguesRes.status).toBe(200);
    expect(
      (leaguesRes.body.leagues as Array<{ id: number }>).some(
        (league) => league.id === publicLeagueId
      )
    ).toBe(false);
  });
});
