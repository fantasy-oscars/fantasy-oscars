import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listScoreEntries } from "../../../src/data/repositories/circuitScoreRepository.js";
import { instantOfDay } from "../../../src/domain/circuit.js";
import { createServer } from "../../../src/server.js";
import { setCircuitLeagueEvents } from "../../../src/services/circuit/circuitLeagues.js";
import {
  registerCircuitScoreEventEmitter,
  type CircuitScoreUpdateMessage
} from "../../../src/services/circuit/circuitScoreEvents.js";
import { rebuildCircuitScoresForDay } from "../../../src/services/circuit/circuitScoring.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertPerson,
  insertUser
} from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

const AUTH_SECRET = "test-secret";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let adminToken: string;

type User = { id: number; username: string };

// Past dates, so every occasion's instant has passed when the routes rebuild.
const NOMINATIONS_ON = "2026-01-21";
const NOMINATIONS_INSTANT = instantOfDay(NOMINATIONS_ON); // 08:00Z
const STARTS_AT = "2026-03-15T00:00:00.000Z"; // Mar 14, 17:00 Pacific
const RESULTS_ON = "2026-03-14";
const DRAFTED = new Date("2025-12-04T03:00:00Z");

async function send(
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  body?: Record<string, unknown>
) {
  let req = api[method](path).set({ Authorization: `Bearer ${adminToken}` });
  if (body) req = req.set("content-type", "application/json").send(body);
  return req;
}

