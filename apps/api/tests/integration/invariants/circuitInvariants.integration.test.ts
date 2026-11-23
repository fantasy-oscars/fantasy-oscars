import { getSnakeSeatForPick } from "@fantasy-oscars/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listScoreEntries } from "../../../src/data/repositories/circuitScoreRepository.js";
import { instantOfDay, resultsDateOf } from "../../../src/domain/circuit.js";
import { createServer } from "../../../src/server.js";
import {
  startCircuitDraft,
  submitCircuitDraftPick,
  tickCircuitDraft
} from "../../../src/services/circuit/circuitDraft.js";
import {
  addCircuitFreeAgent,
  getCircuitRoster
} from "../../../src/services/circuit/circuitOwnership.js";
import {
  addToCircuitQueue,
  stageInCircuitQueue
} from "../../../src/services/circuit/circuitQueue.js";
import { rebuildCircuitScores } from "../../../src/services/circuit/circuitScoring.js";
import { runDueCircuitWaivers } from "../../../src/services/circuit/circuitWaiverScheduler.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertPerson,
  insertUser
} from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";

// Invariants of plan section 8 that no single package owns. Draft picks and
// ownership changes take the database clock, so each test runs them now and
// places the ceremony dates around that moment; the scoring, waiver and free
// agency services then take an injected `now` for the days that follow.

const AUTH_SECRET = "test-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let adminToken: string;

type User = { id: number; username: string };
type Ceremony = { id: number; editionId: number };

/** `day` (YYYY-MM-DD) moved by `days` calendar days. */
function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 18:00 Pacific on `day`: a ceremony start whose results date is `day`. */
const eveningOf = (day: string) => new Date(instantOfDay(day).getTime() + 18 * 3600_000);

const viewer = (user: User) => ({ userId: user.id, isSuperAdmin: false });

async function send(method: "post" | "patch", path: string, body: object) {
  return api[method](path)
    .set({ Authorization: `Bearer ${adminToken}` })
    .set("content-type", "application/json")
    .send(body);
}

