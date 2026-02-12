import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertDraft,
  insertLeague,
  insertNomination,
  insertUser,
  insertLeagueMember,
  insertSeason
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
async function setActiveCeremony(id: number) {
  await db.pool.query(
    `INSERT INTO app_config (id, active_ceremony_id)
     VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
    [id]
  );
}

async function requestJson<T>(
  path: string,
  init: { method: "POST"; body?: unknown } = { method: "POST" },
  opts: { auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  const token =
    opts.auth === false
      ? null
      : signToken(
          { sub: "1", username: "tester" },
          process.env.AUTH_SECRET ?? "test-secret"
        );
  const req = api
    .post(path)
    .set("content-type", "application/json")
    .send(init.body ?? {});
  if (token) req.set("authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function post<T>(
  path: string,
  body: unknown,
  opts: { auth?: boolean } = {}
): Promise<{ status: number; json: T }> {
  return requestJson<T>(path, { method: "POST", body }, opts);
}

describe("draft start integration", () => {
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

  it("rejects start when unauthenticated", async () => {
    const league = await insertLeague(db.pool);
    const draft = await insertDraft(db.pool, { league_id: league.id, status: "PENDING" });
    const res = await post<{ error: { code: string } }>(
      `/drafts/${draft.id}/start`,
      {},
      { auth: false }
    );
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("starts a draft, revokes pending invites, creates randomized seats, and sets current_pick_number", async () => {
    const owner = await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    const memberA = await insertUser(db.pool, { id: 2 });
    const memberB = await insertUser(db.pool, { id: 3 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lmA = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: memberA.id
    });
    const lmB = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: memberB.id
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role) VALUES ($1,$2,$3,'OWNER'),($1,$4,$5,'MEMBER'),($1,$6,$7,'MEMBER')`,
      [season.id, owner.id, lmOwner.id, memberA.id, lmA.id, memberB.id, lmB.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    for (let i = 0; i < 6; i += 1) {
      await insertNomination(db.pool);
    }
    // create two pending invites that should be revoked
    await db.pool.query(
      `INSERT INTO season_invite (season_id, token_hash, kind, status, created_by_user_id)
       VALUES ($1,'hash1','PLACEHOLDER','PENDING',$2), ($1,'hash2','PLACEHOLDER','PENDING',$2)`,
      [season.id, owner.id]
    );

    const res = await post<{
      draft: {
        id: number;
        status: string;
        current_pick_number: number;
        picks_per_seat: number;
      };
    }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(200);
    expect(res.json.draft.status).toBe("IN_PROGRESS");
    expect(res.json.draft.current_pick_number).toBe(1);
    expect(res.json.draft.picks_per_seat).toBe(2);
    const { rows: seats } = await db.pool.query<{
      seat_number: number;
      league_member_id: number;
    }>(
      `SELECT seat_number, league_member_id FROM draft_seat WHERE draft_id = $1 ORDER BY seat_number`,
      [draft.id]
    );
    expect(seats).toHaveLength(3);
    expect(seats[0].seat_number).toBe(1);
    expect(new Set(seats.map((s) => Number(s.league_member_id)))).toEqual(
      new Set([lmOwner.id, lmA.id, lmB.id])
    );
    const { rows: invites } = await db.pool.query<{ status: string }>(
      `SELECT status FROM season_invite WHERE season_id = $1`,
      [season.id]
    );
    expect(invites.every((i) => i.status === "REVOKED")).toBe(true);
    const { rows: events } = await db.pool.query<{
      version: number;
      event_type: string;
    }>(
      `SELECT version::int AS version, event_type
       FROM draft_event
       WHERE draft_id = $1
       ORDER BY version ASC`,
      [draft.id]
    );
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(1);
    expect(events[0].event_type).toBe("draft.started");
  });

  it("honors FULL_POOL remainder strategy and freezes total_picks on draft", async () => {
    const owner = await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    const memberA = await insertUser(db.pool, { id: 2 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lmA = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: memberA.id
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role) VALUES ($1,$2,$3,'OWNER'),($1,$4,$5,'MEMBER')`,
      [season.id, owner.id, lmOwner.id, memberA.id, lmA.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    for (let i = 0; i < 5; i += 1) {
      await insertNomination(db.pool);
    }

    const resAllocation = await post<{ season: { remainder_strategy: string } }>(
      `/seasons/${season.id}/allocation`,
      { remainder_strategy: "FULL_POOL" }
    );
    expect(resAllocation.status).toBe(200);
    expect(resAllocation.json.season.remainder_strategy).toBe("FULL_POOL");

    const res = await post<{
      draft: {
        status: string;
        picks_per_seat: number;
        total_picks: number;
        remainder_strategy: string;
      };
    }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(200);
    expect(res.json.draft.remainder_strategy).toBe("FULL_POOL");
    expect(res.json.draft.picks_per_seat).toBe(2);
    expect(res.json.draft.total_picks).toBe(5);
  });

  it("rejects when already started", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS",
      current_pick_number: 1
    });
    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_ALREADY_STARTED");
  });

  it("rejects start when ceremony is draft-locked (winners entered)", async () => {
    const owner = await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    await db.pool.query(`UPDATE ceremony SET draft_locked_at = now() WHERE id = $1`, [
      league.ceremony_id
    ]);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    await insertNomination(db.pool, { ceremony_id: league.ceremony_id });

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_LOCKED");
  });

  it("rejects start when season is cancelled", async () => {
    const owner = await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id,
      status: "CANCELLED"
    });
    await setActiveCeremony(season.ceremony_id);
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    await insertNomination(db.pool, { ceremony_id: league.ceremony_id });

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("SEASON_CANCELLED");
  });

  it("rejects when fewer than two participants", async () => {
    const owner = await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role) VALUES ($1,$2,$3,'OWNER')`,
      [season.id, owner.id, lmOwner.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    await insertNomination(db.pool);

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("NOT_ENOUGH_PARTICIPANTS");
  });

  it("rejects when no nominations loaded", async () => {
    await insertUser(db.pool, { id: 1 });
    await insertUser(db.pool, { id: 2 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1,
      role: "OWNER"
    });
    const lmMember = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 2
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role) VALUES ($1,$2,$3,'OWNER'),($1,$4,$5,'MEMBER')`,
      [season.id, 1, lmOwner.id, 2, lmMember.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("PREREQ_MISSING_NOMINATIONS");
  });

  it("rejects when draft missing", async () => {
    await insertUser(db.pool, { id: 1 });
    const res = await post<{ error: { code: string } }>(`/drafts/999/start`, {});
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("DRAFT_NOT_FOUND");
  });

  it("rejects start when user is not a commissioner", async () => {
    await insertUser(db.pool, { id: 1 });
    await insertUser(db.pool, { id: 2 });
    const league = await insertLeague(db.pool, { created_by_user_id: 2 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await setActiveCeremony(season.ceremony_id);
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 2,
      role: "OWNER"
    });
    const lmMember = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: 1,
      role: "MEMBER"
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role) VALUES ($1,$2,$3,'OWNER'),($1,$4,$5,'MEMBER')`,
      [season.id, 2, lmOwner.id, 1, lmMember.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING"
    });
    await insertNomination(db.pool);

    const res = await post<{ error: { code: string } }>(`/drafts/${draft.id}/start`, {});
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");
  });
});
