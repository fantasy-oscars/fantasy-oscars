import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertCeremony, insertUser } from "../factories/db.js";
import crypto from "crypto";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;
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
    try {
      process.env.PORT = process.env.PORT ?? "3104";
      authSecret = process.env.AUTH_SECRET ?? "test-secret";
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      const app = createServer({ db: db.pool });
      server = app.listen(0);
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("container runtime")) {
        skip = true;
        return;
      }
      throw err;
    }
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (db) await db.stop();
  });

  beforeEach(async () => {
    if (skip || !db) return;
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
    if (skip || !db) return;
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
    if (skip || !db) return;
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
    if (skip || !db) return;
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
    if (skip || !db) return;
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
});
