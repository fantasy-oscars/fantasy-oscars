import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  dropCircuitSelection,
  getCircuitRoster
} from "../../../src/services/circuit/circuitOwnership.js";
import { addToCircuitQueue } from "../../../src/services/circuit/circuitQueue.js";
import { rebuildCircuitScores } from "../../../src/services/circuit/circuitScoring.js";
import { getCircuitStandings } from "../../../src/services/circuit/circuitStandings.js";
import { runDueCircuitWaivers } from "../../../src/services/circuit/circuitWaiverScheduler.js";
import { createCircuitWaiverClaim } from "../../../src/services/circuit/circuitWaivers.js";
import { startTestDatabase } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertUser
} from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";
import { installSimulatedClock } from "../../support/simulatedClock.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";

// One season of a Circuit, end to end, on a simulated clock: two leagues with
// different enabled events draft, score Critics Choice nominations, run their
// waiver windows, trade a contender mid-season, absorb a date correction and
// finish with standings checked against totals worked out by hand below.
//
// Every write goes through the services and admin routes at the simulated
// instant; nothing waits in real time. The season runs in 2040-41 so the
// real date never reaches it.

const AUTH_SECRET = "test-secret";

const DRAFT_DAY = "2040-12-01";
const CRITICS_NOMINATIONS = "2040-12-10";
const CRITICS_WIN = "2041-01-08";
const GUILD_NOMINATIONS_AS_ENTERED = "2041-01-15";
const GUILD_NOMINATIONS = "2041-01-22";
const OSCARS_NOMINATIONS = "2041-01-24";
const GUILD_WIN = "2041-02-20";
const OSCARS_WIN = "2041-03-03";

/** `hours` and `minutes` past 00:00 Pacific on `day`. */
const at = (day: string, hours: number, minutes = 0) =>
  new Date(instantOfDay(day).getTime() + (hours * 60 + minutes) * 60_000);

type User = { id: number; username: string };
type Ceremony = { id: number; editionId: number; eventId: number };
type League = { id: number; members: Map<number, number> };

