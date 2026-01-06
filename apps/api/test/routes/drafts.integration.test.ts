import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { insertLeague } from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  if (!baseUrl) throw new Error("Test server not started");
  const token =
    opts.auth === false
      ? null
      : signToken(
          { sub: "1", handle: "tester" },
          process.env.AUTH_SECRET ?? "test-secret"
        );
  const headers = {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {})
  };
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

async function post<T>(
  path: string,
  body: unknown,
  opts: { auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    },
    opts
  );
}

describe("drafts integration", () => {
  beforeAll(async () => {
    try {
      process.env.PORT = process.env.PORT ?? "3102";
      process.env.AUTH_SECRET = "test-secret";
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

  it("rejects draft creation when unauthenticated", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const res = await post<{ error: { code: string } }>(
      "/drafts",
      { league_id: league.id, draft_order_type: "SNAKE" },
      { auth: false }
    );
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("creates a draft in pending state", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const res = await post<{ draft: { id: number; league_id: number; status: string } }>(
      "/drafts",
      { league_id: league.id, draft_order_type: "SNAKE" }
    );
    expect(res.status).toBe(201);
    expect(res.json.draft.league_id).toBe(league.id);
    expect(res.json.draft.status).toBe("PENDING");

    const { rows } = await db.pool.query(
      `SELECT status, draft_order_type FROM draft WHERE id = $1`,
      [res.json.draft.id]
    );
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].draft_order_type).toBe("SNAKE");
  });

  it("rejects when league is missing", async () => {
    if (skip) return;
    const res = await post<{ error: { code: string } }>("/drafts", {});
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects when league does not exist", async () => {
    if (skip) return;
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: 999,
      draft_order_type: "SNAKE"
    });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("LEAGUE_NOT_FOUND");
  });

  it("rejects when draft already exists for league", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    await post("/drafts", { league_id: league.id, draft_order_type: "SNAKE" });
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: league.id,
      draft_order_type: "SNAKE"
    });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_EXISTS");
  });
});
