import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { signToken } from "../../src/auth/token.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import {
  insertDraft,
  insertDraftPick,
  insertDraftSeat,
  insertLeague,
  insertCeremonyWinner,
  insertCategoryEdition,
  insertNomination,
  insertSeason
} from "../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
const AUTH_SECRET = "test-secret";

async function getJson<T>(path: string): Promise<{ status: number; json: T }> {
  const token = signToken({ sub: "1", username: "tester" }, AUTH_SECRET);
  const res = await api.get(path).set("authorization", `Bearer ${token}`);
  return { status: res.status, json: res.body as T };
}

describe("draft standings scoring strategies", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3116";
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

  it("computes different standings for fixed vs negative strategies", async () => {
    // Fixed strategy draft
    const leagueFixed = await insertLeague(db.pool);
    const seasonFixed = await insertSeason(db.pool, {
      league_id: leagueFixed.id,
      ceremony_id: leagueFixed.ceremony_id,
      scoring_strategy_name: "fixed"
    });
    const draftFixed = await insertDraft(db.pool, {
      league_id: leagueFixed.id,
      season_id: seasonFixed.id,
      status: "COMPLETED"
    });
    const seat1 = await insertDraftSeat(db.pool, {
      draft_id: draftFixed.id,
      seat_number: 1
    });
    const seat2 = await insertDraftSeat(db.pool, {
      draft_id: draftFixed.id,
      seat_number: 2
    });
    const nomWin = await insertNomination(db.pool, {
      ceremony_id: leagueFixed.ceremony_id
    });
    const nomLose = await insertNomination(db.pool, {
      ceremony_id: leagueFixed.ceremony_id
    });
    await insertDraftPick(db.pool, {
      draft_id: draftFixed.id,
      seat_number: 1,
      league_member_id: seat1.league_member_id,
      pick_number: 1,
      round_number: 1,
      nomination_id: nomWin.id
    });
    await insertDraftPick(db.pool, {
      draft_id: draftFixed.id,
      seat_number: 2,
      league_member_id: seat2.league_member_id,
      pick_number: 2,
      round_number: 1,
      nomination_id: nomLose.id
    });
    await insertCeremonyWinner(db.pool, {
      ceremony_id: leagueFixed.ceremony_id,
      category_edition_id: nomWin.category_edition_id,
      nomination_id: nomWin.id
    });

    const fixedRes = await getJson<{
      standings: Array<{ seat_number: number; points: number }>;
    }>(`/drafts/${draftFixed.id}/standings`);
    expect(fixedRes.status).toBe(200);
    const fixedPoints = new Map(
      fixedRes.json.standings.map((s) => [s.seat_number, s.points])
    );
    expect(fixedPoints.get(1)).toBe(1);
    expect(fixedPoints.get(2)).toBe(0);

    // Negative strategy draft
    const leagueNeg = await insertLeague(db.pool);
    const seasonNeg = await insertSeason(db.pool, {
      league_id: leagueNeg.id,
      ceremony_id: leagueNeg.ceremony_id,
      scoring_strategy_name: "negative"
    });
    const draftNeg = await insertDraft(db.pool, {
      league_id: leagueNeg.id,
      season_id: seasonNeg.id,
      status: "COMPLETED"
    });
    const negSeat1 = await insertDraftSeat(db.pool, {
      draft_id: draftNeg.id,
      seat_number: 1
    });
    const negSeat2 = await insertDraftSeat(db.pool, {
      draft_id: draftNeg.id,
      seat_number: 2
    });
    const nomWin2 = await insertNomination(db.pool, {
      ceremony_id: leagueNeg.ceremony_id
    });
    const nomLose2 = await insertNomination(db.pool, {
      ceremony_id: leagueNeg.ceremony_id
    });
    await insertDraftPick(db.pool, {
      draft_id: draftNeg.id,
      seat_number: 1,
      league_member_id: negSeat1.league_member_id,
      pick_number: 1,
      round_number: 1,
      nomination_id: nomWin2.id
    });
    await insertDraftPick(db.pool, {
      draft_id: draftNeg.id,
      seat_number: 2,
      league_member_id: negSeat2.league_member_id,
      pick_number: 2,
      round_number: 1,
      nomination_id: nomLose2.id
    });
    await insertCeremonyWinner(db.pool, {
      ceremony_id: leagueNeg.ceremony_id,
      category_edition_id: nomWin2.category_edition_id,
      nomination_id: nomWin2.id
    });

    const negRes = await getJson<{
      standings: Array<{ seat_number: number; points: number }>;
    }>(`/drafts/${draftNeg.id}/standings`);
    expect(negRes.status).toBe(200);
    const negPoints = new Map(
      negRes.json.standings.map((s) => [s.seat_number, s.points])
    );
    expect(negPoints.get(1)).toBe(1);
    expect(negPoints.get(2)).toBe(-1);
  });

  it("recomputes standings when ceremony winners change", async () => {
    const league = await insertLeague(db.pool);
    const season = await insertSeason(db.pool, {
      league_id: league.id,
      ceremony_id: league.ceremony_id,
      scoring_strategy_name: "fixed"
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      season_id: season.id,
      status: "COMPLETED"
    });
    const seat1 = await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      seat_number: 1
    });
    const seat2 = await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      seat_number: 2
    });

    const category = await insertCategoryEdition(db.pool, {
      ceremony_id: league.ceremony_id
    });
    const nominationA = await insertNomination(db.pool, {
      category_edition_id: category.id,
      ceremony_id: league.ceremony_id
    });
    const nominationB = await insertNomination(db.pool, {
      category_edition_id: category.id,
      ceremony_id: league.ceremony_id
    });

    await insertDraftPick(db.pool, {
      draft_id: draft.id,
      seat_number: 1,
      league_member_id: seat1.league_member_id,
      pick_number: 1,
      round_number: 1,
      nomination_id: nominationA.id
    });
    await insertDraftPick(db.pool, {
      draft_id: draft.id,
      seat_number: 2,
      league_member_id: seat2.league_member_id,
      pick_number: 2,
      round_number: 1,
      nomination_id: nominationB.id
    });

    await insertCeremonyWinner(db.pool, {
      ceremony_id: league.ceremony_id,
      category_edition_id: category.id,
      nomination_id: nominationA.id
    });

    const beforeChange = await getJson<{
      standings: Array<{ seat_number: number; points: number }>;
    }>(`/drafts/${draft.id}/standings`);
    expect(beforeChange.status).toBe(200);
    const initialPoints = new Map(
      beforeChange.json.standings.map((s) => [s.seat_number, s.points])
    );
    expect(initialPoints.get(1)).toBe(1);
    expect(initialPoints.get(2)).toBe(0);

    await insertCeremonyWinner(db.pool, {
      ceremony_id: league.ceremony_id,
      category_edition_id: category.id,
      nomination_id: nominationB.id
    });

    const afterChange = await getJson<{
      standings: Array<{ seat_number: number; points: number }>;
    }>(`/drafts/${draft.id}/standings`);
    expect(afterChange.status).toBe(200);
    const updatedPoints = new Map(
      afterChange.json.standings.map((s) => [s.seat_number, s.points])
    );
    expect(updatedPoints.get(1)).toBe(0);
    expect(updatedPoints.get(2)).toBe(1);
  });
});