describe("a simulated Circuit season", () => {
  let db: Awaited<ReturnType<typeof startTestDatabase>>;
  let clock: Awaited<ReturnType<typeof installSimulatedClock>>;
  let api: ApiAgent;
  let admin: User;

  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
    process.env.AUTH_SECRET = AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    api = createApiAgent(createServer({ db: db.pool }));
    clock = await installSimulatedClock(db.pool);
  }, 120_000);

  afterAll(async () => {
    if (clock) await clock.restore();
    if (db) await db.stop();
  });

  const viewer = (user: User) => ({ userId: user.id, isSuperAdmin: false });

  /** An admin request, with a token signed at the simulated instant. */
  async function send(method: "post" | "patch", path: string, body: object) {
    const token = signTestToken(
      { sub: String(admin.id), username: admin.username },
      AUTH_SECRET
    );
    return api[method](path)
      .set({ Authorization: `Bearer ${token}` })
      .set("content-type", "application/json")
      .send(body);
  }

  it("drafts, claims, trades, corrects a date and finishes on the hand-computed standings", async () => {
    const pool = db.pool;
    await clock.set(at("2040-11-20", 12));

    // --- The Circuit: one Picture category and three events, each one ceremony.
    admin = await insertUser(pool, { username: "admin" });
    await pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [admin.id]);
    const [alice, bob, carol, dave, erin] = await Promise.all(
      ["alice", "bob", "carol", "dave", "erin"].map((username) =>
        insertUser(pool, { username })
      )
    );
    const circuit = await pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    const circuitId = circuit.rows[0]!.id;
    const category = await pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [circuitId]
    );
    const pictureId = category.rows[0]!.id;
    const family = await insertCategoryFamily(pool);

    async function insertCircuitCeremony(code: string, index: number) {
      const event = await pool.query<{ id: number }>(
        `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
         VALUES ($1, $2, $2, $3) RETURNING id::int`,
        [circuitId, code, index]
      );
      const ceremony = await insertCeremony(pool, {}, false);
      await pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
        ceremony.id
      ]);
      await pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
         VALUES ($1, $2, $3, $4)`,
        [circuitId, ceremony.id, event.rows[0]!.id, index]
      );
      const edition = await insertCategoryEdition(pool, {
        ceremony_id: ceremony.id,
        family_id: family.id,
        code: `${code}-picture`
      });
      await pool.query(
        `INSERT INTO circuit_mapping (circuit_id, category_edition_id, circuit_category_id)
         VALUES ($1, $2, $3)`,
        [circuitId, edition.id, pictureId]
      );
      return { id: ceremony.id, editionId: edition.id, eventId: event.rows[0]!.id };
    }

    async function setDates(
      ceremony: Ceremony,
      nominationsOn: string,
      resultsOn: string
    ) {
      await pool.query(
        `UPDATE ceremony SET nominations_on = $2::date, starts_at = $3 WHERE id = $1`,
        [ceremony.id, nominationsOn, at(resultsOn, 18)]
      );
    }

    const critics = await insertCircuitCeremony("critics", 0);
    const guild = await insertCircuitCeremony("guild", 1);
    const oscars = await insertCircuitCeremony("oscars", 2);
    await setDates(critics, CRITICS_NOMINATIONS, CRITICS_WIN);
    await setDates(guild, GUILD_NOMINATIONS_AS_ENTERED, GUILD_WIN);
    await setDates(oscars, OSCARS_NOMINATIONS, OSCARS_WIN);

    // Films P1..P9, each one Picture selection.
    const films: number[] = [];
    const P: number[] = [];
    const label = new Map<number, string>();
    for (let i = 1; i <= 9; i += 1) {
      const film = (await insertFilm(pool)).id;
      await pool.query(`UPDATE film SET tmdb_id = $2 WHERE id = $1`, [film, 8000 + i]);
      const selection = await pool.query<{ id: number }>(
        `INSERT INTO circuit_selection (circuit_category_id, film_tmdb_id, film_id)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [pictureId, 8000 + i, film]
      );
      films[i] = film;
      P[i] = selection.rows[0]!.id;
      label.set(P[i]!, `P${i}`);
    }

    /**
     * An initialised competition of a fresh Season league owned by the first
     * user. `disabled` events stay off; `weights` set event weights.
     */
    async function createCircuitLeague(
      users: User[],
      rosterSize: number,
      opts: { disabled?: Ceremony[]; weights?: [Ceremony, number][] } = {}
    ): Promise<League> {
      const league = await insertLeague(pool, { created_by_user_id: users[0]!.id });
      for (const user of users) {
        await insertLeagueMember(pool, { league_id: league.id, user_id: user.id });
      }
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO circuit_league
           (circuit_id, league_id, status, roster_size, initialized_at, created_by_user_id)
         VALUES ($1, $2, 'INITIALIZED', $3, now(), $4) RETURNING id::int`,
        [circuitId, league.id, rosterSize, users[0]!.id]
      );
      const id = rows[0]!.id;
      const disabled = (opts.disabled ?? []).map((c) => c.eventId);
      await pool.query(
        `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
         SELECT $1, circuit_id, id FROM circuit_event
         WHERE circuit_id = $2 AND NOT (id = ANY($3::bigint[]))`,
        [id, circuitId, disabled]
      );
      for (const [ceremony, weight] of opts.weights ?? []) {
        await pool.query(
          `UPDATE circuit_league_event SET weight = $3
           WHERE circuit_league_id = $1 AND circuit_event_id = $2`,
          [id, ceremony.eventId, weight]
        );
      }
      await pool.query(
        `INSERT INTO circuit_league_category (circuit_league_id, circuit_id, circuit_category_id)
         VALUES ($1, $2, $3)`,
        [id, circuitId, pictureId]
      );
      const members = new Map<number, number>();
      for (const user of users) {
        const member = await pool.query<{ id: number }>(
          `INSERT INTO circuit_league_member (circuit_league_id, user_id)
           VALUES ($1, $2) RETURNING id::int`,
          [id, user.id]
        );
        members.set(user.id, member.rows[0]!.id);
      }
      return { id, members };
    }

    /** Starts the draft; returns the users by seat number (index 0 is unused). */
    async function startDraft(league: League, owner: User, users: User[]) {
      const started = await startCircuitDraft(pool, league.id, viewer(owner), {
        random: () => 0
      });
      const bySeat: User[] = [];
      for (const seat of started.seats) {
        bySeat[seat.seat_number] = users.find((u) => u.id === seat.user_id)!;
      }
      return { draftId: started.draft.id, bySeat };
    }

    let requests = 0;
    async function pick(draftId: number, user: User, selectionId: number) {
      requests += 1;
      await submitCircuitDraftPick(pool, draftId, viewer(user), {
        selectionId,
        requestId: `pick-${requests}`
      });
    }

    /** Lets the pick clock run out, then lets the sweeper's tick resolve it. */
    async function timeOut(draftId: number) {
      await clock.advance(91_000);
      expect(await tickCircuitDraft(pool, draftId)).not.toBeNull();
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

    const userOfMember = new Map<number, string>();
    const remember = (league: League, users: User[]) => {
      for (const user of users) {
        userOfMember.set(league.members.get(user.id)!, user.username);
      }
    };

    /** The ledger as [user, selection, kind, date, points], in a stable order. */
    async function ledger(league: League) {
      return (await listScoreEntries(pool, league.id))
        .map((e) => [
          userOfMember.get(e.member_id)!,
          label.get(e.selection_id)!,
          e.kind,
          e.occasion_date,
          e.points
        ])
        .sort((a, b) =>
          `${String(a[3])} ${String(a[2])} ${String(a[1])}`.localeCompare(
            `${String(b[3])} ${String(b[2])} ${String(b[1])}`
          )
        );
    }

    /** Each member's open selections, by username. */
    async function rosters(league: League) {
      const { rows } = await pool.query<{ member_id: number; selection_id: number }>(
        `SELECT member_id::int, selection_id::int FROM circuit_ownership
         WHERE circuit_league_id = $1 AND released_at IS NULL
         ORDER BY selection_id`,
        [league.id]
      );
      const out: Record<string, string[]> = {};
      for (const r of rows) {
        const user = userOfMember.get(r.member_id)!;
        (out[user] ??= []).push(label.get(r.selection_id)!);
      }
      return out;
    }

    async function priorities(league: League) {
      const { rows } = await pool.query<{ member_id: number }>(
        `SELECT id::int AS member_id FROM circuit_league_member
         WHERE circuit_league_id = $1 ORDER BY waiver_priority`,
        [league.id]
      );
      return rows.map((r) => userOfMember.get(r.member_id));
    }

    const freeAgencyAt = async (league: League, user: User, instant: Date) =>
      (await getCircuitRoster(pool, league.id, viewer(user), user.id, instant))
        .free_agency;

    // --- Two leagues. League A enables every event; League B leaves the
    // Guild out and weighs the Oscars double.
    const usersA = [alice, bob, carol];
    const usersB = [dave, erin];
    const leagueA = await createCircuitLeague(usersA, 2);
    const leagueB = await createCircuitLeague(usersB, 2, {
      disabled: [guild],
      weights: [[oscars, 2]]
    });
    remember(leagueA, usersA);
    remember(leagueB, usersB);

    // --- Draft day. League A: three seats, two rounds, 90-second clock.
    await clock.set(at(DRAFT_DAY, 18));
    const draftA = await startDraft(leagueA, alice, usersA);
    const [, s1, s2, s3] = draftA.bySeat as [never, User, User, User];
    await addToCircuitQueue(pool, leagueA.id, viewer(s2), P[1]!);
    await addToCircuitQueue(pool, leagueA.id, viewer(s2), P[2]!);

    await clock.advance(20_000);
    await pick(draftA.draftId, s1, P[1]!); // pick 1
    await timeOut(draftA.draftId); // pick 2: P1 is gone, so the queue gives P2
    await timeOut(draftA.draftId); // pick 3: an empty queue, so it is missed
    await clock.advance(30_000);
    await pick(draftA.draftId, s3, P[3]!); // pick 4
    await timeOut(draftA.draftId); // pick 5: everything queued is owned: missed
    await clock.advance(10_000);
    await pick(draftA.draftId, s1, P[4]!); // pick 6
    await clock.advance(15_000);
    await pick(draftA.draftId, s3, P[5]!); // supplemental for pick 3
    await timeOut(draftA.draftId); // supplemental for pick 5, missed again: a chip

    const picks = await pool.query<{
      pick_number: number;
      original_pick_number: number;
      member_id: number;
      outcome: string;
      source: string;
      selection_id: number | null;
    }>(
      `SELECT pick_number, original_pick_number, member_id::int, outcome, source,
              selection_id::int
       FROM circuit_draft_pick WHERE draft_id = $1 ORDER BY pick_number`,
      [draftA.draftId]
    );
    expect(
      picks.rows.map((p) => [
        p.pick_number,
        p.original_pick_number,
        userOfMember.get(p.member_id),
        p.outcome,
        p.source,
        p.selection_id === null ? null : label.get(p.selection_id)
      ])
    ).toEqual([
      [1, 1, s1.username, "PICKED", "MANUAL", "P1"],
      [2, 2, s2.username, "PICKED", "AUTO", "P2"],
      [3, 3, s3.username, "MISSED", "AUTO", null],
      [4, 4, s3.username, "PICKED", "MANUAL", "P3"],
      [5, 5, s2.username, "MISSED", "AUTO", null],
      [6, 6, s1.username, "PICKED", "MANUAL", "P4"],
      [7, 3, s3.username, "PICKED", "MANUAL", "P5"],
      [8, 5, s2.username, "MISSED", "AUTO", null]
    ]);
    const chips = await pool.query<{ id: number; member_id: number; value: number }>(
      `SELECT id::int, member_id::int, original_pick_number AS value
       FROM circuit_chip WHERE circuit_league_id = $1`,
      [leagueA.id]
    );
    expect(chips.rows.map((c) => [userOfMember.get(c.member_id), c.value])).toEqual([
      [s2.username, 5]
    ]);
    const chipId = chips.rows[0]!.id;
    expect(await priorities(leagueA)).toEqual([s3.username, s2.username, s1.username]);

    // League B: two seats, all four picks by hand.
    await clock.set(at(DRAFT_DAY, 20));
    const draftB = await startDraft(leagueB, dave, usersB);
    const [, t1, t2] = draftB.bySeat as [never, User, User];
    await clock.advance(5_000);
    await pick(draftB.draftId, t1, P[1]!);
    await pick(draftB.draftId, t2, P[3]!);
    await pick(draftB.draftId, t2, P[2]!);
    await pick(draftB.draftId, t1, P[6]!);

    const statuses = await pool.query<{ status: string }>(
      `SELECT status FROM circuit_league WHERE id = ANY($1::int[]) ORDER BY id`,
      [[leagueA.id, leagueB.id]]
    );
    expect(statuses.rows.map((r) => r.status)).toEqual(["IN_SEASON", "IN_SEASON"]);
    expect(await rosters(leagueA)).toEqual({
      [s1.username]: ["P1", "P4"],
      [s2.username]: ["P2"],
      [s3.username]: ["P3", "P5"]
    });

    // --- Critics Choice nominations, entered on the morning they are announced.
    await clock.set(at(CRITICS_NOMINATIONS, 9));
    const criticsNominations = new Map<number, number>();
    for (const i of [1, 2, 3, 4, 6, 7]) {
      criticsNominations.set(i, await nominate(critics, films[i]!));
    }
    const criticsNominationRows = (league: "A" | "B") =>
      league === "A"
        ? [
            [s1.username, "P1", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [s2.username, "P2", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [s3.username, "P3", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [s1.username, "P4", "NOMINATION", CRITICS_NOMINATIONS, 1]
          ]
        : [
            [t1.username, "P1", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [t2.username, "P2", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [t2.username, "P3", "NOMINATION", CRITICS_NOMINATIONS, 1],
            [t1.username, "P6", "NOMINATION", CRITICS_NOMINATIONS, 1]
          ];
    expect(await ledger(leagueA)).toEqual(criticsNominationRows("A"));
    expect(await ledger(leagueB)).toEqual(criticsNominationRows("B"));

    // --- The first waiver window (Dec 10-12). P6 is claimed by s2 with the
    // chip and by s3; P7 by s3 and s1; s3's second and third claims share the
    // drop of P5.
    await clock.set(at("2040-12-11", 12));
    const claim = (user: User, add: number, drop: number | null, chip: number | null) =>
      createCircuitWaiverClaim(pool, leagueA.id, viewer(user), {
        selectionId: add,
        dropSelectionId: drop,
        chipId: chip
      });
    await claim(s2, P[6]!, null, chipId);
    await claim(s3, P[6]!, P[5]!, null);
    await claim(s3, P[7]!, P[5]!, null);
    await claim(s3, P[8]!, P[5]!, null);
    await claim(s1, P[7]!, P[4]!, null);
    // Free agency is closed while the window is open.
    await expect(
      addCircuitFreeAgent(pool, leagueA.id, viewer(s1), {
        selectionId: P[9]!,
        dropSelectionId: P[4]!
      })
    ).rejects.toMatchObject({ code: "CIRCUIT_WAIVER_WINDOW_OPEN" });

    await clock.set(at("2040-12-13", 0, 5));
    const firstRuns = await runDueCircuitWaivers(pool);
    expect(
      firstRuns
        .map((r) => [r.circuit_league_id, r.window_starts_on, r.won, r.lost])
        .sort()
    ).toEqual(
      [
        [leagueA.id, CRITICS_NOMINATIONS, 2, 3],
        [leagueB.id, CRITICS_NOMINATIONS, 0, 0]
      ].sort()
    );
    const claims = await pool.query<{
      member_id: number;
      selection_id: number;
      status: string;
      failure_reason: string | null;
    }>(
      `SELECT member_id::int, selection_id::int, status, failure_reason
       FROM circuit_waiver_claim WHERE circuit_league_id = $1 ORDER BY id`,
      [leagueA.id]
    );
    expect(
      claims.rows.map((c) => [
        userOfMember.get(c.member_id),
        label.get(c.selection_id),
        c.status,
        c.failure_reason
      ])
    ).toEqual([
      [s2.username, "P6", "WON", null],
      [s3.username, "P6", "LOST", "SELECTION_OWNED"],
      [s3.username, "P7", "WON", null],
      [s3.username, "P8", "LOST", "DROP_NOT_OWNED"],
      [s1.username, "P7", "LOST", "SELECTION_OWNED"]
    ]);
    const chip = await pool.query<{ status: string }>(
      `SELECT status FROM circuit_chip WHERE id = $1`,
      [chipId]
    );
    expect(chip.rows[0]!.status).toBe("CONSUMED");
    // Both winners move to the bottom once, keeping their order.
    expect(await priorities(leagueA)).toEqual([s1.username, s3.username, s2.username]);
    expect(await rosters(leagueA)).toEqual({
      [s1.username]: ["P1", "P4"],
      [s2.username]: ["P2", "P6"],
      [s3.username]: ["P3", "P7"]
    });
    // A repeat of the run finds nothing left to do.
    expect(await runDueCircuitWaivers(pool)).toEqual([]);

    // --- The Critics Choice win, entered the evening of the ceremony.
    await clock.set(at(CRITICS_WIN, 21));
    await enterWinner(critics, criticsNominations.get(1)!);
    await clock.set(at("2041-01-11", 0, 5));
    expect((await runDueCircuitWaivers(pool)).map((r) => r.window_starts_on)).toEqual([
      CRITICS_WIN,
      CRITICS_WIN
    ]);

    // --- Mid-season: s2 drops P2, and the Guild nominations date is
    // corrected from Jan 15 to Jan 22, which moves League A's window.
    await clock.set(at("2041-01-13", 12));
    await dropCircuitSelection(pool, leagueA.id, viewer(s2), P[2]!);
    await clock.advance(30 * 60_000);
    const jan16 = at("2041-01-16", 12);
    expect(await freeAgencyAt(leagueA, s3, jan16)).toMatchObject({
      open: false,
      window: { starts_on: GUILD_NOMINATIONS_AS_ENTERED }
    });
    const corrected = await send("patch", `/admin/ceremonies/${guild.id}/dates`, {
      nominations_on: GUILD_NOMINATIONS
    });
    expect(corrected.status).toBe(200);
    expect(await freeAgencyAt(leagueA, s3, jan16)).toEqual({ open: true, window: null });

    // s3 picks P2 up as a free agent on Jan 16, dropping P7: open only
    // because of the correction.
    await clock.set(jan16);
    await addCircuitFreeAgent(pool, leagueA.id, viewer(s3), {
      selectionId: P[2]!,
      dropSelectionId: P[7]!
    });
    expect(await rosters(leagueA)).toEqual({
      [s1.username]: ["P1", "P4"],
      [s2.username]: ["P6"],
      [s3.username]: ["P2", "P3"]
    });

    // --- Guild and Oscars nominations, then the window covering both.
    await clock.set(at(GUILD_NOMINATIONS, 9));
    const guildNominations = new Map<number, number>();
    for (const i of [2, 3, 7]) guildNominations.set(i, await nominate(guild, films[i]!));
    await clock.set(at(OSCARS_NOMINATIONS, 9));
    const oscarsNominations = new Map<number, number>();
    for (const i of [1, 2, 3, 5, 6]) {
      oscarsNominations.set(i, await nominate(oscars, films[i]!));
    }
    await clock.set(at("2041-01-27", 0, 5));
    expect(
      (await runDueCircuitWaivers(pool))
        .map((r) => [r.circuit_league_id, r.window_starts_on])
        .sort()
    ).toEqual(
      [
        [leagueA.id, GUILD_NOMINATIONS],
        [leagueB.id, OSCARS_NOMINATIONS]
      ].sort()
    );

    // --- The Guild win. League B never enabled the Guild, so its free
    // agency stays open while League A's window runs.
    await clock.set(at(GUILD_WIN, 21));
    await enterWinner(guild, guildNominations.get(3)!);
    const feb21 = at("2041-02-21", 12);
    await clock.set(feb21);
    expect(await freeAgencyAt(leagueA, s1, feb21)).toMatchObject({
      open: false,
      window: { starts_on: GUILD_WIN }
    });
    expect(await freeAgencyAt(leagueB, t1, feb21)).toEqual({ open: true, window: null });
    await clock.set(at("2041-02-23", 0, 5));
    expect(
      (await runDueCircuitWaivers(pool)).map((r) => [
        r.circuit_league_id,
        r.window_starts_on
      ])
    ).toEqual([[leagueA.id, GUILD_WIN]]);

    // --- The Oscars win, the final occasion.
    await clock.set(at(OSCARS_WIN, 21));
    await enterWinner(oscars, oscarsNominations.get(2)!);

    // --- Every ownership change is dated in the simulation.
    const log = await pool.query<{ kind: string; occurred_at: Date }>(
      `SELECT kind, occurred_at FROM circuit_transaction
       WHERE circuit_league_id = $1 ORDER BY occurred_at, id`,
      [leagueA.id]
    );
    expect(log.rows.map((t) => [t.kind, resultsDateOf(t.occurred_at)])).toEqual([
      ["DRAFT", DRAFT_DAY],
      ["DRAFT", DRAFT_DAY],
      ["DRAFT", DRAFT_DAY],
      ["DRAFT", DRAFT_DAY],
      ["SUPPLEMENTAL", DRAFT_DAY],
      ["WAIVER", "2040-12-13"],
      ["WAIVER", "2040-12-13"],
      ["DROP", "2041-01-13"],
      ["FREE_AGENT", "2041-01-16"]
    ]);

    // --- Final ledgers, worked out by hand.
    //
    // League A (every event, weight 1; 1 per nomination, 2 per win):
    // - Critics nominations (Dec 10, before the waiver run): s1 P1, P4; s2 P2;
    //   s3 P3. P6 and P7 are free agents; the members who claim them after
    //   that day get nothing for it.
    // - Critics win (Jan 8): P1, s1.
    // - Guild nominations (Jan 22, corrected): P2 and P3 are s3's; P7 was
    //   dropped on Jan 16 and scores for no one.
    // - Oscars nominations (Jan 24): s1 P1; s3 P2, P3; s2 P6. P5 is a free
    //   agent since s3 dropped it in the waiver run.
    // - Guild win (Feb 20): P3, s3. Oscars win (Mar 3): P2, s3.
    // P2 scores 1 for s2, who held it in December, and 4 for s3 after it.
    // Totals: s1 1+1+2+1 = 5; s2 1+1 = 2; s3 1+1+1+1+1+2+2 = 9.
    const A = (user: User, film: string, kind: string, date: string, points: number) => [
      user.username,
      film,
      kind,
      date,
      points
    ];
    expect(await ledger(leagueA)).toEqual([
      ...criticsNominationRows("A"),
      A(s1, "P1", "WIN", CRITICS_WIN, 2),
      A(s3, "P2", "NOMINATION", GUILD_NOMINATIONS, 1),
      A(s3, "P3", "NOMINATION", GUILD_NOMINATIONS, 1),
      A(s1, "P1", "NOMINATION", OSCARS_NOMINATIONS, 1),
      A(s3, "P2", "NOMINATION", OSCARS_NOMINATIONS, 1),
      A(s3, "P3", "NOMINATION", OSCARS_NOMINATIONS, 1),
      A(s2, "P6", "NOMINATION", OSCARS_NOMINATIONS, 1),
      A(s3, "P3", "WIN", GUILD_WIN, 2),
      A(s3, "P2", "WIN", OSCARS_WIN, 2)
    ]);
    // League B (no Guild; the Oscars weigh 2): rosters never change.
    // - Critics nominations: t1 P1, P6; t2 P2, P3. Critics win: P1, t1.
    // - Oscars nominations, 1 x 2 each: t1 P1, P6; t2 P2, P3.
    // - Oscars win, 2 x 2: P2, t2. The Guild scores nothing.
    // Totals: t1 1+1+2+2+2 = 8; t2 1+1+2+2+4 = 10.
    expect(await ledger(leagueB)).toEqual([
      ...criticsNominationRows("B"),
      A(t1, "P1", "WIN", CRITICS_WIN, 2),
      A(t1, "P1", "NOMINATION", OSCARS_NOMINATIONS, 2),
      A(t2, "P2", "NOMINATION", OSCARS_NOMINATIONS, 2),
      A(t2, "P3", "NOMINATION", OSCARS_NOMINATIONS, 2),
      A(t1, "P6", "NOMINATION", OSCARS_NOMINATIONS, 2),
      A(t2, "P2", "WIN", OSCARS_WIN, 4)
    ]);

    const standings = async (league: League, user: User) =>
      (await getCircuitStandings(pool, league.id, viewer(user))).standings.map((s) => [
        s.rank,
        s.member.username,
        s.points
      ]);
    const finalA = [
      [1, s3.username, 9],
      [2, s1.username, 5],
      [3, s2.username, 2]
    ];
    const finalB = [
      [1, t2.username, 10],
      [2, t1.username, 8]
    ];
    expect(await standings(leagueA, alice)).toEqual(finalA);
    expect(await standings(leagueB, dave)).toEqual(finalB);

    // A full rebuild after the season changes nothing.
    await clock.advance(24 * 3600_000);
    await rebuildCircuitScores(pool, { circuitId });
    expect(await standings(leagueA, alice)).toEqual(finalA);
    expect(await standings(leagueB, dave)).toEqual(finalB);
  }, 60_000);
});
