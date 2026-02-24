import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertDraft,
  insertDraftSeat,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertUser
} from "../../factories/db.js";
import * as draftRepo from "../../../src/data/repositories/draftRepository.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  opts: { authUserId?: number; auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  const token =
    opts.auth === false
      ? null
      : signToken(
          { sub: String(opts.authUserId ?? 1), username: "tester" },
          process.env.AUTH_SECRET ?? "test-secret"
        );
  const req = api.post(path).set("content-type", "application/json").send(body);
  if (token) req.set("authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

describe("draft submit pick integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3103";
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when unauthenticated", async () => {
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

  it("rejects pick submission when draft is paused", async () => {
    const league = await insertLeague(db.pool, { roster_size: 1 });
    await insertUser(db.pool, { id: 1 });
    const member = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "PAUSED",
      current_pick_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: member.id,
      seat_number: 1
    });
    const nomination = await insertNomination(db.pool);

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "paused-1"
    });

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_PAUSED");
    const { rows } = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
      [draft.id]
    );
    expect(rows[0].count).toBe(0);
  });

  it("rejects pick submission when ceremony is draft-locked (winners entered)", async () => {
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
    const nomination = await insertNomination(db.pool, {
      ceremony_id: league.ceremony_id
    });
    await db.pool.query(`UPDATE app_config SET active_ceremony_id = $1`, [
      league.ceremony_id
    ]);
    await db.pool.query(`UPDATE ceremony SET draft_locked_at = now() WHERE id = $1`, [
      league.ceremony_id
    ]);

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "locked-1"
    });

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_LOCKED");
  });

  it("allows pick submission when ceremony is draft-locked but override is enabled", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { roster_size: 1, created_by_user_id: 1 });
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
    const nomination = await insertNomination(db.pool, {
      ceremony_id: league.ceremony_id
    });
    await db.pool.query(`UPDATE app_config SET active_ceremony_id = $1`, [
      league.ceremony_id
    ]);
    await db.pool.query(`UPDATE ceremony SET draft_locked_at = now() WHERE id = $1`, [
      league.ceremony_id
    ]);

    const overrideRes = await post<{ draft: { allow_drafting_after_lock: boolean } }>(
      `/drafts/${draft.id}/override-lock`,
      { allow: true }
    );
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.json.draft.allow_drafting_after_lock).toBe(true);

    const res = await post<{ pick: { id: number } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "override-allowed"
    });

    expect(res.status).toBe(201);
    expect(res.json.pick.id).toBeDefined();

    const events = await db.pool.query(
      `SELECT event_type, payload->>'allow' AS allow
       FROM draft_event
       WHERE draft_id = $1 AND event_type = 'draft.lock.override.set'
       ORDER BY id DESC
       LIMIT 1`,
      [draft.id]
    );
    expect(events.rowCount).toBe(1);
    expect(events.rows[0]?.allow).toBe("true");
  });

  it("rejects pick submission when season is cancelled", async () => {
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
    const nomination = await insertNomination(db.pool, {
      ceremony_id: league.ceremony_id
    });
    await db.pool.query(`UPDATE app_config SET active_ceremony_id = $1`, [
      league.ceremony_id
    ]);
    await db.pool.query(`UPDATE season SET status = 'CANCELLED' WHERE id = $1`, [
      draft.season_id
    ]);

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "cancelled-1"
    });

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("SEASON_CANCELLED");
  });

  it("rejects invalid payloads", async () => {
    await insertUser(db.pool, { id: 1, username: "tester" });
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

  it("rejects a simultaneous pick attempt for the same turn", async () => {
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
    const nominationA = await insertNomination(db.pool);
    const nominationB = await insertNomination(db.pool);

    const [first, second] = await Promise.all([
      post<{ pick?: { id: number }; error?: { code: string } }>(
        `/drafts/${draft.id}/picks`,
        { nomination_id: nominationA.id, request_id: "race-1" },
        { authUserId: 1 }
      ),
      post<{ pick?: { id: number }; error?: { code: string } }>(
        `/drafts/${draft.id}/picks`,
        { nomination_id: nominationB.id, request_id: "race-2" },
        { authUserId: 1 }
      )
    ]);

    const statuses = [first.status, second.status];
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);

    const rejected =
      first.status === 409 ? first.json?.error?.code : second.json?.error?.code;
    expect(["NOT_ACTIVE_TURN", "DRAFT_NOT_IN_PROGRESS"]).toContain(rejected);

    const { rows: pickRows } = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
      [draft.id]
    );
    expect(pickRows[0].count).toBe(1);

    const { rows: draftRows } = await db.pool.query(
      `SELECT current_pick_number FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect([2, null]).toContain(draftRows[0].current_pick_number);
  });

  it("rolls back pick and turn when a failure occurs after insert", async () => {
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

    vi.spyOn(draftRepo, "completeDraftIfReady").mockRejectedValueOnce(new Error("boom"));

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/picks`, {
      nomination_id: nomination.id,
      request_id: "rollback-1"
    });

    expect(res.status).toBe(500);
    expect(res.json.error.code).toBe("INTERNAL_ERROR");

    const { rows: pickRows } = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
      [draft.id]
    );
    expect(pickRows[0].count).toBe(0);

    const { rows: draftRows } = await db.pool.query(
      `SELECT current_pick_number FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect(draftRows[0].current_pick_number).toBe(1);
  });

  it("completes using picks_per_seat (remainder nominations stay undrafted)", async () => {
    const league = await insertLeague(db.pool, { roster_size: 5 });
    const owner = await insertUser(db.pool, { id: 1 });
    const user2 = await insertUser(db.pool, { id: 2 });
    const user3 = await insertUser(db.pool, { id: 3 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lm2 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user2.id
    });
    const lm3 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user3.id
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      draft_order_type: "SNAKE",
      current_pick_number: 1,
      picks_per_seat: 2
    });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [league.ceremony_id]
    );
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lmOwner.id,
      seat_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lm2.id,
      seat_number: 2
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lm3.id,
      seat_number: 3
    });
    const nominations = await Promise.all(
      Array.from({ length: 7 }).map(() =>
        insertNomination(db.pool, { ceremony_id: league.ceremony_id })
      )
    );

    const pickPlan = [
      { userId: owner.id, nominationId: nominations[0]!.id, requestId: "pseat-1" },
      { userId: user2.id, nominationId: nominations[1]!.id, requestId: "pseat-2" },
      { userId: user3.id, nominationId: nominations[2]!.id, requestId: "pseat-3" },
      { userId: user3.id, nominationId: nominations[3]!.id, requestId: "pseat-4" },
      { userId: user2.id, nominationId: nominations[4]!.id, requestId: "pseat-5" },
      { userId: owner.id, nominationId: nominations[5]!.id, requestId: "pseat-6" }
    ];

    for (const plan of pickPlan) {
      const res = await post<{ pick?: { id: number }; error?: { code: string } }>(
        `/drafts/${draft.id}/picks`,
        { nomination_id: plan.nominationId, request_id: plan.requestId },
        { authUserId: plan.userId }
      );
      expect([200, 201]).toContain(res.status);
      expect(res.json.error).toBeUndefined();
    }

    const { rows: pickRows } = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM draft_pick WHERE draft_id = $1`,
      [draft.id]
    );
    expect(pickRows[0].count).toBe(6);

    const { rows: draftRows } = await db.pool.query(
      `SELECT status, current_pick_number, picks_per_seat FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect(draftRows[0].status).toBe("COMPLETED");
    expect(draftRows[0].current_pick_number).toBeNull();
    expect(Number(draftRows[0].picks_per_seat)).toBe(2);
  });

  it("enforces snake order across rounds (3 seats, 2 rounds)", async () => {
    const league = await insertLeague(db.pool, { roster_size: 5 });
    const owner = await insertUser(db.pool, { id: 1 });
    const user2 = await insertUser(db.pool, { id: 2 });
    const user3 = await insertUser(db.pool, { id: 3 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lm2 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user2.id
    });
    const lm3 = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user3.id
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      draft_order_type: "SNAKE",
      current_pick_number: 1,
      picks_per_seat: 2
    });
    await db.pool.query(
      `INSERT INTO app_config (id, active_ceremony_id)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
      [league.ceremony_id]
    );
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lmOwner.id,
      seat_number: 1
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lm2.id,
      seat_number: 2
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: lm3.id,
      seat_number: 3
    });
    const nominations = await Promise.all(
      Array.from({ length: 6 }).map(() =>
        insertNomination(db.pool, { ceremony_id: league.ceremony_id })
      )
    );

    const sequence = [
      { userId: owner.id, nominationId: nominations[0]!.id, requestId: "snake-1" },
      { userId: user2.id, nominationId: nominations[1]!.id, requestId: "snake-2" },
      { userId: user3.id, nominationId: nominations[2]!.id, requestId: "snake-3" }
    ];

    for (const step of sequence) {
      const res = await post<{
        pick?: { seat_number: number };
        error?: { code: string };
      }>(
        `/drafts/${draft.id}/picks`,
        { nomination_id: step.nominationId, request_id: step.requestId },
        { authUserId: step.userId }
      );
      expect(res.status).toBe(201);
    }

    // Wrong seat attempts the 4th pick (should still be seat 3).
    const wrongTurn = await post<{ error?: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      { nomination_id: nominations[3]!.id, request_id: "snake-wrong" },
      { authUserId: user2.id }
    );
    expect(wrongTurn.status).toBe(409);
    expect(wrongTurn.json.error?.code).toBe("NOT_ACTIVE_TURN");

    const rest = [
      { userId: user3.id, nominationId: nominations[3]!.id, requestId: "snake-4" },
      { userId: user2.id, nominationId: nominations[4]!.id, requestId: "snake-5" },
      { userId: owner.id, nominationId: nominations[5]!.id, requestId: "snake-6" }
    ];

    for (const step of rest) {
      const res = await post<{
        pick?: { seat_number: number };
        error?: { code: string };
      }>(
        `/drafts/${draft.id}/picks`,
        { nomination_id: step.nominationId, request_id: step.requestId },
        { authUserId: step.userId }
      );
      expect(res.status).toBe(201);
    }

    const { rows: pickRows } = await db.pool.query<{
      seat_number: number;
      pick_number: number;
    }>(
      `SELECT seat_number, pick_number FROM draft_pick WHERE draft_id = $1 ORDER BY pick_number`,
      [draft.id]
    );
    expect(pickRows.map((p) => p.seat_number)).toEqual([1, 2, 3, 3, 2, 1]);

    const { rows: draftRows } = await db.pool.query<{
      status: string;
      current_pick_number: number | null;
    }>(`SELECT status, current_pick_number FROM draft WHERE id = $1`, [draft.id]);
    expect(draftRows[0].status).toBe("COMPLETED");
    expect(draftRows[0].current_pick_number).toBeNull();
  });
});
