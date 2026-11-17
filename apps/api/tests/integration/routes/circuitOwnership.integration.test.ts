import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { runInTransaction } from "../../../src/data/db.js";
import { getCircuitLeagueById } from "../../../src/data/repositories/circuitLeagueRepository.js";
import { resultsDateOf } from "../../../src/domain/circuit.js";
import { removeCategory } from "../../../src/services/circuit/circuitCategories.js";
import { applyOwnershipChange } from "../../../src/services/circuit/circuitOwnership.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertPerson,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

type User = { id: number; username: string };
type Roster = {
  member: { user_id: number };
  roster_size: number;
  free_agency: { open: boolean; window: { starts_on: string } | null };
  categories: Array<{ id: number; max_owned: number | null; owned: number }>;
  entries: Array<{ selection: { id: number } }>;
};
type Log = {
  transactions: Array<{
    kind: string;
    member: { username: string };
    add: { id: number } | null;
    drop: { id: number } | null;
  }>;
};

function auth(user: User) {
  const token = signTestToken(
    { sub: String(user.id), username: user.username },
    AUTH_SECRET
  );
  return { Authorization: `Bearer ${token}` };
}

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

describe("circuit ownership", () => {
  let alice: User;
  let bob: User;
  let carol: User;
  let dana: User;
  let outsider: User;
  let leagueId: number;
  let circuitId: number;
  let eventId: number;
  let ceremonyId: number;
  let picture: number;
  let actor: number;
  let circuitLeagueId: number;
  const memberIds = new Map<number, number>();
  let films: number[];
  let actors: number[];

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

  async function insertSelection(categoryId: number, withPerson: boolean) {
    const film = await insertFilm(db.pool);
    const person = withPerson ? await insertPerson(db.pool) : null;
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_selection
         (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
      [categoryId, film.id, person?.id ?? null, film.id, person?.id ?? null]
    );
    return rows[0]!.id;
  }

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    memberIds.clear();
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });
    carol = await insertUser(db.pool, { username: "carol" });
    dana = await insertUser(db.pool, { username: "dana" });
    outsider = await insertUser(db.pool, { username: "outsider" });
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    leagueId = league.id;
    for (const user of [alice, bob, carol, dana]) {
      await insertLeagueMember(db.pool, { league_id: leagueId, user_id: user.id });
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
    ceremonyId = (await insertCeremony(db.pool, {}, false)).id;
    // Undated: no scoring days, so no waiver windows.
    await db.pool.query(
      `UPDATE ceremony SET status = 'ACTIVE', nominations_on = NULL, starts_at = NULL
       WHERE id = $1`,
      [ceremonyId]
    );
    await db.pool.query(
      `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
       VALUES ($1, $2, $3, 0)`,
      [circuitId, ceremonyId, eventId]
    );
    const categories = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0), ($1, 'actor', 'Actor', 'ACTING', 1)
       RETURNING id::int`,
      [circuitId]
    );
    [picture, actor] = categories.rows.map((r) => r.id) as [number, number];

    const created = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_league
         (circuit_id, league_id, status, roster_size, initialized_at, created_by_user_id)
       VALUES ($1, $2, 'IN_SEASON', 3, now(), $3) RETURNING id::int`,
      [circuitId, leagueId, alice.id]
    );
    circuitLeagueId = created.rows[0]!.id;
    await db.pool.query(
      `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
       VALUES ($1, $2, $3)`,
      [circuitLeagueId, circuitId, eventId]
    );
    await db.pool.query(
      `INSERT INTO circuit_league_category
         (circuit_league_id, circuit_id, circuit_category_id, max_owned)
       VALUES ($1, $2, $3, NULL), ($1, $2, $4, 1)`,
      [circuitLeagueId, circuitId, picture, actor]
    );
    // dana is in the league but not in this season.
    for (const user of [alice, bob, carol]) {
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id)
         VALUES ($1, $2) RETURNING id::int`,
        [circuitLeagueId, user.id]
      );
      memberIds.set(user.id, rows[0]!.id);
    }

    films = [];
    for (let i = 0; i < 6; i += 1) films.push(await insertSelection(picture, false));
    actors = [await insertSelection(actor, true), await insertSelection(actor, true)];
  });

  const add = (user: User, selectionId: number, dropSelectionId?: number) =>
    api
      .post(`/circuit-leagues/${circuitLeagueId}/free-agents`)
      .set(auth(user))
      .send({ selection_id: selectionId, drop_selection_id: dropSelectionId });

  const drop = (user: User, selectionId: number) =>
    api
      .post(`/circuit-leagues/${circuitLeagueId}/drops`)
      .set(auth(user))
      .send({ selection_id: selectionId });

  const roster = async (user: User) => {
    const res = await api
      .get(`/circuit-leagues/${circuitLeagueId}/roster`)
      .set(auth(user));
    expect(res.status).toBe(200);
    return res.body as Roster;
  };

  const rosterIds = async (user: User) =>
    (await roster(user)).entries.map((e) => e.selection.id).sort((a, b) => a - b);

  async function history() {
    const { rows } = await db.pool.query<{
      id: number;
      member_id: number;
      selection_id: number;
      acquired_at: Date;
      released_at: Date | null;
      acquired_transaction_id: number;
      released_transaction_id: number | null;
    }>(
      `SELECT id::int, member_id::int, selection_id::int, acquired_at, released_at,
              acquired_transaction_id::int, released_transaction_id::int
       FROM circuit_ownership ORDER BY id`
    );
    return rows;
  }

  async function openWindowToday() {
    // Nominations today (Pacific) open a window over today and the next two
    // days; the ceremony, far off, is the final occasion.
    await db.pool.query(
      `UPDATE ceremony SET nominations_on = $2::date, starts_at = $3 WHERE id = $1`,
      [ceremonyId, resultsDateOf(new Date()), new Date(Date.now() + 60 * DAY_MS)]
    );
  }

  it("adds a free agent, records one transaction and shows it on the roster", async () => {
    const res = await add(alice, films[0]!);
    expect(res.status).toBe(200);
    const body = res.body as Roster;
    expect(body.member.user_id).toBe(alice.id);
    expect(body.roster_size).toBe(3);
    expect(body.free_agency).toEqual({ open: true, window: null });
    expect(body.entries.map((e) => e.selection.id)).toEqual([films[0]]);
    expect(body.categories.find((c) => c.id === actor)).toMatchObject({
      max_owned: 1,
      owned: 0
    });

    const log = await api
      .get(`/circuit-leagues/${circuitLeagueId}/transactions`)
      .set(auth(bob));
    expect(log.status).toBe(200);
    expect((log.body as Log).transactions).toEqual([
      expect.objectContaining({
        kind: "FREE_AGENT",
        member: expect.objectContaining({ username: "alice" }),
        add: expect.objectContaining({ id: films[0] }),
        drop: null
      })
    ]);

    // Any viewer of the league can read a member's roster.
    const other = await api
      .get(`/circuit-leagues/${circuitLeagueId}/members/${alice.id}/roster`)
      .set(auth(bob));
    expect(other.status).toBe(200);
    expect((other.body as Roster).entries).toHaveLength(1);
  });

  it("refuses a selection someone else holds, or one already on the roster", async () => {
    expect((await add(alice, films[0]!)).status).toBe(200);
    const taken = await add(bob, films[0]!);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("CIRCUIT_SELECTION_TAKEN");
    const mine = await add(alice, films[0]!);
    expect(mine.status).toBe(409);
    expect(mine.body.error.code).toBe("CIRCUIT_SELECTION_ALREADY_OWNED");
  });

  it("lets exactly one of two interleaved acquisitions of a selection commit", async () => {
    const league = (await getCircuitLeagueById(db.pool, circuitLeagueId))!;
    const first = await db.pool.connect();
    try {
      await first.query("BEGIN");
      await applyOwnershipChange(first, league, {
        kind: "FREE_AGENT",
        memberId: memberIds.get(alice.id)!,
        addSelectionId: films[0]!,
        dropSelectionId: null,
        actorUserId: alice.id
      });
      // Bob's transaction sees no open interval yet, so it reaches the insert
      // and waits on the partial unique index until Alice's commits.
      const second = runInTransaction(db.pool, (tx) =>
        applyOwnershipChange(tx, league, {
          kind: "FREE_AGENT",
          memberId: memberIds.get(bob.id)!,
          addSelectionId: films[0]!,
          dropSelectionId: null,
          actorUserId: bob.id
        })
      );
      const outcome = second.then(
        () => "committed",
        (err: { code?: string }) => err.code
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query("COMMIT");
      expect(await outcome).toBe("CIRCUIT_SELECTION_TAKEN");
    } finally {
      first.release();
    }
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.member_id).toBe(memberIds.get(alice.id));
    const { rows: tx } = await db.pool.query(`SELECT 1 FROM circuit_transaction`);
    expect(tx).toHaveLength(1);
  });

  it("lets exactly one of parallel requests for one selection succeed", async () => {
    const results = await Promise.all(
      [alice, bob, carol, alice, bob, carol].map((user) => add(user, films[1]!))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409]);
    expect(await history()).toHaveLength(1);
  });

  it("refuses an add at capacity without a drop and takes it as one transaction with one", async () => {
    for (const film of films.slice(0, 3))
      expect((await add(alice, film)).status).toBe(200);

    const full = await add(alice, films[3]!);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("CIRCUIT_ROSTER_FULL");

    const swap = await add(alice, films[3]!, films[0]!);
    expect(swap.status).toBe(200);
    expect((swap.body as Roster).entries).toHaveLength(3);
    expect(await rosterIds(alice)).toEqual([films[1], films[2], films[3]]);

    const { rows } = await db.pool.query<{
      id: number;
      kind: string;
      add_selection_id: number;
      drop_selection_id: number;
    }>(
      `SELECT id::int, kind, add_selection_id::int, drop_selection_id::int
       FROM circuit_transaction WHERE drop_selection_id IS NOT NULL`
    );
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "FREE_AGENT",
        add_selection_id: films[3],
        drop_selection_id: films[0]
      })
    ]);
    const intervals = await history();
    const closed = intervals.find((i) => i.selection_id === films[0])!;
    const opened = intervals.find((i) => i.selection_id === films[3])!;
    expect(closed.released_transaction_id).toBe(rows[0]!.id);
    expect(opened.acquired_transaction_id).toBe(rows[0]!.id);
    expect(closed.released_at!.getTime()).toBe(opened.acquired_at.getTime());
  });

  it("never exceeds capacity under parallel adds by one member", async () => {
    for (const film of films.slice(0, 2))
      expect((await add(alice, film)).status).toBe(200);
    const results = await Promise.all(films.slice(2, 6).map((film) => add(alice, film)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).map((r) => r.body.error.code)).toEqual(
      ["CIRCUIT_ROSTER_FULL", "CIRCUIT_ROSTER_FULL", "CIRCUIT_ROSTER_FULL"]
    );
    expect(await rosterIds(alice)).toHaveLength(3);
  });

  it("enforces category limits", async () => {
    expect((await add(alice, actors[0]!)).status).toBe(200);
    const over = await add(alice, actors[1]!);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("CIRCUIT_CATEGORY_FULL");
    // A drop from another category does not make room in this one.
    expect((await add(alice, films[0]!)).status).toBe(200);
    expect((await add(alice, actors[1]!, films[0]!)).body.error.code).toBe(
      "CIRCUIT_CATEGORY_FULL"
    );
    // Dropping the actor does.
    expect((await add(alice, actors[1]!, actors[0]!)).status).toBe(200);
    expect((await roster(alice)).categories.find((c) => c.id === actor)?.owned).toBe(1);
    // Another member's limit is their own.
    expect((await add(bob, actors[0]!)).status).toBe(200);
  });

  it("drops at once, and the selection can be re-acquired at once by anyone", async () => {
    expect((await add(alice, films[0]!)).status).toBe(200);
    const dropped = await drop(alice, films[0]!);
    expect(dropped.status).toBe(200);
    expect((dropped.body as Roster).entries).toEqual([]);

    expect((await add(alice, films[0]!)).status).toBe(200);
    expect((await drop(alice, films[0]!)).status).toBe(200);
    expect((await add(bob, films[0]!)).status).toBe(200);

    const intervals = await history();
    expect(intervals.map((i) => [i.member_id, i.released_at === null])).toEqual([
      [memberIds.get(alice.id), false],
      [memberIds.get(alice.id), false],
      [memberIds.get(bob.id), true]
    ]);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]!.acquired_at.getTime()).toBeGreaterThanOrEqual(
        intervals[i - 1]!.released_at!.getTime()
      );
    }

    const log = await api
      .get(`/circuit-leagues/${circuitLeagueId}/transactions`)
      .set(auth(carol));
    expect(
      (log.body as Log).transactions.map((t) => [t.kind, t.member.username])
    ).toEqual([
      ["FREE_AGENT", "bob"],
      ["DROP", "alice"],
      ["FREE_AGENT", "alice"],
      ["DROP", "alice"],
      ["FREE_AGENT", "alice"]
    ]);
  });

  it("refuses dropping a selection not on the roster", async () => {
    expect((await add(bob, films[0]!)).status).toBe(200);
    const res = await drop(alice, films[0]!);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CIRCUIT_SELECTION_NOT_OWNED");
    const swap = await add(alice, films[1]!, films[0]!);
    expect(swap.body.error.code).toBe("CIRCUIT_SELECTION_NOT_OWNED");
    expect(await history()).toHaveLength(1);
  });

  it("refuses free agency inside a waiver window and allows drops there", async () => {
    expect((await add(alice, films[0]!)).status).toBe(200);
    await openWindowToday();

    const refused = await add(alice, films[1]!);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("CIRCUIT_WAIVER_WINDOW_OPEN");
    expect(refused.body.error.details.window.starts_on).toBe(resultsDateOf(new Date()));
    const status = await roster(alice);
    expect(status.free_agency.open).toBe(false);

    expect((await drop(alice, films[0]!)).status).toBe(200);

    // A league with that event disabled has no window, so free agency is open.
    await db.pool.query(`DELETE FROM circuit_league_event WHERE circuit_league_id = $1`, [
      circuitLeagueId
    ]);
    expect((await roster(alice)).free_agency).toEqual({ open: true, window: null });
    expect((await add(alice, films[1]!)).status).toBe(200);
  });

  it("allows free agency once the window has resolved", async () => {
    // Nominations four days ago (Pacific): the window covered that day and
    // the next two and resolved at 00:00 yesterday.
    const fourDaysAgo = resultsDateOf(new Date(Date.now() - 4 * DAY_MS));
    await db.pool.query(
      `UPDATE ceremony SET nominations_on = $2::date, starts_at = $3 WHERE id = $1`,
      [ceremonyId, fourDaysAgo, new Date(Date.now() + 60 * DAY_MS)]
    );
    expect((await add(alice, films[0]!)).status).toBe(200);
  });

  it("allows adds and drops only in season, and only for the season's members", async () => {
    await db.pool.query(`UPDATE circuit_league SET status = 'DRAFTING' WHERE id = $1`, [
      circuitLeagueId
    ]);
    const early = await add(alice, films[0]!);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("CIRCUIT_LEAGUE_NOT_IN_SEASON");
    await db.pool.query(`UPDATE circuit_league SET status = 'IN_SEASON' WHERE id = $1`, [
      circuitLeagueId
    ]);

    const notJoined = await add(dana, films[0]!);
    expect(notJoined.status).toBe(403);
    expect(notJoined.body.error.code).toBe("CIRCUIT_MEMBERSHIP_REQUIRED");
    const ownRoster = await api
      .get(`/circuit-leagues/${circuitLeagueId}/roster`)
      .set(auth(dana));
    expect(ownRoster.status).toBe(403);
    expect((await add(outsider, films[0]!)).status).toBe(404);
    expect(
      (
        await api
          .get(`/circuit-leagues/${circuitLeagueId}/transactions`)
          .set(auth(outsider))
      ).status
    ).toBe(404);
  });

  it("refuses a selection from another Circuit", async () => {
    const other = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('other', 'Other', 'ACTIVE', now()) RETURNING id::int`
    );
    const category = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [other.rows[0]!.id]
    );
    const foreign = await insertSelection(category.rows[0]!.id, false);
    expect((await add(alice, foreign)).status).toBe(404);
  });

  it("keeps history append-only", async () => {
    expect((await add(alice, films[0]!)).status).toBe(200);
    expect((await drop(alice, films[0]!)).status).toBe(200);
    expect((await add(bob, films[1]!)).status).toBe(200);

    expect(
      await pgErrorCode(db.pool.query(`UPDATE circuit_transaction SET kind = 'DROP'`))
    ).toBe("23001");
    // A closed interval cannot reopen or move.
    expect(
      await pgErrorCode(
        db.pool.query(
          `UPDATE circuit_ownership
           SET released_at = NULL, released_transaction_id = NULL
           WHERE released_at IS NOT NULL`
        )
      )
    ).toBe("23001");
    expect(
      await pgErrorCode(
        db.pool.query(
          `UPDATE circuit_ownership SET acquired_at = acquired_at - interval '1 day'`
        )
      )
    ).toBe("23001");
    expect(await pgErrorCode(db.pool.query(`DELETE FROM circuit_ownership`))).toBe(
      "23001"
    );
    expect(await pgErrorCode(db.pool.query(`DELETE FROM circuit_transaction`))).toBe(
      "23001"
    );

    // History goes only with its league.
    await db.pool.query(`DELETE FROM circuit_league WHERE id = $1`, [circuitLeagueId]);
    expect(await history()).toEqual([]);
  });

  it("points every ownership boundary at exactly one matching transaction", async () => {
    expect((await add(alice, films[0]!)).status).toBe(200);
    expect((await add(alice, films[1]!)).status).toBe(200);
    expect((await add(alice, actors[0]!)).status).toBe(200);
    expect((await add(alice, films[2]!, films[0]!)).status).toBe(200);
    expect((await drop(alice, films[1]!)).status).toBe(200);
    expect((await add(bob, films[0]!)).status).toBe(200);
    expect((await add(bob, films[1]!)).status).toBe(200);

    // Each boundary's transaction added or dropped that selection for that
    // member, at that instant.
    const { rows: mismatched } = await db.pool.query(
      `SELECT o.id
       FROM circuit_ownership o
       JOIN circuit_transaction a ON a.id = o.acquired_transaction_id
       LEFT JOIN circuit_transaction r ON r.id = o.released_transaction_id
       WHERE a.add_selection_id <> o.selection_id
          OR a.member_id <> o.member_id
          OR a.occurred_at <> o.acquired_at
          OR (o.released_at IS NOT NULL AND (
                r.drop_selection_id <> o.selection_id
                OR r.member_id <> o.member_id
                OR r.occurred_at <> o.released_at))`
    );
    expect(mismatched).toEqual([]);

    // Each transaction made exactly the boundaries its add and drop imply.
    const { rows: counts } = await db.pool.query<{
      add_selection_id: number | null;
      drop_selection_id: number | null;
      opened: number;
      closed: number;
    }>(
      `SELECT t.add_selection_id::int, t.drop_selection_id::int,
              (SELECT count(*)::int FROM circuit_ownership o
               WHERE o.acquired_transaction_id = t.id) AS opened,
              (SELECT count(*)::int FROM circuit_ownership o
               WHERE o.released_transaction_id = t.id) AS closed
       FROM circuit_transaction t ORDER BY t.id`
    );
    expect(counts).toHaveLength(7);
    for (const row of counts) {
      expect(row.opened).toBe(row.add_selection_id === null ? 0 : 1);
      expect(row.closed).toBe(row.drop_selection_id === null ? 0 : 1);
    }

    // The schema refuses a boundary whose transaction added another selection,
    // and a second boundary on a transaction that already made one.
    const aliceMember = memberIds.get(alice.id)!;
    const { rows: stray } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_transaction (circuit_league_id, member_id, kind, add_selection_id)
       VALUES ($1, $2, 'FREE_AGENT', $3) RETURNING id::int`,
      [circuitLeagueId, aliceMember, films[4]]
    );
    const insertBoundary = (selectionId: number, transactionId: number) =>
      db.pool.query(
        `INSERT INTO circuit_ownership
           (circuit_league_id, member_id, selection_id, acquired_at, acquired_transaction_id)
         VALUES ($1, $2, $3, now(), $4)`,
        [circuitLeagueId, aliceMember, selectionId, transactionId]
      );
    expect(await pgErrorCode(insertBoundary(films[5]!, stray[0]!.id))).toBe("23503");
    const [first] = await history();
    expect(
      await pgErrorCode(insertBoundary(films[5]!, first!.acquired_transaction_id))
    ).toBe("23505");
  });

  it("refuses removing a category whose contenders have been owned", async () => {
    expect((await add(alice, actors[0]!)).status).toBe(200);
    expect((await drop(alice, actors[0]!)).status).toBe(200);
    await expect(
      removeCategory(db.pool, { actorUserId: null }, { circuitId, categoryId: actor })
    ).rejects.toMatchObject({ code: "CIRCUIT_CATEGORY_IN_USE", status: 409 });
  });
});
