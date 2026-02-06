import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import { insertLeague, insertSeason, insertUser } from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

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

describe("drafts integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3102";
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

  async function publishCeremony(ceremonyId: number) {
    await db.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
      ceremonyId
    ]);
  }

  it("rejects draft creation when unauthenticated", async () => {
    const league = await insertLeague(db.pool);
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    const res = await post<{ error: { code: string } }>(
      "/drafts",
      { league_id: league.id, season_id: season.id, draft_order_type: "SNAKE" },
      { auth: false }
    );
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("UNAUTHORIZED");
  });

  it("creates a draft in pending state when commissioner", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    const res = await post<{ draft: { id: number; league_id: number; status: string } }>(
      "/drafts",
      { league_id: league.id, season_id: season.id, draft_order_type: "SNAKE" }
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
    await insertUser(db.pool, { id: 1 });
    const res = await post<{ error: { code: string } }>("/drafts", {});
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects when league does not exist", async () => {
    await insertUser(db.pool, { id: 1 });
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: 999,
      season_id: 1,
      draft_order_type: "SNAKE"
    });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("LEAGUE_NOT_FOUND");
  });

  it("rejects non-snake draft order", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: league.id,
      season_id: season.id,
      draft_order_type: "LINEAR"
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects when draft already exists for league", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    await post("/drafts", {
      league_id: league.id,
      season_id: season.id,
      draft_order_type: "SNAKE"
    });
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: league.id,
      season_id: season.id,
      draft_order_type: "SNAKE"
    });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("DRAFT_EXISTS");
  });

  it("pauses and resumes a draft as commissioner", async () => {
    await insertUser(db.pool, { id: 1 });
    const league = await insertLeague(db.pool, { created_by_user_id: 1 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    const draftRes = await post<{ draft: { id: number } }>("/drafts", {
      league_id: league.id,
      season_id: season.id,
      draft_order_type: "SNAKE"
    });
    const draftId = draftRes.json.draft.id;

    await db.pool.query(
      `UPDATE draft SET status = 'IN_PROGRESS', current_pick_number = 1 WHERE id = $1`,
      [draftId]
    );

    const pauseRes = await post<{ draft: { status: string } }>(
      `/drafts/${draftId}/pause`,
      {}
    );
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.json.draft.status).toBe("PAUSED");

    const resumeRes = await post<{ draft: { status: string } }>(
      `/drafts/${draftId}/resume`,
      {}
    );
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.json.draft.status).toBe("IN_PROGRESS");
  });

  it("rejects draft creation when user is not a commissioner", async () => {
    await insertUser(db.pool, { id: 1 });
    await insertUser(db.pool, { id: 2 });
    const league = await insertLeague(db.pool, { created_by_user_id: 2 });
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id
    });
    await publishCeremony(season.ceremony_id);
    const res = await post<{ error: { code: string } }>("/drafts", {
      league_id: league.id,
      season_id: season.id,
      draft_order_type: "SNAKE"
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");
  });
});
