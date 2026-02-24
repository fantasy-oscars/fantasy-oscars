import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertDraft,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertSeason,
  insertUser,
  insertCeremony
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function setActiveCeremony(id: number) {
  await insertCeremony(db.pool, { id, code: `c-${id}`, year: 2030 + id });
  await db.pool.query(
    `INSERT INTO app_config (id, active_ceremony_id)
     VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET active_ceremony_id = EXCLUDED.active_ceremony_id`,
    [id]
  );
}

async function postJson<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api
    .post(path)
    .set("content-type", "application/json")
    .send(body ?? {});
  if (token) req.set("authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function getJson<T>(
  path: string,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.get(path);
  if (token) req.set("authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

describe("draft timers + auto-pick", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3107";
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

  it("auto-picks when timer expires (pause-aware)", async () => {
    await setActiveCeremony(1);
    const owner = await insertUser(db.pool, { id: 1 });
    const member = await insertUser(db.pool, { id: 2 });
    const token = signToken(
      { sub: String(owner.id), username: owner.username },
      "test-secret"
    );
    const league = await insertLeague(db.pool, {
      created_by_user_id: owner.id,
      ceremony_id: 1
    });
    const season = await insertSeason(db.pool, { league_id: league.id, ceremony_id: 1 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lmMember = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: member.id
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1,$2,$3,'OWNER'), ($1,$4,$5,'MEMBER')`,
      [season.id, owner.id, lmOwner.id, member.id, lmMember.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING",
      pick_timer_seconds: 1,
      auto_pick_strategy: "NEXT_AVAILABLE"
    });
    await insertNomination(db.pool, { ceremony_id: 1 });
    await insertNomination(db.pool, { ceremony_id: 1 });
    await insertNomination(db.pool, { ceremony_id: 1 });

    const startRes = await postJson<{
      draft: { id: number; pick_deadline_at: string | null };
    }>(`/drafts/${draft.id}/start`, {}, token);
    expect(startRes.status).toBe(200);
    expect(startRes.json.draft.pick_deadline_at).toBeTruthy();

    // Force deadline to the past.
    await db.pool.query(
      `UPDATE draft SET pick_deadline_at = now() - interval '2 seconds' WHERE id = $1`,
      [draft.id]
    );

    const snapshot = await getJson<{
      picks: Array<{ pick_number: number; nomination_id: number }>;
      draft: {
        current_pick_number: number | null;
        status: string;
        pick_deadline_at: string | null;
      };
    }>(`/drafts/${draft.id}/snapshot`, token);
    expect(snapshot.status).toBe(200);
    expect(snapshot.json.picks.length).toBe(1);
    expect(snapshot.json.picks[0].pick_number).toBe(1);
    expect(snapshot.json.draft.current_pick_number).toBe(2);
    expect(snapshot.json.draft.status).toBe("IN_PROGRESS");
    expect(snapshot.json.draft.pick_deadline_at).toBeTruthy();
  });

  it("freezes and resumes the timer on pause/resume", async () => {
    await setActiveCeremony(1);
    const owner = await insertUser(db.pool, { id: 1 });
    const member = await insertUser(db.pool, { id: 2 });
    const token = signToken(
      { sub: String(owner.id), username: owner.username },
      "test-secret"
    );
    const league = await insertLeague(db.pool, {
      created_by_user_id: owner.id,
      ceremony_id: 1
    });
    const season = await insertSeason(db.pool, { league_id: league.id, ceremony_id: 1 });
    const lmOwner = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: owner.id,
      role: "OWNER"
    });
    const lmMember = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: member.id
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1,$2,$3,'OWNER'), ($1,$4,$5,'MEMBER')`,
      [season.id, owner.id, lmOwner.id, member.id, lmMember.id]
    );
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "PENDING",
      pick_timer_seconds: 30,
      auto_pick_strategy: "NEXT_AVAILABLE"
    });
    await insertNomination(db.pool, { ceremony_id: 1 });
    await insertNomination(db.pool, { ceremony_id: 1 });

    const startRes = await postJson<{ draft: { pick_deadline_at: string | null } }>(
      `/drafts/${draft.id}/start`,
      {},
      token
    );
    expect(startRes.status).toBe(200);
    const deadlineBeforePause = startRes.json.draft.pick_deadline_at;
    expect(deadlineBeforePause).toBeTruthy();

    const pauseRes = await postJson<{ draft: { status: string } }>(
      `/drafts/${draft.id}/pause`,
      {},
      token
    );
    expect(pauseRes.status).toBe(200);
    const { rows: paused } = await db.pool.query<{
      pick_deadline_at: Date | null;
      pick_timer_remaining_ms: number | null;
    }>(`SELECT pick_deadline_at, pick_timer_remaining_ms FROM draft WHERE id = $1`, [
      draft.id
    ]);
    expect(paused[0].pick_deadline_at).toBeNull();
    expect(paused[0].pick_timer_remaining_ms).not.toBeNull();

    const resumeRes = await postJson<{ draft: { status: string } }>(
      `/drafts/${draft.id}/resume`,
      {},
      token
    );
    expect(resumeRes.status).toBe(200);
    const { rows: resumed } = await db.pool.query<{
      pick_deadline_at: Date | null;
      pick_timer_remaining_ms: number | null;
    }>(`SELECT pick_deadline_at, pick_timer_remaining_ms FROM draft WHERE id = $1`, [
      draft.id
    ]);
    expect(resumed[0].pick_deadline_at).not.toBeNull();
    expect(resumed[0].pick_timer_remaining_ms).toBeNull();
  });
});
