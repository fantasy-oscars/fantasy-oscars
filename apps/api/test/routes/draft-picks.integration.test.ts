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
  insertUser,
  insertNomination
} from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  opts: { token?: string } = {}
): Promise<{ status: number; json: T }> {
  if (!baseUrl) throw new Error("Test server not started");
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const json = (await res.json()) as T;
  return { status: res.status, json };
}

describe("draft picks integration", () => {
  beforeAll(async () => {
    try {
      process.env.PORT = process.env.PORT ?? "3110";
      process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
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

  function tokenFor(userId: number, handle = `u${userId}`) {
    return signToken(
      { sub: String(userId), handle },
      process.env.AUTH_SECRET ?? "test-secret"
    );
  }

  it("rejects pick when not active turn", async () => {
    if (skip || !db) return;
    if (!db) throw new Error("db not started");
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const seat1 = await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 1 });
    await insertDraftSeat(db.pool, { draft_id: draft.id, seat_number: 2 });
    const nomination = await insertNomination(db.pool);

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nomination_id: nomination.id,
          request_id: "req-not-active"
        })
      },
      { token: tokenFor(seat1.league_member_id + 1) }
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("NOT_ACTIVE_TURN");
  });

  it("accepts pick for active seat and advances turn", async () => {
    if (skip || !db) return;
    if (!db) throw new Error("db not started");
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);

    const res = await requestJson<{ pick: { pick_number: number; seat_number: number } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "req-1" })
      },
      { token: tokenFor(user1.id) }
    );

    expect(res.status).toBe(201);
    expect(res.json.pick.pick_number).toBe(1);
    expect(res.json.pick.seat_number).toBe(1);

    // Second pick should now be seat 2
    const nomination2 = await insertNomination(db.pool);
    const res2 = await requestJson<{
      pick: { pick_number: number; seat_number: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "req-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(res2.status).toBe(201);
    expect(res2.json.pick.pick_number).toBe(2);
    expect(res2.json.pick.seat_number).toBe(2);
  });

  it("enforces snake reversal across rounds", async () => {
    if (skip || !db) return;
    if (!db) throw new Error("db not started");
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const users = await Promise.all([1, 2, 3].map(() => insertUser(pool)));
    const seats = [];
    for (let i = 0; i < 3; i++) {
      const member = await insertLeagueMember(pool, {
        league_id: league.id,
        user_id: users[i].id
      });
      seats.push(
        await insertDraftSeat(pool, {
          draft_id: draft.id,
          seat_number: i + 1,
          league_member_id: member.id
        })
      );
    }
    const nominationIds = await Promise.all(
      [1, 2, 3, 4].map(() => insertNomination(pool))
    ).then((noms) => noms.map((n) => n.id));

    // picks 1,2,3
    for (let i = 0; i < 3; i++) {
      const res = await requestJson<{
        pick: { pick_number: number; seat_number: number };
      }>(
        `/drafts/${draft.id}/picks`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nomination_id: nominationIds[i],
            request_id: `req-${i + 1}`
          })
        },
        { token: tokenFor(users[i].id) }
      );
      expect(res.status).toBe(201);
    }

    // pick 4 should be seat 3 again (snake)
    const res4 = await requestJson<{
      pick: { pick_number: number; seat_number: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nominationIds[3], request_id: "req-4" })
      },
      { token: tokenFor(users[2].id) }
    );
    expect(res4.status).toBe(201);
    expect(res4.json.pick.pick_number).toBe(4);
    expect(res4.json.pick.seat_number).toBe(3);
  });

  it("rejects duplicate nomination", async () => {
    if (skip || !db) return;
    if (!db) throw new Error("db not started");
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination = await insertNomination(pool);

    await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination.id, request_id: "req-a" })
        // use seat 1 token
      },
      { token: tokenFor(user1.id) }
    );

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination.id, request_id: "req-b" })
      },
      { token: tokenFor(user1.id) }
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("NOMINATION_ALREADY_PICKED");
  });

  it("returns prior pick when request_id is repeated (same payload)", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user.id })
      ).id
    });
    const nomination = await insertNomination(pool);

    const first = await requestJson<{
      pick: { id: number; pick_number: number; nomination_id: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination.id, request_id: "same-req" })
      },
      { token: tokenFor(user.id) }
    );
    const second = await requestJson<{
      pick: { id: number; pick_number: number; nomination_id: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination.id, request_id: "same-req" })
      },
      { token: tokenFor(user.id) }
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.pick.id).toBe(first.json.pick.id);
    expect(second.json.pick.pick_number).toBe(1);
  });

  it("returns prior pick when request_id is repeated (different payload)", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);

    const first = await requestJson<{
      pick: { id: number; pick_number: number; nomination_id: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "mixed-req" })
      },
      { token: tokenFor(user.id) }
    );
    const second = await requestJson<{
      pick: { id: number; pick_number: number; nomination_id: number };
    }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "mixed-req" })
      },
      { token: tokenFor(user.id) }
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.pick.id).toBe(first.json.pick.id);
    expect(second.json.pick.nomination_id).toBe(nomination1.id);
  });

  it("rejects unknown nomination id", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user.id })
      ).id
    });

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: 9999, request_id: "req-missing" })
      },
      { token: tokenFor(user.id) }
    );

    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("NOMINATION_NOT_FOUND");
  });

  it("rejects pick when draft not in progress", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool);
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "PENDING",
      current_pick_number: 1
    });
    const user = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user.id })
      ).id
    });
    const nomination = await insertNomination(pool);

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination.id, request_id: "req-pending" })
      },
      { token: tokenFor(user.id) }
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_NOT_IN_PROGRESS");
  });

  it("marks draft completed when all picks are made", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);

    const res1 = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "req-1" })
      },
      { token: tokenFor(user1.id) }
    );
    const res2 = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "req-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const snapshot = await requestJson<{
      draft: { status: string; completed_at: string | null };
      picks: Array<{ pick_number: number }>;
      version: number;
    }>(`/drafts/${draft.id}/snapshot`, {}, { token: tokenFor(user1.id) });

    expect(snapshot.status).toBe(200);
    expect(snapshot.json.draft.status).toBe("COMPLETED");
    expect(snapshot.json.draft.completed_at).not.toBeNull();
    expect(snapshot.json.picks.length).toBe(2);
    expect(snapshot.json.version).toBe(2);
  });

  // Diagnostic: verify DB row actually flips to COMPLETED when pick threshold is reached.
  it("sets draft.status=COMPLETED in the database after the final required pick", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);

    const diag1 = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "diag-1" })
      },
      { token: tokenFor(user1.id) }
    );
    const diag2 = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "diag-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(diag1.status).toBe(201);
    expect(diag2.status).toBe(201);

    const row = await pool.query<{
      status: string;
      completed_at: Date | null;
      pick_count: number;
    }>(
      `SELECT status, completed_at,
              (SELECT COUNT(*) FROM draft_pick WHERE draft_id = $1)::int AS pick_count
       FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect(row.rows[0]).toBeDefined();
    expect(row.rows[0].pick_count).toBe(2);
    expect(row.rows[0].status).toBe("COMPLETED");
    expect(row.rows[0].completed_at).not.toBeNull();
  });

  it("rejects picks after draft completed", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);
    const nomination3 = await insertNomination(pool);

    const first = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "req-1" })
      },
      { token: tokenFor(user1.id) }
    );
    const second = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "req-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination3.id, request_id: "req-3" })
      },
      { token: tokenFor(user1.id) }
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_NOT_IN_PROGRESS");
  });

  // Regression: API must reject any pick after completion.
  it("rejects pick after draft is completed", async () => {
    if (skip || !db) return;
    const pool = db.pool;
    const league = await insertLeague(pool, { roster_size: 1 });
    const draft = await insertDraft(pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const user1 = await insertUser(pool);
    const user2 = await insertUser(pool);
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user1.id })
      ).id
    });
    await insertDraftSeat(pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: (
        await insertLeagueMember(pool, { league_id: league.id, user_id: user2.id })
      ).id
    });
    const nomination1 = await insertNomination(pool);
    const nomination2 = await insertNomination(pool);
    const nomination3 = await insertNomination(pool);

    const resA = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination1.id, request_id: "db-check-1" })
      },
      { token: tokenFor(user1.id) }
    );
    const resB = await requestJson(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomination_id: nomination2.id, request_id: "db-check-2" })
      },
      { token: tokenFor(user2.id) }
    );
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    // Confirm DB says completed before making the extra pick.
    const beforeExtra = await pool.query<{ status: string }>(
      `SELECT status FROM draft WHERE id = $1`,
      [draft.id]
    );
    expect(beforeExtra.rows[0]?.status).toBe("COMPLETED");

    const res = await requestJson<{ error: { code: string } }>(
      `/drafts/${draft.id}/picks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nomination_id: nomination3.id,
          request_id: "post-complete"
        })
      },
      { token: tokenFor(user1.id) }
    );

    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_NOT_IN_PROGRESS");
  });
});
