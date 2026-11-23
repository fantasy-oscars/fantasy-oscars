import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signTestToken } from "../../support/session.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import {
  insertDraft,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertSeason,
  insertUser
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
const AUTH_SECRET = "test-secret";

function tokenFor(user: { id: number; username: string }) {
  return signTestToken({ sub: String(user.id), username: user.username }, AUTH_SECRET);
}

async function seedLeague(
  opts: { isPublic?: boolean; draft?: Parameters<typeof insertDraft>[1] } = {}
) {
  const owner = await insertUser(db.pool);
  const member = await insertUser(db.pool);
  const outsider = await insertUser(db.pool);
  const league = await insertLeague(db.pool, {
    created_by_user_id: owner.id,
    is_public: opts.isPublic ?? false
  });
  await insertLeagueMember(db.pool, {
    league_id: league.id,
    user_id: owner.id,
    role: "OWNER"
  });
  await insertLeagueMember(db.pool, {
    league_id: league.id,
    user_id: member.id,
    role: "MEMBER"
  });
  const season = await insertSeason(db.pool, {
    league_id: league.id,
    ceremony_id: league.ceremony_id
  });
  const draft = await insertDraft(db.pool, {
    league_id: league.id,
    season_id: season.id,
    status: "COMPLETED",
    ...opts.draft
  });
  return { owner, member, outsider, league, season, draft };
}

describe("draft and league read/write access", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3121";
    process.env.AUTH_SECRET = AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    api = createApiAgent(createServer({ db: db.pool }));
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
  });

  it("draft export and standings are limited to league and season members", async () => {
    const { member, outsider, draft } = await seedLeague();

    for (const suffix of ["export", "standings"]) {
      const path = `/drafts/${draft.id}/${suffix}`;
      const refused = await api
        .get(path)
        .set("Authorization", `Bearer ${tokenFor(outsider)}`);
      expect(refused.status).toBe(404);
      expect(refused.body.error.code).toBe("DRAFT_NOT_FOUND");

      const allowed = await api
        .get(path)
        .set("Authorization", `Bearer ${tokenFor(member)}`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.draft.id).toBe(draft.id);
    }
  });

  it("recording draft results needs a commissioner", async () => {
    const { owner, member, outsider, league, draft } = await seedLeague();
    const nomination = await insertNomination(db.pool, {
      ceremony_id: league.ceremony_id
    });
    const body = { results: [{ nomination_id: nomination.id, won: true, points: 3 }] };
    const post = (user: { id: number; username: string }) =>
      api
        .post(`/drafts/${draft.id}/results`)
        .set("Authorization", `Bearer ${tokenFor(user)}`)
        .send(body);
    const countRows = async () =>
      Number(
        (
          await db.pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM draft_result WHERE draft_id = $1`,
            [draft.id]
          )
        ).rows[0].count
      );

    const asOutsider = await post(outsider);
    expect(asOutsider.status).toBe(404);
    expect(asOutsider.body.error.code).toBe("DRAFT_NOT_FOUND");
    const asMember = await post(member);
    expect(asMember.status).toBe(403);
    expect(asMember.body.error.code).toBe("FORBIDDEN");
    expect(await countRows()).toBe(0);

    const asOwner = await post(owner);
    expect(asOwner.status).toBe(200);
    expect(await countRows()).toBe(1);
  });

  it("a private league is visible only to its members", async () => {
    const { member, outsider, league } = await seedLeague({ isPublic: false });

    const refused = await api
      .get(`/leagues/${league.id}`)
      .set("Authorization", `Bearer ${tokenFor(outsider)}`);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe("LEAGUE_NOT_FOUND");

    const allowed = await api
      .get(`/leagues/${league.id}`)
      .set("Authorization", `Bearer ${tokenFor(member)}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.league.id).toBe(league.id);
  });

  it("a public league stays visible to any signed-in user", async () => {
    const { outsider, league } = await seedLeague({ isPublic: true });
    const res = await api
      .get(`/leagues/${league.id}`)
      .set("Authorization", `Bearer ${tokenFor(outsider)}`);
    expect(res.status).toBe(200);
    expect(res.body.league.id).toBe(league.id);
  });

  const seedTimedDraft = () =>
    seedLeague({
      draft: {
        status: "IN_PROGRESS",
        current_pick_number: 1,
        pick_timer_seconds: 60,
        pick_deadline_at: null
      }
    });
  const timerState = async (draftId: number) => ({
    deadline: (
      await db.pool.query<{ pick_deadline_at: Date | null }>(
        `SELECT pick_deadline_at FROM draft WHERE id = $1`,
        [draftId]
      )
    ).rows[0].pick_deadline_at,
    events: Number(
      (
        await db.pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM draft_event WHERE draft_id = $1`,
          [draftId]
        )
      ).rows[0].count
    )
  });

  it("ticking a draft is limited to members and leaves outsiders' calls without effect", async () => {
    const { member, outsider, draft } = await seedTimedDraft();

    const refused = await api
      .post(`/drafts/${draft.id}/tick`)
      .set("Authorization", `Bearer ${tokenFor(outsider)}`);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe("DRAFT_NOT_FOUND");
    expect(await timerState(draft.id)).toEqual({ deadline: null, events: 0 });

    const allowed = await api
      .post(`/drafts/${draft.id}/tick`)
      .set("Authorization", `Bearer ${tokenFor(member)}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.draft.id).toBe(draft.id);
    expect((await timerState(draft.id)).deadline).not.toBeNull();
  });

  it("the snapshot checks access before it runs any timer side effect", async () => {
    const { member, outsider, draft } = await seedTimedDraft();

    const refused = await api
      .get(`/drafts/${draft.id}/snapshot`)
      .set("Authorization", `Bearer ${tokenFor(outsider)}`);
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe("DRAFT_NOT_FOUND");
    expect(await timerState(draft.id)).toEqual({ deadline: null, events: 0 });

    const allowed = await api
      .get(`/drafts/${draft.id}/snapshot`)
      .set("Authorization", `Bearer ${tokenFor(member)}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.draft.id).toBe(draft.id);
    expect((await timerState(draft.id)).deadline).not.toBeNull();
  });
});
