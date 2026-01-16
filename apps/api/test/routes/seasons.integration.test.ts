import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertCeremony, insertUser } from "../factories/db.js";
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
});
