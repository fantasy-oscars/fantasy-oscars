import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { insertCeremony } from "../../factories/db.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.post(path).set("content-type", "application/json").send(body);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function getJson<T>(
  path: string,
  token?: string
): Promise<{ status: number; json: T }> {
  const req = api.get(path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

describe("MVP end-to-end flow", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3110";
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret";
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
    resetAllRateLimiters();
  });

  it("covers auth → league → draft → winner lock → standings", async () => {
    // Admin setup
    const adminReg = await postJson<{ user: { id: number } }>("/auth/register", {
      username: "admin-e2e",
      email: "admin-e2e@example.com",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      adminReg.json.user.id
    ]);
    const adminLogin = await postJson<{ token: string }>("/auth/login", {
      username: "admin-e2e",
      password: "secret123"
    });

    // Ceremony + active
    const ceremony = await insertCeremony(
      db.pool,
      { code: "oscars-e2e", year: 2035 },
      false
    );
    await db.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
      ceremony.id
    ]);
    const setActive = await postJson(
      "/admin/ceremony/active",
      { ceremony_id: ceremony.id },
      adminLogin.json.token
    );
    expect(setActive.status).toBe(200);

    // Nominees dataset (single category with two noms)
    const dataset = {
      icons: [{ id: 1, code: "film", name: "Film", asset_path: "/icons/film.svg" }],
      ceremonies: [
        { id: ceremony.id, code: ceremony.code, name: ceremony.name, year: ceremony.year }
      ],
      category_families: [
        {
          id: 1,
          code: "best-picture",
          name: "Best Picture",
          icon_id: 1,
          default_unit_kind: "FILM"
        }
      ],
      category_editions: [
        {
          id: 1,
          ceremony_id: ceremony.id,
          family_id: 1,
          unit_kind: "FILM",
          icon_id: 1,
          sort_index: 1
        }
      ],
      films: [
        { id: 1, title: "Film A", country: null },
        { id: 2, title: "Film B", country: null }
      ],
      songs: [],
      performances: [],
      people: [],
      nominations: [
        {
          id: 1,
          category_edition_id: 1,
          film_id: 1,
          song_id: null,
          performance_id: null
        },
        { id: 2, category_edition_id: 1, film_id: 2, song_id: null, performance_id: null }
      ],
      nomination_contributors: []
    };

    const uploadRes = await postJson<{ ok: boolean }>(
      "/admin/nominees/upload",
      dataset,
      adminLogin.json.token
    );
    expect(uploadRes.status).toBe(200);

    // Commissioner + member
    const commishReg = await postJson<{ user: { id: number } }>("/auth/register", {
      username: "commish",
      email: "commish@example.com",
      password: "secret123"
    });
    const commishLogin = await postJson<{ token: string; user: { id: number } }>(
      "/auth/login",
      {
        username: "commish",
        password: "secret123"
      }
    );

    const memberReg = await postJson<{ user: { id: number } }>("/auth/register", {
      username: "member",
      email: "member@example.com",
      password: "secret123"
    });
    const memberLogin = await postJson<{ token: string }>("/auth/login", {
      username: "member",
      password: "secret123"
    });

    // League creation
    const leagueRes = await postJson<{
      league: { id: number; ceremony_id: number | null };
      season: null;
    }>("/leagues", { name: "E2E League" }, commishLogin.json.token);
    expect(leagueRes.status).toBe(201);
    const leagueId = leagueRes.json.league.id;
    expect(leagueRes.json.league.ceremony_id).toBeNull();

    const seasonRes = await postJson<{ season: { id: number; ceremony_id: number } }>(
      `/seasons/leagues/${leagueId}/seasons`,
      {},
      commishLogin.json.token
    );
    expect(seasonRes.status).toBe(201);
    const seasonId = seasonRes.json.season.id;

    // Ensure commissioner is registered as season member (safety against setup drift)
    const { rows: lmRows } = await db.pool.query<{ id: number }>(
      `SELECT id FROM league_member WHERE league_id = $1 AND user_id = $2`,
      [leagueId, commishReg.json.user.id]
    );
    const leagueMemberId =
      lmRows[0]?.id ??
      (
        await db.pool.query<{ id: number }>(
          `INSERT INTO league_member (league_id, user_id, role) VALUES ($1, $2, 'OWNER') RETURNING id`,
          [leagueId, commishReg.json.user.id]
        )
      ).rows[0].id;
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, 'OWNER')
       ON CONFLICT DO NOTHING`,
      [seasonId, commishReg.json.user.id, leagueMemberId]
    );

    // User-targeted invite and acceptance
    const inviteRes = await postJson<{
      invite: { id: number };
      error?: { code: string };
    }>(
      `/seasons/${seasonId}/user-invites`,
      { user_id: memberReg.json.user.id },
      commishLogin.json.token
    );
    // Include response payload in assertion failure output without emitting logs during passing runs.
    expect([200, 201], JSON.stringify(inviteRes.json)).toContain(inviteRes.status);
    const acceptRes = await postJson(
      `/seasons/invites/${inviteRes.json.invite.id}/accept`,
      {},
      memberLogin.json.token
    );
    expect(acceptRes.status).toBe(200);

    // Draft creation
    const draftCreate = await postJson<{ draft: { id: number } }>(
      "/drafts",
      { league_id: leagueId, season_id: seasonId, draft_order_type: "SNAKE" },
      commishLogin.json.token
    );
    expect(draftCreate.status).toBe(201);
    const draftId = draftCreate.json.draft.id;

    // Start draft
    const startRes = await postJson(
      `/drafts/${draftId}/start`,
      {},
      commishLogin.json.token
    );
    expect(startRes.status).toBe(200);

    // Determine current seat user (seat 1)
    const { rows: seatRows } = await db.pool.query<{
      user_id: number;
      seat_number: number;
    }>(
      `SELECT ds.seat_number, lm.user_id
       FROM draft_seat ds
       JOIN league_member lm ON lm.id = ds.league_member_id
       WHERE ds.draft_id = $1
       ORDER BY ds.seat_number ASC`,
      [draftId]
    );
    const seatOneUser = seatRows.find((s) => s.seat_number === 1)?.user_id;
    expect(seatOneUser).toBeDefined();
    const seatOneToken =
      seatOneUser === commishReg.json.user.id
        ? commishLogin.json.token
        : memberLogin.json.token;
    const otherToken =
      seatOneToken === commishLogin.json.token
        ? memberLogin.json.token
        : commishLogin.json.token;

    // First pick
    const pickRes = await postJson<{ pick: { nomination_id: number } }>(
      `/drafts/${draftId}/picks`,
      { nomination_id: 1, request_id: "req-1" },
      seatOneToken
    );
    // Include response payload in assertion failure output without emitting logs during passing runs.
    expect([200, 201], JSON.stringify(pickRes.json)).toContain(pickRes.status);

    // Enter winner (locks draft)
    const winnerRes = await postJson<{
      winners: Array<{ category_edition_id: number; nomination_id: number }>;
    }>(
      "/admin/winners",
      { category_edition_id: 1, nomination_id: 1 },
      adminLogin.json.token
    );
    expect(winnerRes.status).toBe(200);

    // Subsequent pick blocked
    const blockedPick = await postJson<{ error: { code: string } }>(
      `/drafts/${draftId}/picks`,
      { nomination_id: 2, request_id: "req-2" },
      otherToken
    );
    expect(blockedPick.status).toBe(409);
    // First winner entry locks the ceremony and cancels any in-progress drafts.
    expect(blockedPick.json.error.code).toBe("DRAFT_NOT_IN_PROGRESS");

    // Standings reflect winner
    const standingsRes = await getJson<{
      standings: Array<{
        seat_number: number;
        points: number;
        picks: Array<{ nomination_id: number }>;
      }>;
      results: Array<{ nomination_id: number; won: boolean }>;
    }>(`/drafts/${draftId}/standings`, commishLogin.json.token);
    expect(standingsRes.status).toBe(200);
    const seatOne = standingsRes.json.standings.find((s) => s.seat_number === 1)!;
    expect(seatOne.points).toBeGreaterThan(0);
    const seatTwo = standingsRes.json.standings.find((s) => s.seat_number === 2)!;
    expect(seatTwo.points).toBe(0);
    expect(standingsRes.json.results.find((r) => r.nomination_id === 1)?.won).toBe(true);
  });
});
