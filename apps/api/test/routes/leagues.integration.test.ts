import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertCeremony, insertUser, insertDraft } from "../factories/db.js";
import crypto from "crypto";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let server: Server | null = null;
let baseUrl: string | null = null;
let authSecret = "test-secret";

async function requestJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; json: T }> {
  if (!baseUrl) throw new Error("Test server not started");
  const res = await fetch(`${baseUrl}${path}`, init);
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

async function post<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return requestJson<T>(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

describe("leagues integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3104";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
    authSecret = process.env.AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
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

  it("creates a league and returns it", async () => {
    const ceremony = await insertCeremony(db.pool);
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });

    const res = await post<{ league: { id: number; code: string } }>(
      "/leagues",
      {
        code: "league-1",
        name: "League One",
        ceremony_id: ceremony.id,
        max_members: 10,
        roster_size: 5,
        is_public: true
      },
      token
    );
    expect(res.status).toBe(201);
    expect(res.json.league.code).toBe("league-1");
  });

  it("requires auth for create", async () => {
    const ceremony = await insertCeremony(db.pool);
    const res = await post<{ error: { code: string } }>("/leagues", {
      code: "unauth",
      name: "No Auth",
      ceremony_id: ceremony.id,
      max_members: 10,
      roster_size: 5
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects missing required fields", async () => {
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
    const ceremony = await insertCeremony(db.pool);
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "league-2",
        name: "League Two",
        ceremony_id: ceremony.id,
        max_members: 10,
        roster_size: 5,
        is_public: false
      },
      token
    );
    const leagueId = createRes.json.league.id;
    const res = await requestJson<{ league: { id: number } }>(`/leagues/${leagueId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    expect(res.json.league.id).toBe(leagueId);
  });

  it("requires auth for get by id", async () => {
    const ceremony = await insertCeremony(db.pool);
    const user = await insertUser(db.pool);
    const token = signToken({ sub: String(user.id), handle: user.handle });
    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "no-auth-get",
        name: "No Auth Get",
        ceremony_id: ceremony.id,
        max_members: 8,
        roster_size: 4,
        is_public: true
      },
      token
    );
    const leagueId = createRes.json.league.id;

    const res = await requestJson<{ error: { code: string } }>(`/leagues/${leagueId}`, {
      method: "GET"
    });

    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("allows a user to join a league before draft start", async () => {
    const ceremony = await insertCeremony(db.pool);
    const leagueCreator = await insertUser(db.pool);
    const member = await insertUser(db.pool);
    const tokenCreator = signToken({
      sub: String(leagueCreator.id),
      handle: leagueCreator.handle
    });
    const tokenMember = signToken({ sub: String(member.id), handle: member.handle });

    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "join-me",
        name: "Joinable League",
        ceremony_id: ceremony.id,
        max_members: 3,
        roster_size: 5,
        is_public: true
      },
      tokenCreator
    );

    const joinRes = await post<{ member: { league_id: number; user_id: number } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      tokenMember
    );

    expect(joinRes.status).toBe(201);
    expect(joinRes.json.member.league_id).toBe(createRes.json.league.id);
    expect(joinRes.json.member.user_id).toBe(member.id);
  });

  it("rejects join after league is full", async () => {
    const ceremony = await insertCeremony(db.pool);
    const owner = await insertUser(db.pool);
    const first = await insertUser(db.pool);
    const second = await insertUser(db.pool);
    const tokenOwner = signToken({ sub: String(owner.id), handle: owner.handle });
    const tokenFirst = signToken({ sub: String(first.id), handle: first.handle });
    const tokenSecond = signToken({ sub: String(second.id), handle: second.handle });

    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "full-league",
        name: "Full League",
        ceremony_id: ceremony.id,
        max_members: 2,
        roster_size: 5,
        is_public: true
      },
      tokenOwner
    );

    // first member joins
    await post(`/leagues/${createRes.json.league.id}/join`, {}, tokenFirst);

    const res = await post<{ error: { code: string } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      tokenSecond
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("LEAGUE_FULL");
  });

  it("rejects join when draft already started", async () => {
    const ceremony = await insertCeremony(db.pool);
    const owner = await insertUser(db.pool);
    const member = await insertUser(db.pool);
    const tokenOwner = signToken({ sub: String(owner.id), handle: owner.handle });
    const tokenMember = signToken({ sub: String(member.id), handle: member.handle });

    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "started-draft-league",
        name: "Started Draft League",
        ceremony_id: ceremony.id,
        max_members: 3,
        roster_size: 5,
        is_public: true
      },
      tokenOwner
    );

    // Create a draft that is already in progress
    await insertDraft(db.pool, {
      league_id: createRes.json.league.id,
      status: "IN_PROGRESS"
    });

    const res = await post<{ error: { code: string } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      tokenMember
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_ALREADY_STARTED");
  });

  it("is idempotent when a member joins twice", async () => {
    const ceremony = await insertCeremony(db.pool);
    const owner = await insertUser(db.pool);
    const member = await insertUser(db.pool);
    const tokenOwner = signToken({ sub: String(owner.id), handle: owner.handle });
    const tokenMember = signToken({ sub: String(member.id), handle: member.handle });

    const createRes = await post<{ league: { id: number } }>(
      "/leagues",
      {
        code: "idempotent",
        name: "Idempotent League",
        ceremony_id: ceremony.id,
        max_members: 3,
        roster_size: 5,
        is_public: true
      },
      tokenOwner
    );

    const firstJoin = await post<{ member: { id: number } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      tokenMember
    );
    const secondJoin = await post<{ member: { id: number } }>(
      `/leagues/${createRes.json.league.id}/join`,
      {},
      tokenMember
    );

    expect(firstJoin.status).toBe(201);
    expect(secondJoin.status).toBe(200);
    expect(secondJoin.json.member.id).toBe(firstJoin.json.member.id);
  });
});
