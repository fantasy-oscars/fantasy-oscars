import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import {
  insertDraft,
  insertDraftSeat,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertUser
} from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  opts: { authUserId?: number; auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  if (!baseUrl) throw new Error("Test server not started");
  const token =
    opts.auth === false
      ? null
      : signToken(
          { sub: String(opts.authUserId ?? 1), handle: "tester" },
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
  opts: { authUserId?: number; auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  return requestJson<T>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    },
    opts
  );
}

describe("draft submit pick integration", () => {
  beforeAll(async () => {
    try {
      process.env.PORT = process.env.PORT ?? "3103";
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

  it("rejects when unauthenticated", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 1 });
    await insertNomination(db.pool);

    const res = await post<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      { nomination_id: 1, request_id: "unauth" },
      { auth: false }
    );
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects invalid payloads", async () => {
    if (skip || !db) return;
    const draft = await insertDraft(db.pool, {
      status: "IN_PROGRESS",
      current_pick_number: 1
    });

    const res = await post<{ error: { code: string; details?: { fields: string[] } } }>(
      `/drafts/${draft.id}/picks`,
      { request_id: "missing-nomination" }
    );

    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
    expect(res.json.error.details?.fields).toContain("nomination_id");
  });

  it("creates a pick, advances the turn, and enforces auth seat", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool, { roster_size: 1 });
    await insertUser(db.pool, { id: 1 });
    await insertUser(db.pool, { id: 2 });
    const member1 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1
    });
    const member2 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 2
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: member1.id,
      seat_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: member2.id,
      seat_number: 2
    });
    const nomination = await insertNomination(db.pool);

    const res = await post<{ pick: { pick_number: number; seat_number: number } }>(
      `/drafts/${draft.id}/picks`,
      { nomination_id: nomination.id, request_id: "turn-1" },
      { authUserId: 1 }
    );

    expect(res.status).toBe(201);
    expect(res.json.pick.pick_number).toBe(1);
    expect(res.json.pick.seat_number).toBe(1);

    const { rows } = await db.pool.query(
      `SELECT current_pick_number, status FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect(rows[0].current_pick_number).toBe(2);
    expect(rows[0].status).toBe("IN_PROGRESS");
  });

  it("returns the existing pick for duplicate request_id (idempotent)", async () => {
    if (skip || !db) return;
    const league = await insertLeague(db.pool, { roster_size: 1 });
    await insertUser(db.pool, { id: 1 });
    const member = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: member.id,
      seat_number: 1
    });
    const nomination = await insertNomination(db.pool);

    const first = await post<{ pick: { id: number } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "dup-1"
    });
    expect(first.status).toBe(201);

    const second = await post<{ pick: { id: number } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "dup-1"
    });
    expect(second.status).toBe(200);
    expect(second.json.pick.id).toBe(first.json.pick.id);

    const { rows } = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
      [draft.id]
    );
    expect(rows[0].count).toBe(1);
  });
});
