import { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import {
  insertDraft,
  insertDraftPick,
  insertDraftSeat,
  insertLeague,
  insertNomination
} from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let server: Server | null = null;
let baseUrl: string | null = null;

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

describe("draft snapshot integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3108";
    process.env.AUTH_SECRET = "test-secret";
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

  it("requires auth", async () => {
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id });

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/snapshot`,
      { method: "GET" },
      { auth: false }
    );

    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns snapshot for pending draft with seats and no picks", async () => {
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id, status: "PENDING" });
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 1 });
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 2 });

    const res = await requestJson<{
      draft: { status: string; current_pick_number: number | null };
      seats: Array<{ seat_number: number }>;
      picks: unknown[];
      version: number;
    }>(`/drafts/${draft.id}/snapshot`);

    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("PENDING");
    expect(res.json.picks.length).toBe(0);
    expect(res.json.seats.map((s) => s.seat_number)).toEqual([1, 2]);
    expect(res.json.version).toBe(0);
  });

  it("returns snapshot with picks in order and version equals pick count", async () => {
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 3
    });
    const seat1 = await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 1 });
    const seat2 = await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 2 });
    const nomination1 = await insertNomination(db.pool);
    const nomination2 = await insertNomination(db.pool);

    await insertDraftPick(db.pool, {
      draft_id: draft.id,
      pick_number: 1,
      round_number: 1,
      seat_number: 1,
      league_member_id: seat1.league_member_id,
      nomination_id: nomination1.id
    });
    await insertDraftPick(db.pool, {
      draft_id: draft.id,
      pick_number: 2,
      round_number: 1,
      seat_number: 2,
      league_member_id: seat2.league_member_id,
      nomination_id: nomination2.id
    });

    const res = await requestJson<{
      draft: { status: string; current_pick_number: number | null };
      picks: Array<{ pick_number: number; seat_number: number }>;
      version: number;
    }>(`/drafts/${draft.id}/snapshot`);

    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("IN_PROGRESS");
    expect(res.json.picks.map((p) => p.pick_number)).toEqual([1, 2]);
    expect(res.json.version).toBe(2);
  });

  it("returns 404 when draft not found", async () => {
    const res = await requestJson<{ error: { code: string } }>(`/drafts/9999/snapshot`, {
      method: "GET"
    });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("DRAFT_NOT_FOUND");
  });
});