describe("circuit scoring ledger", () => {
  let alice: User;
  let bob: User;
  let circuitId: number;
  let eventId: number;
  let ceremonyId: number;
  let circuitLeagueId: number;
  let pictureId: number;
  let editionId: number;
  let secondEditionId: number;
  let filmId: number;
  let otherFilmId: number;
  let selectionId: number;
  let otherSelectionId: number;
  const memberIds = new Map<number, number>();

  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
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
    resetAllRateLimiters();
    memberIds.clear();
    const admin = await insertUser(db.pool, { username: "admin" });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [admin.id]);
    adminToken = signTestToken({ sub: String(admin.id), username: "admin" }, AUTH_SECRET);
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    for (const user of [alice, bob]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }

    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    circuitId = circuit.rows[0]!.id;
    const event = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
       VALUES ($1, 'oscars', 'Oscars', 0) RETURNING id::int`,
      [circuitId]
    );
    eventId = event.rows[0]!.id;
    const ceremony = await insertCeremony(db.pool, {}, false);
    ceremonyId = ceremony.id;
    await db.pool.query(
      `UPDATE ceremony SET status = 'PUBLISHED', nominations_on = $2::date, starts_at = $3
       WHERE id = $1`,
      [ceremonyId, NOMINATIONS_ON, STARTS_AT]
    );
    await db.pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, 0)`,
      [circuitId, ceremonyId, eventId]
    );
    const category = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [circuitId]
    );
    pictureId = category.rows[0]!.id;
    const family = await insertCategoryFamily(db.pool);
    editionId = (
      await insertCategoryEdition(db.pool, {
        ceremony_id: ceremonyId,
        family_id: family.id,
        code: "picture"
      })
    ).id;
    secondEditionId = (
      await insertCategoryEdition(db.pool, {
        ceremony_id: ceremonyId,
        family_id: family.id,
        code: "picture-drama"
      })
    ).id;
    await db.pool.query(
      `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
       VALUES ($1, $2, $3)`,
      [circuitId, editionId, pictureId]
    );

    filmId = (await insertFilm(db.pool)).id;
    otherFilmId = (await insertFilm(db.pool)).id;
    selectionId = await insertSelection(pictureId, filmId, 5001);
    otherSelectionId = await insertSelection(pictureId, otherFilmId, 5002);

    const created = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_league
         (circuit_id, league_id, status, initialized_at, created_by_user_id)
       VALUES ($1, $2, 'IN_SEASON', now(), $3) RETURNING id::int`,
      [circuitId, league.id, alice.id]
    );
    circuitLeagueId = created.rows[0]!.id;
    await db.pool.query(
      `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
       VALUES ($1, $2, $3)`,
      [circuitLeagueId, circuitId, eventId]
    );
    for (const user of [alice, bob]) {
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id)
         VALUES ($1, $2) RETURNING id::int`,
        [circuitLeagueId, user.id]
      );
      memberIds.set(user.id, rows[0]!.id);
    }
  });

  async function insertSelection(
    categoryId: number,
    film: number,
    tmdbId: number,
    person: { id: number; tmdb_id: number } | null = null
  ) {
    await db.pool.query(`UPDATE film SET tmdb_id = $2 WHERE id = $1`, [film, tmdbId]);
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_selection
         (circuit_category_id, film_tmdb_id, film_id, person_tmdb_id, person_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
      [categoryId, tmdbId, film, person?.tmdb_id ?? null, person?.id ?? null]
    );
    return rows[0]!.id;
  }

  /** An ownership interval with chosen times, through the transactions behind it. */
  async function own(
    user: User,
    selection: number,
    from: Date,
    until: Date | null = null
  ) {
    const member = memberIds.get(user.id)!;
    const add = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_transaction
         (circuit_league_id, member_id, kind, add_selection_id, occurred_at)
       VALUES ($1, $2, 'FREE_AGENT', $3, $4) RETURNING id::int`,
      [circuitLeagueId, member, selection, from]
    );
    const interval = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_ownership
         (circuit_league_id, member_id, selection_id, acquired_at, acquired_transaction_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
      [circuitLeagueId, member, selection, from, add.rows[0]!.id]
    );
    if (until) {
      const drop = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_transaction
           (circuit_league_id, member_id, kind, drop_selection_id, occurred_at)
         VALUES ($1, $2, 'DROP', $3, $4) RETURNING id::int`,
        [circuitLeagueId, member, selection, until]
      );
      await db.pool.query(
        `UPDATE circuit_ownership SET released_at = $2, released_transaction_id = $3
         WHERE id = $1`,
        [interval.rows[0]!.id, until, drop.rows[0]!.id]
      );
    }
  }

  async function nominate(film: number, edition = editionId) {
    const res = await send("post", `/admin/ceremonies/${ceremonyId}/nominations`, {
      category_edition_id: edition,
      film_id: film
    });
    expect(res.status).toBe(201);
    return (res.body as { nomination_id: number }).nomination_id;
  }

  async function ledger() {
    return (await listScoreEntries(db.pool, circuitLeagueId)).map((e) => ({
      member: e.member_id,
      selection: e.selection_id,
      kind: e.kind,
      date: e.occasion_date,
      points: e.points
    }));
  }

  const member = (user: User) => memberIds.get(user.id)!;

  it("scores a nomination entry for whoever owned the selection at 00:00 Pacific", async () => {
    // Alice let selection 1 go a second before the instant and Bob took it;
    // Alice took selection 2 on the nominations day itself, after the instant.
    const handover = new Date(NOMINATIONS_INSTANT.getTime() - 1000);
    await own(alice, selectionId, DRAFTED, handover);
    await own(bob, selectionId, handover);
    await own(alice, otherSelectionId, new Date("2026-01-21T18:00:00Z"));

    await nominate(filmId);
    await nominate(otherFilmId);

    expect(await ledger()).toEqual([
      {
        member: member(bob),
        selection: selectionId,
        kind: "NOMINATION",
        date: NOMINATIONS_ON,
        points: 1
      }
    ]);
  });

  it("splits a selection dropped between nomination and win, and never touches the Circuit draft", async () => {
    const dropped = new Date("2026-02-01T18:00:00Z");
    await own(alice, selectionId, DRAFTED, dropped);
    await own(bob, selectionId, new Date("2026-02-02T18:00:00Z"));
    // Bob owns selection 2 throughout: nominated and winning, it scores 3.
    await own(bob, otherSelectionId, DRAFTED);
    await db.pool.query(
      `INSERT INTO circuit_draft (circuit_league_id, status, rounds, started_at, completed_at)
       VALUES ($1, 'COMPLETED', 16, $2, $2)`,
      [circuitLeagueId, DRAFTED]
    );
    const draftBefore = await db.pool.query(`SELECT * FROM circuit_draft`);

    const nomination = await nominate(filmId);
    const other = await nominate(otherFilmId);
    const res = await send("post", "/admin/winners", {
      category_edition_id: editionId,
      nomination_ids: [nomination, other]
    });
    expect(res.status).toBe(200);

    expect(await ledger()).toEqual([
      {
        member: member(alice),
        selection: selectionId,
        kind: "NOMINATION",
        date: NOMINATIONS_ON,
        points: 1
      },
      {
        member: member(bob),
        selection: otherSelectionId,
        kind: "NOMINATION",
        date: NOMINATIONS_ON,
        points: 1
      },
      {
        member: member(bob),
        selection: selectionId,
        kind: "WIN",
        date: RESULTS_ON,
        points: 2
      },
      {
        member: member(bob),
        selection: otherSelectionId,
        kind: "WIN",
        date: RESULTS_ON,
        points: 2
      }
    ]);
    // Winner entry locks only the ceremony; the Circuit draft is unchanged.
    const { rows } = await db.pool.query<{ status: string }>(
      `SELECT status FROM ceremony WHERE id = $1`,
      [ceremonyId]
    );
    expect(rows[0]?.status).toBe("LOCKED");
    expect((await db.pool.query(`SELECT * FROM circuit_draft`)).rows).toEqual(
      draftBefore.rows
    );
  });

  it("rebuilds on nomination changes and deletes", async () => {
    await own(alice, selectionId, DRAFTED);
    const nomination = await nominate(filmId);
    expect(await ledger()).toHaveLength(1);

    const change = (action: "REVOKE" | "RESTORE") =>
      send("post", `/admin/nominations/${nomination}/change`, {
        action,
        origin: "INTERNAL",
        impact: "CONSEQUENTIAL",
        reason: "Corrected entry"
      });
    expect((await change("REVOKE")).status).toBe(200);
    expect(await ledger()).toEqual([]);
    expect((await change("RESTORE")).status).toBe(200);
    expect(await ledger()).toHaveLength(1);

    expect((await send("delete", `/admin/nominations/${nomination}`)).status).toBe(200);
    expect(await ledger()).toEqual([]);
  });

  it("rebuilds on contributor writes for acting selections", async () => {
    const actor = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'actor', 'Actor', 'ACTING', 1) RETURNING id::int`,
      [circuitId]
    );
    const actingEdition = await insertCategoryEdition(db.pool, {
      ceremony_id: ceremonyId,
      unit_kind: "PERFORMANCE"
    });
    await db.pool.query(
      `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
       VALUES ($1, $2, $3)`,
      [circuitId, actingEdition.id, actor.rows[0]!.id]
    );
    const person = await insertPerson(db.pool);
    await db.pool.query(`UPDATE person SET tmdb_id = 7001 WHERE id = $1`, [person.id]);
    const acting = await insertSelection(actor.rows[0]!.id, filmId, 5001, {
      id: person.id,
      tmdb_id: 7001
    });
    await own(alice, acting, DRAFTED);
    const nomination = await insertNomination(db.pool, {
      category_edition_id: actingEdition.id,
      film_id: filmId
    });

    const added = await send("post", `/admin/nominations/${nomination.id}/contributors`, {
      person_id: person.id
    });
    expect(added.status).toBe(201);
    expect((await ledger()).map((e) => [e.selection, e.kind])).toEqual([
      [acting, "NOMINATION"]
    ]);

    const contributorId = (added.body as { nomination_contributor_id: number })
      .nomination_contributor_id;
    const removed = await send(
      "delete",
      `/admin/nominations/${nomination.id}/contributors/${contributorId}`
    );
    expect(removed.status).toBe(200);
    expect(await ledger()).toEqual([]);
  });

  it("rebuilds on date writes; an undated occasion never scores", async () => {
    await own(alice, selectionId, DRAFTED);
    const nomination = await nominate(filmId);
    await send("post", "/admin/winners", {
      category_edition_id: editionId,
      nomination_ids: [nomination]
    });
    expect((await ledger()).map((e) => e.kind)).toEqual(["NOMINATION", "WIN"]);

    let res = await send("patch", `/admin/ceremonies/${ceremonyId}/dates`, {
      nominations_on: null
    });
    expect(res.status).toBe(200);
    expect((await ledger()).map((e) => e.kind)).toEqual(["WIN"]);

    res = await send("patch", `/admin/ceremonies/${ceremonyId}`, { starts_at: null });
    expect(res.status).toBe(200);
    expect(await ledger()).toEqual([]);

    await send("patch", `/admin/ceremonies/${ceremonyId}/dates`, {
      nominations_on: "2026-01-23"
    });
    await send("patch", `/admin/ceremonies/${ceremonyId}`, { starts_at: STARTS_AT });
    expect((await ledger()).map((e) => [e.kind, e.date])).toEqual([
      ["NOMINATION", "2026-01-23"],
      ["WIN", RESULTS_ON]
    ]);
  });

  it("rebuilds on mapping writes, scoring once with two mapped editions", async () => {
    await own(alice, selectionId, DRAFTED);
    await nominate(filmId);
    await nominate(filmId, secondEditionId);
    expect(await ledger()).toHaveLength(1);

    let res = await send(
      "put",
      `/admin/circuits/${circuitId}/mappings/${secondEditionId}?confirm=true`,
      {
        circuit_category_id: pictureId
      }
    );
    expect(res.status).toBe(200);
    expect(await ledger()).toEqual([
      {
        member: member(alice),
        selection: selectionId,
        kind: "NOMINATION",
        date: NOMINATIONS_ON,
        points: 1
      }
    ]);

    res = await send(
      "delete",
      `/admin/circuits/${circuitId}/mappings/${editionId}?confirm=true`
    );
    expect(res.status).toBe(204);
    expect(await ledger()).toHaveLength(1);
    res = await send(
      "delete",
      `/admin/circuits/${circuitId}/mappings/${secondEditionId}?confirm=true`
    );
    expect(res.status).toBe(204);
    expect(await ledger()).toEqual([]);
  });

  it("removes a ceremony's points when it leaves the Circuit", async () => {
    await own(alice, selectionId, DRAFTED);
    await nominate(filmId);
    expect(await ledger()).toHaveLength(1);
    const res = await send(
      "delete",
      `/admin/circuits/${circuitId}/ceremonies/${ceremonyId}?confirm=true`
    );
    expect(res.status).toBe(200);
    expect(await ledger()).toEqual([]);
  });

  it("rebuilds when a ceremony changes event", async () => {
    await own(alice, selectionId, DRAFTED);
    await nominate(filmId);
    expect(await ledger()).toHaveLength(1);

    // Grouping moves the ceremony into an event this league has not enabled.
    const created = await send("post", `/admin/circuits/${circuitId}/events`, {
      name: "Guild Awards",
      ceremony_ids: [ceremonyId]
    });
    expect(created.status).toBe(201);
    const groupId = (created.body as { event: { id: number } }).event.id;
    expect(await ledger()).toEqual([]);

    await db.pool.query(
      `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id, weight)
       VALUES ($1, $2, $3, 3)`,
      [circuitLeagueId, circuitId, groupId]
    );
    const position = (group_id: number | null) =>
      send("put", `/admin/circuits/${circuitId}/ceremonies/${ceremonyId}/position`, {
        group_id,
        index: 0
      });
    expect((await position(null)).status).toBe(200);
    expect(await ledger()).toEqual([]);
    expect((await position(groupId)).status).toBe(200);
    expect((await ledger()).map((e) => e.points)).toEqual([3]);

    // Deleting the group gives the ceremony a new event of its own, not enabled.
    const deleted = await send(
      "delete",
      `/admin/circuits/${circuitId}/events/${groupId}`
    );
    expect(deleted.status).toBe(200);
    expect(await ledger()).toEqual([]);
  });

  it("rebuilds on enabled-event writes; a disabled event never scores", async () => {
    await own(alice, selectionId, DRAFTED);
    await nominate(filmId);
    expect(await ledger()).toHaveLength(1);
    // Enabled events are edited only before initialisation.
    await db.pool.query(
      `UPDATE circuit_league SET status = 'SETUP', initialized_at = NULL WHERE id = $1`,
      [circuitLeagueId]
    );
    const viewer = { userId: alice.id, isSuperAdmin: false };
    await setCircuitLeagueEvents(db.pool, circuitLeagueId, viewer, []);
    expect(await ledger()).toEqual([]);
    await setCircuitLeagueEvents(db.pool, circuitLeagueId, viewer, [
      { circuit_event_id: eventId, weight: 2 }
    ]);
    expect((await ledger()).map((e) => e.points)).toEqual([2]);
  });

  it("multiplies base points by category and event weights", async () => {
    await db.pool.query(`UPDATE circuit_league SET win_bonus_points = 3 WHERE id = $1`, [
      circuitLeagueId
    ]);
    await db.pool.query(
      `UPDATE circuit_league_event SET weight = 2 WHERE circuit_league_id = $1`,
      [circuitLeagueId]
    );
    await db.pool.query(
      `INSERT INTO circuit_league_category
         (circuit_league_id, circuit_id, circuit_category_id, weight)
       VALUES ($1, $2, $3, 1.5)`,
      [circuitLeagueId, circuitId, pictureId]
    );
    await own(alice, selectionId, DRAFTED);
    const nomination = await nominate(filmId);
    await send("post", "/admin/winners", {
      category_edition_id: editionId,
      nomination_ids: [nomination]
    });
    // 1 × 1.5 × 2 for the nomination; 3 × 1.5 × 2 for the win.
    expect((await ledger()).map((e) => [e.kind, e.points])).toEqual([
      ["NOMINATION", 3],
      ["WIN", 9]
    ]);
  });

  it("rebuilds idempotently from the audit-logged admin action", async () => {
    await own(alice, selectionId, DRAFTED);
    await own(bob, otherSelectionId, DRAFTED);
    const nomination = await nominate(filmId);
    await nominate(otherFilmId);
    await send("post", "/admin/winners", {
      category_edition_id: editionId,
      nomination_ids: [nomination]
    });
    const before = await ledger();
    expect(before).toHaveLength(3);

    await db.pool.query(`DELETE FROM circuit_score_entry`);
    for (let i = 0; i < 2; i += 1) {
      const res = await send("post", `/admin/circuits/${circuitId}/scores/rebuild`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rebuild: { leagues: 1, occasions: 2, entries: 3 } });
      expect(await ledger()).toEqual(before);
    }
    const audit = await db.pool.query<{ action: string; target_id: string }>(
      `SELECT action, target_id::text FROM admin_audit_log
       WHERE action = 'rebuild_circuit_scores'`
    );
    expect(audit.rows).toEqual([
      { action: "rebuild_circuit_scores", target_id: String(circuitId) },
      { action: "rebuild_circuit_scores", target_id: String(circuitId) }
    ]);
  });

  it("refuses the admin rebuild to non-admins and for an unknown Circuit", async () => {
    const res = await send("post", `/admin/circuits/${circuitId + 999}/scores/rebuild`);
    expect(res.status).toBe(404);
    adminToken = signTestToken({ sub: String(alice.id), username: "alice" }, AUTH_SECRET);
    const forbidden = await send("post", `/admin/circuits/${circuitId}/scores/rebuild`);
    expect(forbidden.status).toBe(403);
  });

  it("scores data entered ahead of its day once the day begins", async () => {
    const future = "2099-01-21";
    await db.pool.query(`UPDATE ceremony SET nominations_on = $2::date WHERE id = $1`, [
      ceremonyId,
      future
    ]);
    await own(alice, selectionId, DRAFTED);
    await nominate(filmId);
    expect(await ledger()).toEqual([]);

    const results = await rebuildCircuitScoresForDay(
      db.pool,
      future,
      instantOfDay(future)
    );
    expect(results.map((r) => [r.kind, r.inserted])).toEqual([["NOMINATION", 1]]);
    expect((await ledger()).map((e) => [e.member, e.date])).toEqual([
      [member(alice), future]
    ]);
  });

  async function leagueStatus() {
    const { rows } = await db.pool.query<{ status: string }>(
      `SELECT status FROM circuit_league WHERE id = $1`,
      [circuitLeagueId]
    );
    return rows[0]!.status;
  }

  it("moves a season in play from IN_SEASON to COMPLETE when its winners are finalised", async () => {
    await own(alice, selectionId, DRAFTED);
    const nominationId = await nominate(filmId);
    expect(await leagueStatus()).toBe("IN_SEASON");

    const won = await send("post", "/admin/winners", {
      category_edition_id: editionId,
      nomination_ids: [nominationId]
    });
    expect(won.status).toBe(200);
    // Entering winners alone does not finish the season.
    expect(await leagueStatus()).toBe("IN_SEASON");

    const finalised = await send(
      "post",
      `/admin/ceremonies/${ceremonyId}/finalize-winners`
    );
    expect(finalised.status).toBe(200);
    expect(await leagueStatus()).toBe("COMPLETE");

    // A rebuild keeps it complete.
    const rebuilt = await send("post", `/admin/circuits/${circuitId}/scores/rebuild`);
    expect(rebuilt.status).toBe(200);
    expect(await leagueStatus()).toBe("COMPLETE");

    // A ceremony added later that has not finished moves the season back.
    const later = await insertCeremony(db.pool, {}, false);
    await db.pool.query(
      `UPDATE ceremony SET status = 'PUBLISHED', nominations_on = $2::date, starts_at = $3
       WHERE id = $1`,
      [later.id, NOMINATIONS_ON, STARTS_AT]
    );
    await db.pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, 1)`,
      [circuitId, later.id, eventId]
    );
    await send("post", `/admin/circuits/${circuitId}/scores/rebuild`);
    expect(await leagueStatus()).toBe("IN_SEASON");
  });

  describe("standings", () => {
    const as = (user: User) => ({
      Authorization: `Bearer ${signTestToken({ sub: String(user.id), username: user.username }, AUTH_SECRET)}`
    });

    afterEach(() => registerCircuitScoreEventEmitter(null));

    /** Alice scores 1; Bob scores 1 + 2 + 2 (see the split test above). */
    async function scoreSplit() {
      await own(alice, selectionId, DRAFTED, new Date("2026-02-01T18:00:00Z"));
      await own(bob, selectionId, new Date("2026-02-02T18:00:00Z"));
      await own(bob, otherSelectionId, DRAFTED);
      const nomination = await nominate(filmId);
      const other = await nominate(otherFilmId);
      const res = await send("post", "/admin/winners", {
        category_edition_id: editionId,
        nomination_ids: [nomination, other]
      });
      expect(res.status).toBe(200);
    }

    it("equal the ledger's sum, and list only ceremonies of enabled events", async () => {
      // A published ceremony of an event the league has not enabled.
      const guild = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
         VALUES ($1, 'guild', 'Guild Awards', 1) RETURNING id::int`,
        [circuitId]
      );
      const hidden = await insertCeremony(db.pool, { code: "guild" }, false);
      await db.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
        hidden.id
      ]);
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
         VALUES ($1, $2, $3, 0)`,
        [circuitId, hidden.id, guild.rows[0]!.id]
      );
      await scoreSplit();

      const res = await api
        .get(`/circuit-leagues/${circuitLeagueId}/standings`)
        .set(as(alice));
      expect(res.status).toBe(200);
      const body = res.body as {
        standings: Array<{
          rank: number;
          member: { user_id: number; username: string };
          points: number;
          nomination_points: number;
          win_points: number;
        }>;
        ceremonies: Array<{ id: number; points_awarded: number; results_on: string }>;
      };
      expect(
        body.standings.map((s) => [
          s.rank,
          s.member.username,
          s.points,
          s.nomination_points,
          s.win_points
        ])
      ).toEqual([
        [1, "bob", 5, 1, 4],
        [2, "alice", 1, 1, 0]
      ]);
      const entries = await listScoreEntries(db.pool, circuitLeagueId);
      for (const row of body.standings) {
        const memberId = memberIds.get(row.member.user_id)!;
        const sum = entries
          .filter((e) => e.member_id === memberId)
          .reduce((total, e) => total + e.points, 0);
        expect(row.points).toBe(sum);
      }
      expect(body.ceremonies).toEqual([
        expect.objectContaining({
          id: ceremonyId,
          points_awarded: 6,
          results_on: RESULTS_ON
        })
      ]);
    });

    it("rank tied members together and members without points on 0", async () => {
      await own(alice, selectionId, DRAFTED);
      const res = await api
        .get(`/circuit-leagues/${circuitLeagueId}/standings`)
        .set(as(bob));
      expect(
        (
          res.body as { standings: Array<{ rank: number; points: number }> }
        ).standings.map((s) => [s.rank, s.points])
      ).toEqual([
        [1, 0],
        [1, 0]
      ]);
    });

    it("break one ceremony down into each member's ledger rows", async () => {
      await scoreSplit();
      const res = await api
        .get(`/circuit-leagues/${circuitLeagueId}/standings/ceremonies/${ceremonyId}`)
        .set(as(alice));
      expect(res.status).toBe(200);
      const body = res.body as {
        ceremony: { id: number; event: { name: string }; nominations_on: string };
        standings: Array<{
          member: { username: string };
          points: number;
          entries: Array<{ selection: { id: number }; kind: string; points: number }>;
        }>;
      };
      expect(body.ceremony).toMatchObject({
        id: ceremonyId,
        event: { name: "Oscars" },
        nominations_on: NOMINATIONS_ON
      });
      expect(
        body.standings.map((s) => [
          s.member.username,
          s.points,
          s.entries.map((e) => [e.selection.id, e.kind, e.points])
        ])
      ).toEqual([
        [
          "bob",
          5,
          [
            [otherSelectionId, "NOMINATION", 1],
            [selectionId, "WIN", 2],
            [otherSelectionId, "WIN", 2]
          ]
        ],
        ["alice", 1, [[selectionId, "NOMINATION", 1]]]
      ]);
    });

    it("are hidden from non-members; draft and unknown ceremonies are not found", async () => {
      const outsider = await insertUser(db.pool, { username: "outsider" });
      const hidden = await api
        .get(`/circuit-leagues/${circuitLeagueId}/standings`)
        .set(as(outsider));
      expect(hidden.status).toBe(404);
      // A draft ceremony of the season is not shown to players.
      const draft = await insertCeremony(db.pool, { code: "draft" }, false);
      await db.pool.query(`UPDATE ceremony SET status = 'DRAFT' WHERE id = $1`, [
        draft.id
      ]);
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
         VALUES ($1, $2, $3, 1)`,
        [circuitId, draft.id, eventId]
      );
      for (const id of [draft.id, ceremonyId + 999]) {
        const res = await api
          .get(`/circuit-leagues/${circuitLeagueId}/standings/ceremonies/${id}`)
          .set(as(alice));
        expect(res.status).toBe(404);
      }
    });

    describe("points views", () => {
      type CeremonyLine = {
        ceremony_id: number;
        ceremony_name: string | null;
        nomination: number;
        win: number;
      };
      type Roster = {
        member: { user_id: number; username: string };
        entries: Array<{
          selection: { id: number };
          points: { total: number; by_ceremony: CeremonyLine[] };
        }>;
        points_total: number;
        dropped_points: number;
      };
      let heldId: number;
      let ceremonyName: string;

      /**
       * The split league: Alice scores the nomination of selection 1 and drops
       * it before the win, which Bob scores; Bob holds selection 2 throughout.
       * Alice also holds a pick that never scored.
       */
      beforeEach(async () => {
        heldId = await insertSelection(pictureId, (await insertFilm(db.pool)).id, 5003);
        await own(alice, heldId, DRAFTED);
        await scoreSplit();
        const { rows } = await db.pool.query<{ name: string }>(
          `SELECT name FROM ceremony WHERE id = $1`,
          [ceremonyId]
        );
        ceremonyName = rows[0]!.name;
      });

      async function ledgerTotal(user: User) {
        const entries = await listScoreEntries(db.pool, circuitLeagueId);
        return entries
          .filter((e) => e.member_id === member(user))
          .reduce((sum, e) => sum + Math.round(e.points * 100), 0);
      }

      it("give each roster pick the ledger points it scored for its holder, with dropped points apart", async () => {
        const mine = await api
          .get(`/circuit-leagues/${circuitLeagueId}/roster`)
          .set(as(alice));
        const bobs = await api
          .get(`/circuit-leagues/${circuitLeagueId}/members/${bob.id}/roster`)
          .set(as(alice));
        expect(mine.status).toBe(200);
        expect(bobs.status).toBe(200);
        const aliceRoster = mine.body as Roster;
        const bobRoster = bobs.body as Roster;

        expect(aliceRoster.entries.map((e) => [e.selection.id, e.points])).toEqual([
          [heldId, { total: 0, by_ceremony: [] }]
        ]);
        expect([aliceRoster.points_total, aliceRoster.dropped_points]).toEqual([1, 1]);
        expect(bobRoster.entries.map((e) => [e.selection.id, e.points])).toEqual([
          [
            otherSelectionId,
            {
              total: 3,
              by_ceremony: [
                {
                  ceremony_id: ceremonyId,
                  ceremony_name: ceremonyName,
                  nomination: 1,
                  win: 2
                }
              ]
            }
          ],
          [
            selectionId,
            {
              total: 2,
              by_ceremony: [
                {
                  ceremony_id: ceremonyId,
                  ceremony_name: ceremonyName,
                  nomination: 0,
                  win: 2
                }
              ]
            }
          ]
        ]);
        expect([bobRoster.points_total, bobRoster.dropped_points]).toEqual([5, 0]);

        const standings = (
          await api.get(`/circuit-leagues/${circuitLeagueId}/standings`).set(as(alice))
        ).body as { standings: Array<{ member: { user_id: number }; points: number }> };
        for (const [user, roster] of [
          [alice, aliceRoster],
          [bob, bobRoster]
        ] as const) {
          const pills = roster.entries.reduce(
            (sum, e) => sum + Math.round(e.points.total * 100),
            0
          );
          for (const e of roster.entries) {
            const lines = e.points.by_ceremony.reduce(
              (sum, c) => sum + Math.round((c.nomination + c.win) * 100),
              0
            );
            expect(lines).toBe(Math.round(e.points.total * 100));
          }
          const total = await ledgerTotal(user);
          expect(pills + Math.round(roster.dropped_points * 100)).toBe(total);
          expect(Math.round(roster.points_total * 100)).toBe(total);
          expect(
            standings.standings.find((s) => s.member.user_id === user.id)?.points
          ).toBe(roster.points_total);
        }
      });

      it("read every member's roster at once, as each roster reads alone", async () => {
        const res = await api
          .get(`/circuit-leagues/${circuitLeagueId}/rosters`)
          .set(as(bob));
        expect(res.status).toBe(200);
        const { rosters } = res.body as { rosters: Roster[] };
        expect(rosters.map((r) => r.member.username)).toEqual(["alice", "bob"]);
        for (const roster of rosters) {
          const alone = await api
            .get(
              `/circuit-leagues/${circuitLeagueId}/members/${roster.member.user_id}/roster`
            )
            .set(as(bob));
          expect(roster).toEqual(alone.body);
        }
        const outsider = await insertUser(db.pool, { username: "outsider" });
        const hidden = await api
          .get(`/circuit-leagues/${circuitLeagueId}/rosters`)
          .set(as(outsider));
        expect(hidden.status).toBe(404);
      });

      it("mark a ceremony's points for picks dropped since, and still count them", async () => {
        const res = await api
          .get(`/circuit-leagues/${circuitLeagueId}/standings/ceremonies/${ceremonyId}`)
          .set(as(alice));
        const body = res.body as {
          standings: Array<{
            member: { username: string };
            points: number;
            entries: Array<{
              selection: { id: number };
              kind: string;
              points: number;
              owned_now: boolean;
              dropped_at: string | null;
            }>;
          }>;
        };
        expect(
          body.standings.map((s) => [
            s.member.username,
            s.entries.map((e) => [e.selection.id, e.kind, e.owned_now])
          ])
        ).toEqual([
          [
            "bob",
            [
              [otherSelectionId, "NOMINATION", true],
              [selectionId, "WIN", true],
              [otherSelectionId, "WIN", true]
            ]
          ],
          ["alice", [[selectionId, "NOMINATION", false]]]
        ]);
        // The dropped pick says when it left; held picks carry no date.
        expect(
          body.standings.flatMap((s) => s.entries.map((e) => [e.owned_now, e.dropped_at]))
        ).toEqual([
          [true, null],
          [true, null],
          [true, null],
          [false, "2026-02-01T18:00:00.000Z"]
        ]);
        for (const s of body.standings) {
          const byKind = { NOMINATION: 0, WIN: 0 } as Record<string, number>;
          for (const e of s.entries) byKind[e.kind]! += Math.round(e.points * 100);
          expect(byKind.NOMINATION! + byKind.WIN!).toBe(Math.round(s.points * 100));
        }
      });

      it("list every scoring contender with its points per player, adding up to the standings", async () => {
        const res = await api
          .get(`/circuit-leagues/${circuitLeagueId}/standings/contenders`)
          .set(as(alice));
        expect(res.status).toBe(200);
        const body = res.body as {
          contenders: Array<{
            selection: { id: number };
            total: number;
            members: Array<{ user_id: number; username: string; points: number }>;
            lines: Array<{
              ceremony_id: number;
              ceremony_name: string | null;
              user_id: number;
              nomination: number;
              win: number;
            }>;
          }>;
        };
        expect(
          body.contenders.map((c) => [
            c.selection.id,
            c.total,
            c.members.map((m) => [m.username, m.points]),
            c.lines
          ])
        ).toEqual([
          [
            selectionId,
            3,
            [
              ["bob", 2],
              ["alice", 1]
            ],
            [
              {
                ceremony_id: ceremonyId,
                ceremony_name: ceremonyName,
                user_id: alice.id,
                nomination: 1,
                win: 0
              },
              {
                ceremony_id: ceremonyId,
                ceremony_name: ceremonyName,
                user_id: bob.id,
                nomination: 0,
                win: 2
              }
            ]
          ],
          [
            otherSelectionId,
            3,
            [["bob", 3]],
            [
              {
                ceremony_id: ceremonyId,
                ceremony_name: ceremonyName,
                user_id: bob.id,
                nomination: 1,
                win: 2
              }
            ]
          ]
        ]);
        const contenders = body.contenders.reduce(
          (sum, c) => sum + Math.round(c.total * 100),
          0
        );
        expect(contenders).toBe((await ledgerTotal(alice)) + (await ledgerTotal(bob)));
      });

      it("report who holds a contender in the season when the picker names it", async () => {
        const freeId = await insertSelection(
          pictureId,
          (await insertFilm(db.pool)).id,
          5004
        );
        const pick = (filmTmdbId: number, extra: Record<string, unknown> = {}) =>
          api
            .post("/contenders/selections")
            .set(as(alice))
            .set("content-type", "application/json")
            .send({ circuit_category_id: pictureId, film_tmdb_id: filmTmdbId, ...extra });

        const owned = await pick(5002, { circuit_league_id: circuitLeagueId });
        expect(owned.status).toBe(200);
        expect(owned.body).toMatchObject({
          selection: { id: otherSelectionId },
          owner: { user_id: bob.id, username: "bob" }
        });
        const free = await pick(5004, { circuit_league_id: circuitLeagueId });
        expect(free.body).toMatchObject({ selection: { id: freeId }, owner: null });
        const plain = await pick(5002);
        expect(plain.body).not.toHaveProperty("owner");
        const unknown = await pick(5002, { circuit_league_id: circuitLeagueId + 999 });
        expect(unknown.status).toBe(404);
      });
    });

    it("tell the league when a rebuild changes its rows, and only then", async () => {
      const heard: CircuitScoreUpdateMessage[] = [];
      registerCircuitScoreEventEmitter((message) => heard.push(message));
      await own(alice, selectionId, DRAFTED);

      await nominate(otherFilmId);
      expect(heard).toEqual([]);

      await nominate(filmId);
      expect(heard).toEqual([
        {
          circuit_league_id: circuitLeagueId,
          ceremony_ids: [ceremonyId],
          server_time: expect.any(String)
        }
      ]);
    });
  });
});