describe("circuit invariants across packages", () => {
  let alice: User;
  let bob: User;
  let circuitId: number;
  let pictureId: number;
  let critics: Ceremony;
  let oscars: Ceremony;
  let films: number[];
  let selections: number[];

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
    const admin = await insertUser(db.pool, { username: "admin" });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [admin.id]);
    adminToken = signTestToken({ sub: String(admin.id), username: "admin" }, AUTH_SECRET);
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });

    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    circuitId = circuit.rows[0]!.id;
    pictureId = await insertCategory("picture", "FILM", 0);
    const family = await insertCategoryFamily(db.pool);
    critics = await insertCircuitCeremony("critics", 0, family.id);
    oscars = await insertCircuitCeremony("oscars", 1, family.id);

    films = [];
    selections = [];
    for (let i = 0; i < 3; i += 1) {
      const film = (await insertFilm(db.pool)).id;
      await db.pool.query(`UPDATE film SET tmdb_id = $2 WHERE id = $1`, [film, 7000 + i]);
      films.push(film);
      selections.push(await insertSelection(pictureId, film));
    }
  });

  async function insertCategory(code: string, kind: "FILM" | "ACTING", index: number) {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, $2, $2, $3, $4) RETURNING id::int`,
      [circuitId, code, kind, index]
    );
    return rows[0]!.id;
  }

  /** A published ceremony in its own event, its one edition mapped to Picture. */
  async function insertCircuitCeremony(code: string, index: number, familyId: number) {
    const event = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
       VALUES ($1, $2, $2, $3) RETURNING id::int`,
      [circuitId, code, index]
    );
    const ceremony = await insertCeremony(db.pool, {}, false);
    await db.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
      ceremony.id
    ]);
    await db.pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, $4)`,
      [circuitId, ceremony.id, event.rows[0]!.id, index]
    );
    const edition = await insertCategoryEdition(db.pool, {
      ceremony_id: ceremony.id,
      family_id: familyId,
      code: `${code}-picture`
    });
    await db.pool.query(
      `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
       VALUES ($1, $2, $3)`,
      [circuitId, edition.id, pictureId]
    );
    return { id: ceremony.id, editionId: edition.id };
  }

  async function insertSelection(
    categoryId: number,
    film: number,
    person: { id: number; tmdb_id: number } | null = null
  ) {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_selection
         (circuit_category_id, film_tmdb_id, film_id, person_tmdb_id, person_id)
       SELECT $1, f.tmdb_id, f.id, $3::int, $4::bigint FROM film f WHERE f.id = $2
       RETURNING id::int`,
      [categoryId, film, person?.tmdb_id ?? null, person?.id ?? null]
    );
    return rows[0]!.id;
  }

  async function setDates(ceremony: Ceremony, nominationsOn: string, startsAt: Date) {
    await db.pool.query(
      `UPDATE ceremony SET nominations_on = $2::date, starts_at = $3 WHERE id = $1`,
      [ceremony.id, nominationsOn, startsAt]
    );
  }

  /**
   * An initialised competition of a fresh Season league for alice (owner) and
   * bob, with every event and category of the Circuit enabled.
   */
  async function createCircuitLeague(rosterSize: number) {
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    for (const user of [alice, bob]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_league
         (circuit_id, league_id, status, roster_size, initialized_at, created_by_user_id)
       VALUES ($1, $2, 'INITIALIZED', $3, now(), $4) RETURNING id::int`,
      [circuitId, league.id, rosterSize, alice.id]
    );
    const id = rows[0]!.id;
    await db.pool.query(
      `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
       SELECT $1, circuit_id, id FROM circuit_event WHERE circuit_id = $2`,
      [id, circuitId]
    );
    await db.pool.query(
      `INSERT INTO circuit_league_category (circuit_league_id, circuit_id, circuit_category_id)
       SELECT $1, circuit_id, id FROM circuit_category WHERE circuit_id = $2`,
      [id, circuitId]
    );
    const members = new Map<number, number>();
    for (const user of [alice, bob]) {
      const member = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id)
         VALUES ($1, $2) RETURNING id::int`,
        [id, user.id]
      );
      members.set(user.id, member.rows[0]!.id);
    }
    return { id, members };
  }

  /** Starts the league's draft and makes `picks` in snake order, by hand. */
  async function draft(circuitLeagueId: number, picks: number[]) {
    const started = await startCircuitDraft(db.pool, circuitLeagueId, viewer(alice), {
      random: () => 0
    });
    const users = new Map([alice, bob].map((u) => [u.id, u]));
    const onTheClock = (pickNumber: number) => {
      const seat = getSnakeSeatForPick(started.seats.length, pickNumber);
      return users.get(started.seats.find((s) => s.seat_number === seat)!.user_id)!;
    };
    const owners = new Map<number, User>();
    for (const [i, selectionId] of picks.entries()) {
      const user = onTheClock(i + 1);
      await submitCircuitDraftPick(db.pool, started.draft.id, viewer(user), {
        selectionId,
        requestId: `pick-${i + 1}`
      });
      owners.set(selectionId, user);
    }
    return { draftId: started.draft.id, onTheClock, owners };
  }

  /** The Pacific day on which the league's draft made its first pick. */
  async function draftDay(circuitLeagueId: number) {
    const { rows } = await db.pool.query<{ at: Date }>(
      `SELECT MIN(acquired_at) AS at FROM circuit_ownership WHERE circuit_league_id = $1`,
      [circuitLeagueId]
    );
    return resultsDateOf(rows[0]!.at)!;
  }

  async function nominate(ceremony: Ceremony, film: number) {
    const res = await send("post", `/admin/ceremonies/${ceremony.id}/nominations`, {
      category_edition_id: ceremony.editionId,
      film_id: film
    });
    expect(res.status).toBe(201);
    return (res.body as { nomination_id: number }).nomination_id;
  }

  async function enterWinner(ceremony: Ceremony, nominationId: number) {
    const res = await send("post", "/admin/winners", {
      category_edition_id: ceremony.editionId,
      nomination_ids: [nominationId]
    });
    expect(res.status).toBe(200);
  }

  async function ledger(circuitLeagueId: number) {
    return (await listScoreEntries(db.pool, circuitLeagueId)).map((e) => ({
      member: e.member_id,
      selection: e.selection_id,
      kind: e.kind,
      date: e.occasion_date,
      points: e.points
    }));
  }

  const openIntervals = async (circuitLeagueId: number) =>
    (
      await db.pool.query<{ member_id: number; selection_id: number }>(
        `SELECT member_id::int, selection_id::int FROM circuit_ownership
         WHERE circuit_league_id = $1 AND released_at IS NULL
         ORDER BY selection_id`,
        [circuitLeagueId]
      )
    ).rows;

  it("winner entry never touches the Circuit draft, its queue or its chips", async () => {
    // One league mid-draft, with a queue and a staged selection waiting; one
    // league whose draft ended with a missed supplemental pick and its chip.
    const running = await createCircuitLeague(2);
    const live = await draft(running.id, [selections[0]!]);
    const next = live.onTheClock(2);
    await addToCircuitQueue(db.pool, running.id, viewer(next), selections[1]!);
    await stageInCircuitQueue(db.pool, running.id, viewer(next), selections[2]!);

    const finished = await createCircuitLeague(1);
    const done = await draft(finished.id, [selections[0]!]);
    const later = Date.now() + 3600_000;
    await tickCircuitDraft(db.pool, done.draftId, new Date(later));
    await tickCircuitDraft(db.pool, done.draftId, new Date(later + 3600_000));

    const tables = [
      "circuit_draft",
      "circuit_draft_seat",
      "circuit_draft_pick",
      "circuit_draft_event",
      "circuit_queue_item",
      "circuit_staged_item",
      "circuit_chip",
      "circuit_ownership",
      "circuit_transaction",
      "circuit_league",
      "circuit_league_member"
    ];
    const snapshot = async () => {
      const out: Record<string, string[]> = {};
      for (const table of tables) {
        const { rows } = await db.pool.query<{ row: string }>(
          `SELECT to_jsonb(t)::text AS row FROM ${table} t`
        );
        out[table] = rows.map((r) => r.row).sort();
      }
      return out;
    };
    const before = await snapshot();
    expect(before.circuit_queue_item).toHaveLength(1);
    expect(before.circuit_staged_item).toHaveLength(1);
    expect(before.circuit_chip).toHaveLength(1);
    const statuses = await db.pool.query<{ status: string }>(
      `SELECT status FROM circuit_draft ORDER BY id`
    );
    expect(statuses.rows.map((r) => r.status)).toEqual(["IN_PROGRESS", "COMPLETED"]);

    for (const ceremony of [critics, oscars]) {
      const won = await nominate(ceremony, films[0]!);
      await nominate(ceremony, films[1]!);
      await enterWinner(ceremony, won);
    }

    const locked = await db.pool.query<{ status: string }>(
      `SELECT status FROM ceremony WHERE id = ANY($1::int[]) ORDER BY id`,
      [[critics.id, oscars.id]]
    );
    expect(locked.rows.map((r) => r.status)).toEqual(["LOCKED", "LOCKED"]);
    expect(await snapshot()).toEqual(before);
  });

  it("ownership persists past its last occasion and holds roster space until dropped", async () => {
    const league = await createCircuitLeague(1);
    const { owners } = await draft(league.id, [selections[0]!, selections[1]!]);
    const owner = owners.get(selections[0]!)!;
    const day = await draftDay(league.id);
    // Film 0's only occasions are the critics' nominations and win; the
    // Circuit goes on to the Oscars, where it is not nominated.
    await setDates(critics, addDays(day, 3), eveningOf(addDays(day, 5)));
    await setDates(oscars, addDays(day, 20), eveningOf(addDays(day, 30)));
    await enterWinner(critics, await nominate(critics, films[0]!));
    await nominate(oscars, films[1]!);

    const afterSeason = instantOfDay(addDays(day, 40));
    const runs = await runDueCircuitWaivers(db.pool, afterSeason);
    expect(runs.filter((r) => r.circuit_league_id === league.id).length).toBeGreaterThan(
      0
    );
    await rebuildCircuitScores(db.pool, { circuitLeagueId: league.id }, afterSeason);

    expect(await openIntervals(league.id)).toEqual([
      { member_id: league.members.get(owner.id), selection_id: selections[0] },
      {
        member_id: league.members.get(owners.get(selections[1]!)!.id),
        selection_id: selections[1]
      }
    ]);
    const roster = await getCircuitRoster(
      db.pool,
      league.id,
      viewer(owner),
      owner.id,
      afterSeason
    );
    expect(roster.free_agency.open).toBe(true);
    expect(roster.entries.map((e) => e.selection.id)).toEqual([selections[0]]);
    const criticsPoints = [
      {
        member: league.members.get(owner.id),
        selection: selections[0],
        kind: "NOMINATION",
        date: addDays(day, 3),
        points: 1
      },
      {
        member: league.members.get(owner.id),
        selection: selections[0],
        kind: "WIN",
        date: addDays(day, 5),
        points: 2
      }
    ];
    expect(
      (await ledger(league.id)).filter((e) => e.selection === selections[0])
    ).toEqual(criticsPoints);

    // The roster is still full: an add needs a drop, and the drop frees it.
    await expect(
      addCircuitFreeAgent(
        db.pool,
        league.id,
        viewer(owner),
        { selectionId: selections[2]!, dropSelectionId: null },
        afterSeason
      )
    ).rejects.toMatchObject({ code: "CIRCUIT_ROSTER_FULL" });
    await addCircuitFreeAgent(
      db.pool,
      league.id,
      viewer(owner),
      { selectionId: selections[2]!, dropSelectionId: selections[0]! },
      afterSeason
    );
    // The drop closed the interval; the transaction is the only way it closes.
    expect((await openIntervals(league.id)).map((i) => i.selection_id)).toEqual([
      selections[1],
      selections[2]
    ]);
    const closed = await db.pool.query<{ kind: string }>(
      `SELECT t.kind FROM circuit_ownership o
       JOIN circuit_transaction t ON t.id = o.released_transaction_id
       WHERE o.circuit_league_id = $1 AND o.selection_id = $2`,
      [league.id, selections[0]]
    );
    expect(closed.rows).toEqual([{ kind: "FREE_AGENT" }]);
  });

  it("a league that starts late scores nothing retroactively, then scores what follows", async () => {
    // The late league drafts now. The critics' occasions are long past, the
    // Oscars nominations fall on its draft day and the Oscars win ten days on.
    const late = await createCircuitLeague(1);
    const { owners } = await draft(late.id, [selections[0]!, selections[1]!]);
    const lateOwner = late.members.get(owners.get(selections[0]!)!.id);
    const day = await draftDay(late.id);
    await setDates(critics, "2026-01-05", eveningOf("2026-01-11"));
    await setDates(oscars, day, eveningOf(addDays(day, 10)));

    // The early league has held film 0 since December 2025.
    const early = await createCircuitLeague(1);
    const earlyOwner = early.members.get(alice.id)!;
    const since = new Date("2025-12-04T03:00:00Z");
    await db.pool.query(`UPDATE circuit_league SET status = 'IN_SEASON' WHERE id = $1`, [
      early.id
    ]);
    const add = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_transaction
         (circuit_league_id, member_id, kind, add_selection_id, occurred_at)
       VALUES ($1, $2, 'FREE_AGENT', $3, $4) RETURNING id::int`,
      [early.id, earlyOwner, selections[0], since]
    );
    await db.pool.query(
      `INSERT INTO circuit_ownership
         (circuit_league_id, member_id, selection_id, acquired_at, acquired_transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [early.id, earlyOwner, selections[0], since, add.rows[0]!.id]
    );

    for (const ceremony of [critics, oscars]) {
      await enterWinner(ceremony, await nominate(ceremony, films[0]!));
    }

    const entry = (
      member: number | undefined,
      kind: string,
      date: string,
      points: number
    ) => ({
      member,
      selection: selections[0],
      kind,
      date,
      points
    });
    expect(await ledger(early.id)).toEqual([
      entry(earlyOwner, "NOMINATION", "2026-01-05", 1),
      entry(earlyOwner, "WIN", "2026-01-11", 2),
      entry(earlyOwner, "NOMINATION", day, 1)
    ]);
    expect(await ledger(late.id)).toEqual([]);

    // Once the Oscars win's day begins, both leagues score it, and a full
    // rebuild still gives the late league nothing from before its draft.
    const afterWin = instantOfDay(addDays(day, 11));
    await rebuildCircuitScores(db.pool, { circuitId }, afterWin);
    expect(await ledger(early.id)).toEqual([
      entry(earlyOwner, "NOMINATION", "2026-01-05", 1),
      entry(earlyOwner, "WIN", "2026-01-11", 2),
      entry(earlyOwner, "NOMINATION", day, 1),
      entry(earlyOwner, "WIN", addDays(day, 10), 2)
    ]);
    expect(await ledger(late.id)).toEqual([entry(lateOwner, "WIN", addDays(day, 10), 2)]);
  });

  it("drafts one film in several categories and several people from it in one acting category", async () => {
    const directorId = await insertCategory("director", "FILM", 1);
    const actorId = await insertCategory("actor", "ACTING", 2);
    const film = films[0]!;
    const people = [];
    for (const tmdbId of [9001, 9002]) {
      const person = await insertPerson(db.pool);
      await db.pool.query(`UPDATE person SET tmdb_id = $2 WHERE id = $1`, [
        person.id,
        tmdbId
      ]);
      people.push({ id: person.id, tmdb_id: tmdbId });
    }
    const ofOneFilm = [
      selections[0]!,
      await insertSelection(directorId, film),
      await insertSelection(actorId, film, people[0]!),
      await insertSelection(actorId, film, people[1]!)
    ];

    const league = await createCircuitLeague(2);
    const { owners } = await draft(league.id, ofOneFilm);

    const status = await db.pool.query<{ status: string }>(
      `SELECT status FROM circuit_league WHERE id = $1`,
      [league.id]
    );
    expect(status.rows[0]!.status).toBe("IN_SEASON");
    expect(await openIntervals(league.id)).toEqual(
      ofOneFilm.map((selection) => ({
        member_id: league.members.get(owners.get(selection)!.id),
        selection_id: selection
      }))
    );
    const drafted = await db.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM circuit_transaction
       WHERE circuit_league_id = $1 AND kind = 'DRAFT'`,
      [league.id]
    );
    expect(drafted.rows[0]!.n).toBe(4);
  });
});
