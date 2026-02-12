import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertDraft,
  insertDraftPick,
  insertDraftSeat,
  insertFilm,
  insertIcon,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertPerformance,
  insertPerson,
  insertUser
} from "../../factories/db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;

describe("db factories (integration)", () => {
  beforeAll(async () => {
    db = await startTestDatabase();
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
  });

  it("creates a ceremony, category, nomination, league, draft, and pick", async () => {
    const icon = await insertIcon(db.pool);
    const ceremony = await insertCeremony(db.pool, { year: 2025 });
    const family = await insertCategoryFamily(db.pool, {
      icon_id: icon.id
    });
    const category = await insertCategoryEdition(db.pool, {
      ceremony_id: ceremony.id,
      family_id: family.id
    });

    const film = await insertFilm(db.pool, { title: "Test Film" });
    const person = await insertPerson(db.pool, { full_name: "Actor A" });
    await insertPerformance(db.pool, { film_id: film.id, person_id: person.id });
    const nomination = await insertNomination(db.pool, {
      category_edition_id: category.id,
      film_id: film.id
    });

    const user = await insertUser(db.pool, { username: "owner" });
    const league = await insertLeague(db.pool, {
      ceremony_id: ceremony.id,
      created_by_user_id: user.id,
      code: "league-1"
    });
    const member = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user.id,
      role: "OWNER"
    });
    const draft = await insertDraft(db.pool, {
      league_id: league.id,
      status: "IN_PROGRESS"
    });
    await insertDraftSeat(db.pool, {
      draft_id: draft.id,
      league_member_id: member.id,
      seat_number: 1
    });
    const pick = await insertDraftPick(db.pool, {
      draft_id: draft.id,
      league_member_id: member.id,
      nomination_id: nomination.id,
      pick_number: 1,
      round_number: 1,
      seat_number: 1
    });

    expect(ceremony.year).toBe(2025);
    expect(category.ceremony_id).toBe(ceremony.id);
    expect(nomination.film_id).toBe(film.id);
    expect(league.created_by_user_id).toBe(user.id);
    expect(draft.status).toBe("IN_PROGRESS");
    expect(pick.pick_number).toBe(1);
  });
});
