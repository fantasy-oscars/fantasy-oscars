import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertDraft,
  insertDraftPick,
  insertDraftSeat,
  insertLeague,
  insertLeagueMember,
  insertCeremony,
  insertNomination,
  insertUser
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function getJson<T>(
  path: string,
  opts: { auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  const token =
    opts.auth === false
      ? null
      : signToken(
          { sub: "1", username: "tester" },
          process.env.AUTH_SECRET ?? "test-secret"
        );
  const req = api.get(path);
  if (token) req.set("authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

describe("draft snapshot integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3108";
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
    // Most tests here authenticate as user id=1; requireAuth now validates the user exists.
    await insertUser(db.pool, { id: 1, username: "tester" });
  });

  it("requires auth", async () => {
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id });

    const res = await getJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/snapshot`,
      {
        auth: false
      }
    );

    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns snapshot for pending draft with seats and no picks", async () => {
    const ceremonyStart = new Date("2026-02-01T01:00:00Z");
    const league = await insertLeague(db.pool, {
      ceremony_id: (await insertCeremony(db.pool, { starts_at: ceremonyStart })).id
    });
    const draft = await insertDraft(db.pool, { league_id: league.id, status: "PENDING" });
    const member = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1,
      role: "OWNER"
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'OWNER')
       ON CONFLICT (season_id, user_id) DO NOTHING`,
      [draft.season_id, 1, member.id]
    );
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 1 });
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 2 });

    const res = await getJson<{
      draft: { status: string; current_pick_number: number | null };
      seats: Array<{ seat_number: number }>;
      picks: unknown[];
      version: number;
      ceremony_starts_at: string | null;
    }>(`/drafts/${draft.id}/snapshot`);

    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("PENDING");
    expect(res.json.picks.length).toBe(0);
    expect(res.json.seats.map((s) => s.seat_number)).toEqual([1, 2]);
    expect(res.json.version).toBe(0);
    expect(res.json.ceremony_starts_at).toBe(ceremonyStart.toISOString());
  });

  it("returns snapshot with picks in order and version equals pick count", async () => {
    const ceremonyStart = new Date("2026-02-02T01:00:00Z");
    const league = await insertLeague(db.pool, {
      ceremony_id: (await insertCeremony(db.pool, { starts_at: ceremonyStart })).id
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 3
    });
    const member = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1,
      role: "OWNER"
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'OWNER')
       ON CONFLICT (season_id, user_id) DO NOTHING`,
      [draft.season_id, 1, member.id]
    );
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

    const res = await getJson<{
      draft: { status: string; current_pick_number: number | null };
      picks: Array<{ pick_number: number; seat_number: number }>;
      version: number;
      turn: { seat_number: number; round_number: number; direction: string };
      ceremony_starts_at: string | null;
    }>(`/drafts/${draft.id}/snapshot`);

    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("IN_PROGRESS");
    expect(res.json.picks.map((p) => p.pick_number)).toEqual([1, 2]);
    expect(res.json.version).toBe(2);
    expect(res.json.turn.seat_number).toBe(2);
    expect(res.json.turn.round_number).toBe(2);
    expect(res.json.turn.direction).toBe("REVERSE");
    expect(res.json.ceremony_starts_at).toBe(ceremonyStart.toISOString());
  });

  it("returns 404 when draft not found", async () => {
    const res = await getJson<{ error: { code: string } }>(`/drafts/9999/snapshot`);
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("DRAFT_NOT_FOUND");
  });
});
