import { getSnakeSeatForPick } from "@fantasy-oscars/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../../src/server.js";
import {
  circuitDraftSweeperPass,
  startCircuitDraft,
  tickCircuitDraft
} from "../../../src/services/circuit/circuitDraft.js";
import { startDraftSweeper } from "../../../src/services/draftSweeper.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
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

type User = { id: number; username: string };
type Seat = { seat_number: number; member_id: number; user_id: number };
type Draft = {
  id: number;
  status: string;
  rounds: number;
  pick_timer_seconds: number;
  current_pick_number: number | null;
  pick_deadline_at: string | null;
  version: number;
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

describe("circuit draft", () => {
  let alice: User;
  let bob: User;
  let carol: User;
  let dana: User;
  let outsider: User;
  let users: Map<number, User>;
  let circuitId: number;
  let picture: number;
  let actor: number;
  let circuitLeagueId: number;
  let films: number[];
  let actors: number[];

  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
    process.env.AUTH_SECRET = AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
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
    // A fresh server per test, so the per-server pick rate limiter starts empty.
    api = createApiAgent(createServer({ db: db.pool }));
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });
    carol = await insertUser(db.pool, { username: "carol" });
    dana = await insertUser(db.pool, { username: "dana" });
    outsider = await insertUser(db.pool, { username: "outsider" });
    users = new Map([alice, bob, carol].map((u) => [u.id, u]));
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    for (const user of [alice, bob, carol, dana]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }

    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    circuitId = circuit.rows[0]!.id;
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
       VALUES ($1, $2, 'INITIALIZED', 2, now(), $3) RETURNING id::int`,
      [circuitId, league.id, alice.id]
    );
    circuitLeagueId = created.rows[0]!.id;
    await db.pool.query(
      `INSERT INTO circuit_league_category
         (circuit_league_id, circuit_id, circuit_category_id, max_owned)
       VALUES ($1, $2, $3, NULL), ($1, $2, $4, 1)`,
      [circuitLeagueId, circuitId, picture, actor]
    );
    // dana is in the league but not in this season.
    for (const user of [alice, bob, carol]) {
      await db.pool.query(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id) VALUES ($1, $2)`,
        [circuitLeagueId, user.id]
      );
    }

    films = [];
    for (let i = 0; i < 8; i += 1) films.push(await insertSelection(picture, false));
    actors = [await insertSelection(actor, true), await insertSelection(actor, true)];
  });

  const start = (user: User) =>
    api.post(`/circuit-leagues/${circuitLeagueId}/draft`).set(auth(user)).send();

  const pick = (draftId: number, user: User, selectionId: number, requestId: string) =>
    api
      .post(`/circuit-drafts/${draftId}/picks`)
      .set(auth(user))
      .send({ selection_id: selectionId, request_id: requestId });

  async function started() {
    const res = await start(alice);
    expect(res.status).toBe(201);
    return res.body as { draft: Draft; seats: Seat[] };
  }

  const onTheClock = (seats: Seat[], pickNumber: number) => {
    const seatNumber = getSnakeSeatForPick(seats.length, pickNumber);
    return users.get(seats.find((s) => s.seat_number === seatNumber)!.user_id)!;
  };

  const leagueStatus = async () =>
    (
      await db.pool.query<{ status: string }>(
        `SELECT status FROM circuit_league WHERE id = $1`,
        [circuitLeagueId]
      )
    ).rows[0]!.status;

  const count = async (sql: string, params: unknown[] = []) =>
    (await db.pool.query<{ n: number }>(sql, params)).rows[0]!.n;

  describe("start", () => {
    it("seats every member, sets rounds to the roster size and moves the league to DRAFTING", async () => {
      const before = Date.now();
      const { draft, seats } = await started();
      expect(draft).toMatchObject({
        status: "IN_PROGRESS",
        rounds: 2,
        pick_timer_seconds: 90,
        current_pick_number: 1,
        version: 1
      });
      const deadline = new Date(draft.pick_deadline_at!).getTime();
      expect(deadline).toBeGreaterThanOrEqual(before + 89_000);
      expect(deadline).toBeLessThanOrEqual(Date.now() + 91_000);
      expect(seats.map((s) => s.seat_number)).toEqual([1, 2, 3]);
      expect(seats.map((s) => s.user_id).sort((a, b) => a - b)).toEqual(
        [alice.id, bob.id, carol.id].sort((a, b) => a - b)
      );
      expect(await leagueStatus()).toBe("DRAFTING");

      const events = await db.pool.query(
        `SELECT version, event_type FROM circuit_draft_event WHERE draft_id = $1`,
        [draft.id]
      );
      expect(events.rows).toEqual([{ version: 1, event_type: "draft.started" }]);
    });

    it("starts only once", async () => {
      await started();
      const again = await start(alice);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("CIRCUIT_DRAFT_NOT_STARTABLE");
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft`)).toBe(1);
    });

    it("is for the league owner only", async () => {
      const res = await start(bob);
      expect(res.status).toBe(403);
      expect((await start(outsider)).status).toBe(404);
      expect(await leagueStatus()).toBe("INITIALIZED");
    });

    it("refuses a league that has not been initialised", async () => {
      await db.pool.query(
        `UPDATE circuit_league SET status = 'SETUP', initialized_at = NULL WHERE id = $1`,
        [circuitLeagueId]
      );
      const res = await start(alice);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_DRAFT_NOT_STARTABLE");
    });

    it("runs untimed when the league's clock is 0", async () => {
      await db.pool.query(
        `UPDATE circuit_league SET pick_timer_seconds = 0 WHERE id = $1`,
        [circuitLeagueId]
      );
      const { draft } = await started();
      expect(draft.pick_timer_seconds).toBe(0);
      expect(draft.pick_deadline_at).toBeNull();
    });

    it("shuffles seats with the injected random source", async () => {
      const members = await db.pool.query<{ id: number }>(
        `SELECT id::int FROM circuit_league_member
         WHERE circuit_league_id = $1 ORDER BY joined_at, id`,
        [circuitLeagueId]
      );
      const [a, b, c] = members.rows.map((r) => r.id);
      // Draws of 0 rotate the members left by one (see the unit tests).
      const { seats } = await startCircuitDraft(
        db.pool,
        circuitLeagueId,
        { userId: alice.id, isSuperAdmin: false },
        { random: () => 0 }
      );
      expect(seats.map((s) => s.member_id)).toEqual([b, c, a]);
    });
  });

  describe("picks", () => {
    it("runs a full draft in snake order and moves the league to IN_SEASON", async () => {
      const { draft, seats } = await started();
      const order: number[] = [];
      for (let n = 1; n <= 6; n += 1) {
        const user = onTheClock(seats, n);
        order.push(user.id);
        const res = await pick(draft.id, user, films[n - 1]!, `r-${n}`);
        expect(res.status).toBe(201);
        expect(res.body.pick).toMatchObject({
          pick_number: n,
          original_pick_number: n,
          seat_number: getSnakeSeatForPick(3, n),
          outcome: "PICKED",
          source: "MANUAL",
          selection_id: films[n - 1]
        });
        if (n < 6) expect(res.body.draft.current_pick_number).toBe(n + 1);
      }
      const bySeat = seats.map((s) => s.user_id);
      expect(order).toEqual([...bySeat, ...[...bySeat].reverse()]);

      const after = await db.pool.query<{ status: string; completed_at: Date | null }>(
        `SELECT status, completed_at FROM circuit_draft WHERE id = $1`,
        [draft.id]
      );
      expect(after.rows[0]!.status).toBe("COMPLETED");
      expect(after.rows[0]!.completed_at).not.toBeNull();
      expect(await leagueStatus()).toBe("IN_SEASON");

      // Rolling waiver priority starts in reverse draft order: last seat first.
      const priority = await db.pool.query<{ member_id: number }>(
        `SELECT id::int AS member_id FROM circuit_league_member
         WHERE circuit_league_id = $1 ORDER BY waiver_priority`,
        [circuitLeagueId]
      );
      expect(priority.rows.map((r) => r.member_id)).toEqual(
        [...seats].sort((a, b) => b.seat_number - a.seat_number).map((s) => s.member_id)
      );

      const events = await db.pool.query<{ version: number; event_type: string }>(
        `SELECT version, event_type FROM circuit_draft_event
         WHERE draft_id = $1 ORDER BY version`,
        [draft.id]
      );
      expect(events.rows.map((e) => e.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(events.rows.at(-1)!.event_type).toBe("draft.completed");
    });

    it("writes one DRAFT transaction and one ownership interval per pick", async () => {
      const { draft, seats } = await started();
      for (let n = 1; n <= 3; n += 1) {
        expect(
          (await pick(draft.id, onTheClock(seats, n), films[n - 1]!, `r-${n}`)).status
        ).toBe(201);
      }
      const rows = await db.pool.query<{
        pick_member: number;
        selection_id: number;
        transactions: number;
        intervals: number;
      }>(
        `SELECT p.member_id::int AS pick_member, p.selection_id::int,
           (SELECT COUNT(*)::int FROM circuit_transaction t
            WHERE t.draft_pick_id = p.id AND t.kind = 'DRAFT'
              AND t.member_id = p.member_id AND t.add_selection_id = p.selection_id)
             AS transactions,
           (SELECT COUNT(*)::int FROM circuit_ownership o
            JOIN circuit_transaction t ON t.id = o.acquired_transaction_id
            WHERE t.draft_pick_id = p.id AND o.member_id = p.member_id
              AND o.selection_id = p.selection_id AND o.released_at IS NULL)
             AS intervals
         FROM circuit_draft_pick p WHERE p.draft_id = $1 ORDER BY p.pick_number`,
        [draft.id]
      );
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) {
        expect(row).toMatchObject({ transactions: 1, intervals: 1 });
      }
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_transaction`)).toBe(3);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_ownership`)).toBe(3);
    });

    it("refuses a pick out of turn", async () => {
      const { draft, seats } = await started();
      const waiting = onTheClock(seats, 2);
      const res = await pick(draft.id, waiting, films[0]!, "early");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_DRAFT_NOT_YOUR_TURN");
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft_pick`)).toBe(0);
    });

    it("is idempotent by request id", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      const made = await pick(draft.id, first, films[0]!, "same");
      expect(made.status).toBe(201);
      const repeated = await pick(draft.id, first, films[0]!, "same");
      expect(repeated.status).toBe(200);
      expect(repeated.body.pick.id).toBe(made.body.pick.id);
      expect(repeated.body.draft.current_pick_number).toBe(2);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft_pick`)).toBe(1);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_transaction`)).toBe(1);
    });

    it("drafts a selection once, and a drafted one never comes back during the draft", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      const second = onTheClock(seats, 2);
      expect((await pick(draft.id, first, films[0]!, "a")).status).toBe(201);

      const again = await pick(draft.id, second, films[0]!, "b");
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("CIRCUIT_SELECTION_TAKEN");

      // Drops and free agency stay closed while the league drafts.
      const dropped = await api
        .post(`/circuit-leagues/${circuitLeagueId}/drops`)
        .set(auth(first))
        .send({ selection_id: films[0] });
      expect(dropped.status).toBe(409);
      expect(dropped.body.error.code).toBe("CIRCUIT_LEAGUE_NOT_IN_SEASON");
      const added = await api
        .post(`/circuit-leagues/${circuitLeagueId}/free-agents`)
        .set(auth(second))
        .send({ selection_id: films[1] });
      expect(added.status).toBe(409);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_ownership`)).toBe(1);
    });

    it("holds a pick to the league's category limits, writing nothing when refused", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      // Seat 1 picks at 1 and 6; the actor category allows one each.
      await pick(draft.id, first, actors[0]!, "1");
      for (let n = 2; n <= 5; n += 1) {
        await pick(draft.id, onTheClock(seats, n), films[n]!, `r-${n}`);
      }
      const refused = await pick(draft.id, first, actors[1]!, "6");
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe("CIRCUIT_CATEGORY_FULL");
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft_pick`)).toBe(5);
      const current = await db.pool.query<{ current_pick_number: number }>(
        `SELECT current_pick_number FROM circuit_draft WHERE id = $1`,
        [draft.id]
      );
      expect(current.rows[0]!.current_pick_number).toBe(6);
    });

    it("refuses a selection from another Circuit", async () => {
      const other = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit (code, name) VALUES ('other', 'Other') RETURNING id::int`
      );
      const category = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
         VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
        [other.rows[0]!.id]
      );
      const foreign = await insertSelection(category.rows[0]!.id, false);
      const { draft, seats } = await started();
      const res = await pick(draft.id, onTheClock(seats, 1), foreign, "x");
      expect(res.status).toBe(404);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft_pick`)).toBe(0);
    });

    it("is for the season's members", async () => {
      const { draft } = await started();
      const leagueOnly = await pick(draft.id, dana, films[0]!, "d");
      expect(leagueOnly.status).toBe(403);
      expect(leagueOnly.body.error.code).toBe("CIRCUIT_MEMBERSHIP_REQUIRED");
      expect((await pick(draft.id, outsider, films[0]!, "o")).status).toBe(404);
      expect((await pick(draft.id + 100, alice, films[0]!, "n")).status).toBe(404);
    });

    it("refuses picks while paused", async () => {
      const { draft, seats } = await started();
      await db.pool.query(
        `UPDATE circuit_draft SET status = 'PAUSED', paused_at = now() WHERE id = $1`,
        [draft.id]
      );
      const res = await pick(draft.id, onTheClock(seats, 1), films[0]!, "p");
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_DRAFT_PAUSED");
    });

    it("rate-limits pick attempts per member", async () => {
      const { draft, seats } = await started();
      const waiting = onTheClock(seats, 2);
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        statuses.push((await pick(draft.id, waiting, films[0]!, `w-${i}`)).status);
      }
      expect(statuses).toEqual([409, 409, 409, 429]);
    });
  });

  describe("snapshot", () => {
    const snapshot = (draftId: number, user: User) =>
      api.get(`/circuit-drafts/${draftId}/snapshot`).set(auth(user));
    const leagueDraft = (user: User) =>
      api.get(`/circuit-leagues/${circuitLeagueId}/draft`).set(auth(user));

    it("returns the board at the draft's version, by draft and by league", async () => {
      const notYet = await leagueDraft(alice);
      expect(notYet.status).toBe(404);
      expect(notYet.body.error.code).toBe("CIRCUIT_DRAFT_NOT_STARTED");

      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      expect((await pick(draft.id, first, films[0]!, "s1")).status).toBe(201);

      const res = await snapshot(draft.id, alice);
      expect(res.status).toBe(200);
      const secondSeat = seats.find((s) => s.seat_number === getSnakeSeatForPick(3, 2))!;
      expect(res.body).toMatchObject({
        draft: {
          id: draft.id,
          status: "IN_PROGRESS",
          current_pick_number: 2,
          version: 2
        },
        seats: seats.map((s) => ({ seat_number: s.seat_number, member_id: s.member_id })),
        picks: [
          {
            pick_number: 1,
            original_pick_number: 1,
            outcome: "PICKED",
            selection_id: films[0],
            source: "MANUAL"
          }
        ],
        on_the_clock: {
          pick_number: 2,
          original_pick_number: 2,
          seat_number: secondSeat.seat_number,
          member_id: secondSeat.member_id,
          supplemental: false
        },
        chips: []
      });
      expect(res.body.selections).toEqual([
        expect.objectContaining({ id: films[0], film: expect.any(Object) })
      ]);
      expect(typeof res.body.server_time).toBe("string");

      const byLeague = await leagueDraft(bob);
      expect(byLeague.status).toBe(200);
      expect({ ...byLeague.body, server_time: null }).toEqual({
        ...res.body,
        server_time: null
      });
    });

    it("is for the league's members", async () => {
      const { draft } = await started();
      expect((await snapshot(draft.id, dana)).status).toBe(200);
      expect((await snapshot(draft.id, outsider)).status).toBe(404);
      expect((await leagueDraft(outsider)).status).toBe(404);
      expect((await snapshot(draft.id + 100, alice)).status).toBe(404);
    });
  });

  describe("queue, auto-draft and the supplemental round", () => {
    // The sweeper's clock: each tick runs an hour after the last, so every
    // deadline set by an earlier pick has passed.
    let clock: number;
    beforeEach(() => {
      clock = Date.now();
    });
    const tick = (draftId: number) => {
      clock += 3_600_000;
      return tickCircuitDraft(db.pool, draftId, new Date(clock));
    };

    const queueUrl = () => `/circuit-leagues/${circuitLeagueId}/queue`;
    const enqueue = (user: User, selectionId: number) =>
      api.post(queueUrl()).set(auth(user)).send({ selection_id: selectionId });
    const reorder = (user: User, selectionIds: number[]) =>
      api.put(queueUrl()).set(auth(user)).send({ selection_ids: selectionIds });
    const queued = (body: { items: Array<{ selection: { id: number } }> }) =>
      body.items.map((i) => i.selection.id);

    const picksOf = async (draftId: number) =>
      (
        await db.pool.query<{
          pick_number: number;
          original_pick_number: number;
          outcome: string;
          selection_id: number | null;
          source: string;
          actor_user_id: number | null;
        }>(
          `SELECT pick_number, original_pick_number, outcome, selection_id::int, source,
                  actor_user_id::int
           FROM circuit_draft_pick WHERE draft_id = $1 ORDER BY pick_number`,
          [draftId]
        )
      ).rows;

    it("keeps a private queue that members edit before and during the draft", async () => {
      expect((await enqueue(alice, films[0]!)).status).toBe(201);
      const second = await enqueue(alice, films[1]!);
      expect(second.status).toBe(201);
      expect(queued(second.body)).toEqual([films[0], films[1]]);
      const repeat = await enqueue(alice, films[0]!);
      expect(repeat.status).toBe(200);
      expect(queued(repeat.body)).toEqual([films[0], films[1]]);

      const moved = await reorder(alice, [films[1]!, films[0]!]);
      expect(moved.status).toBe(200);
      expect(queued(moved.body)).toEqual([films[1], films[0]]);
      const stale = await reorder(alice, [films[1]!]);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("CIRCUIT_QUEUE_CHANGED");

      const removed = await api.delete(`${queueUrl()}/${films[1]}`).set(auth(alice));
      expect(queued(removed.body)).toEqual([films[0]]);
      expect(
        (await api.delete(`${queueUrl()}/${films[1]}`).set(auth(alice))).status
      ).toBe(404);
      expect((await enqueue(alice, 999_999)).status).toBe(404);

      expect(queued((await api.get(queueUrl()).set(auth(bob))).body)).toEqual([]);
      const leagueOnly = await api.get(queueUrl()).set(auth(dana));
      expect(leagueOnly.status).toBe(403);
      expect(leagueOnly.body.error.code).toBe("CIRCUIT_MEMBERSHIP_REQUIRED");

      await started();
      expect((await enqueue(alice, films[2]!)).status).toBe(201);
      expect(queued((await api.get(queueUrl()).set(auth(alice))).body)).toEqual([
        films[0],
        films[2]
      ]);
    });

    it("stages selections beside the queue, moving each between the two", async () => {
      const stage = (user: User, selectionId: number) =>
        api
          .post(`${queueUrl()}/staged`)
          .set(auth(user))
          .send({ selection_id: selectionId });
      const staged = (body: { staged: Array<{ selection: { id: number } }> }) =>
        body.staged.map((i) => i.selection.id);

      await enqueue(alice, films[0]!);
      await enqueue(alice, films[1]!);
      const first = await stage(alice, films[2]!);
      expect(first.status).toBe(201);
      expect(staged(first.body)).toEqual([films[2]]);
      expect(queued(first.body)).toEqual([films[0], films[1]]);
      expect((await stage(alice, films[2]!)).status).toBe(200);

      // Staging a queued selection takes it out of the queue and closes the gap.
      const moved = await stage(alice, films[0]!);
      expect(moved.status).toBe(201);
      expect(queued(moved.body)).toEqual([films[1]]);
      expect(moved.body.items[0].position).toBe(1);
      expect(staged(moved.body)).toEqual([films[2], films[0]]);

      // Queueing a staged selection moves it to the bottom of the queue.
      const back = await enqueue(alice, films[2]!);
      expect(back.status).toBe(201);
      expect(queued(back.body)).toEqual([films[1], films[2]]);
      expect(staged(back.body)).toEqual([films[0]]);

      const removed = await api
        .delete(`${queueUrl()}/staged/${films[0]}`)
        .set(auth(alice));
      expect(removed.status).toBe(200);
      expect(staged(removed.body)).toEqual([]);
      expect(queued(removed.body)).toEqual([films[1], films[2]]);
      expect(
        (await api.delete(`${queueUrl()}/staged/${films[0]}`).set(auth(alice))).status
      ).toBe(404);
      expect((await stage(alice, 999_999)).status).toBe(404);
      expect((await stage(dana, films[3]!)).status).toBe(403);
      expect(staged((await api.get(queueUrl()).set(auth(bob))).body)).toEqual([]);
    });

    it("never auto-picks a staged selection", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      await enqueue(first, films[0]!);
      await api
        .post(`${queueUrl()}/staged`)
        .set(auth(first))
        .send({ selection_id: films[0] });
      const missed = await tick(draft.id);
      expect(missed?.pick).toMatchObject({ pick_number: 1, outcome: "MISSED" });
    });

    it("auto-picks the first queued selection nobody has, skipping drafted rows without deleting them", async () => {
      const { draft, seats } = await started();
      expect((await pick(draft.id, onTheClock(seats, 1), films[0]!, "r-1")).status).toBe(
        201
      );
      const second = onTheClock(seats, 2);
      await enqueue(second, films[0]!);
      await enqueue(second, films[1]!);

      const result = await tick(draft.id);
      expect(result?.pick).toMatchObject({
        pick_number: 2,
        outcome: "PICKED",
        source: "AUTO",
        selection_id: films[1]
      });
      expect(result?.draft.current_pick_number).toBe(3);
      const tx = await db.pool.query<{ kind: string; actor_user_id: number | null }>(
        `SELECT t.kind, t.actor_user_id FROM circuit_transaction t
         JOIN circuit_draft_pick p ON p.id = t.draft_pick_id
         WHERE p.pick_number = 2`
      );
      expect(tx.rows).toEqual([{ kind: "DRAFT", actor_user_id: null }]);
      expect(queued((await api.get(queueUrl()).set(auth(second))).body)).toEqual([
        films[0],
        films[1]
      ]);
    });

    it("skips a queued selection that would break a category limit", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      expect((await pick(draft.id, first, actors[0]!, "r-1")).status).toBe(201);
      for (let n = 2; n <= 5; n += 1) {
        expect(
          (await pick(draft.id, onTheClock(seats, n), films[n]!, `r-${n}`)).status
        ).toBe(201);
      }
      await enqueue(first, actors[1]!);
      await enqueue(first, films[7]!);
      const result = await tick(draft.id);
      expect(result?.pick).toMatchObject({ pick_number: 6, selection_id: films[7] });
    });

    it("records MISSED and never picks outside the queue: empty, fully owned, or auto-draft off", async () => {
      const { draft, seats } = await started();
      expect((await pick(draft.id, onTheClock(seats, 1), films[0]!, "r-1")).status).toBe(
        201
      );
      await enqueue(onTheClock(seats, 2), films[0]!);
      const owned = await tick(draft.id);
      expect(owned?.pick).toMatchObject({
        pick_number: 2,
        outcome: "MISSED",
        source: "AUTO",
        selection_id: null
      });
      const empty = await tick(draft.id);
      expect(empty?.pick).toMatchObject({ pick_number: 3, outcome: "MISSED" });

      await db.pool.query(
        `UPDATE circuit_league SET auto_draft_enabled = false WHERE id = $1`,
        [circuitLeagueId]
      );
      await enqueue(onTheClock(seats, 4), films[1]!);
      const off = await tick(draft.id);
      expect(off?.pick).toMatchObject({ pick_number: 4, outcome: "MISSED" });

      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_transaction`)).toBe(1);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_ownership`)).toBe(1);
      const types = await db.pool.query<{ event_type: string }>(
        `SELECT event_type FROM circuit_draft_event WHERE draft_id = $1 ORDER BY version`,
        [draft.id]
      );
      expect(types.rows.map((r) => r.event_type)).toEqual([
        "draft.started",
        "draft.pick.made",
        "draft.pick.missed",
        "draft.pick.missed",
        "draft.pick.missed"
      ]);
    });

    it("reads the queue live: a reorder mid-draft changes the next auto-pick", async () => {
      const { draft, seats } = await started();
      const first = onTheClock(seats, 1);
      await enqueue(first, films[0]!);
      await enqueue(first, films[1]!);
      expect((await reorder(first, [films[1]!, films[0]!])).status).toBe(200);
      expect((await tick(draft.id))?.pick.selection_id).toBe(films[1]);
    });

    it("leaves the pick alone before the clock runs out, and on an untimed draft", async () => {
      const { draft, seats } = await started();
      await enqueue(onTheClock(seats, 1), films[0]!);
      expect(await tickCircuitDraft(db.pool, draft.id, new Date())).toBeNull();
      expect(await picksOf(draft.id)).toEqual([]);

      await db.pool.query(
        `UPDATE circuit_draft SET pick_timer_seconds = 0, pick_deadline_at = NULL
         WHERE id = $1`,
        [draft.id]
      );
      expect(await tick(draft.id)).toBeNull();
      expect(await picksOf(draft.id)).toEqual([]);
    });

    it("runs one supplemental pick per missed pick in original order, a chip for a second miss, then IN_SEASON", async () => {
      const { draft, seats } = await started();
      // Picks 1, 4 and 5 are missed; the rest are manual.
      const manual = async (n: number, selectionId: number) =>
        expect(
          (await pick(draft.id, onTheClock(seats, n), selectionId, `r-${n}`)).status
        ).toBe(201);
      expect((await tick(draft.id))?.pick.outcome).toBe("MISSED");
      await manual(2, films[1]!);
      await manual(3, films[2]!);
      expect((await tick(draft.id))?.pick.outcome).toBe("MISSED");
      expect((await tick(draft.id))?.pick.outcome).toBe("MISSED");
      const lastRegular = await pick(draft.id, onTheClock(seats, 6), films[5]!, "r-6");
      expect(lastRegular.body.draft).toMatchObject({
        status: "SUPPLEMENTAL",
        current_pick_number: 7
      });
      expect(await leagueStatus()).toBe("DRAFTING");

      // Pick 7 is pick 1's second chance, taken by auto-draft from the queue.
      const seatOf = (n: number) => onTheClock(seats, n);
      await enqueue(seatOf(1), films[1]!);
      await enqueue(seatOf(1), films[6]!);
      const seventh = await tick(draft.id);
      expect(seventh?.pick).toMatchObject({
        pick_number: 7,
        original_pick_number: 1,
        selection_id: films[6],
        source: "AUTO"
      });

      // Pick 8 is pick 4's, and only its member may take it.
      const notYours = await pick(draft.id, seatOf(1), films[7]!, "s-8x");
      expect(notYours.body.error.code).toBe("CIRCUIT_DRAFT_NOT_YOUR_TURN");
      const eighth = await pick(draft.id, seatOf(4), films[7]!, "s-8");
      expect(eighth.status).toBe(201);
      expect(eighth.body.pick).toMatchObject({ pick_number: 8, original_pick_number: 4 });

      // Pick 9 is pick 5's, missed again: one chip, then the draft completes.
      const ninth = await tick(draft.id);
      expect(ninth?.pick).toMatchObject({
        pick_number: 9,
        original_pick_number: 5,
        outcome: "MISSED"
      });
      const fifthMember = seats.find(
        (s) => s.seat_number === getSnakeSeatForPick(3, 5)
      )!.member_id;
      expect(ninth?.chip).toMatchObject({
        member_id: fifthMember,
        original_pick_number: 5,
        status: "AVAILABLE"
      });
      expect(ninth?.draft).toMatchObject({
        status: "COMPLETED",
        current_pick_number: null
      });
      expect(await leagueStatus()).toBe("IN_SEASON");
      const chips = await db.pool.query(
        `SELECT member_id::int, original_pick_number FROM circuit_chip`
      );
      expect(chips.rows).toEqual([{ member_id: fifthMember, original_pick_number: 5 }]);
      expect(await tick(draft.id)).toBeNull();

      const picks = await picksOf(draft.id);
      expect(
        picks.map((p) => [p.pick_number, p.original_pick_number, p.outcome])
      ).toEqual([
        [1, 1, "MISSED"],
        [2, 2, "PICKED"],
        [3, 3, "PICKED"],
        [4, 4, "MISSED"],
        [5, 5, "MISSED"],
        [6, 6, "PICKED"],
        [7, 1, "PICKED"],
        [8, 4, "PICKED"],
        [9, 5, "MISSED"]
      ]);
      // Every pick wrote one interval and one transaction; the second chances
      // are SUPPLEMENTAL.
      const kinds = await db.pool.query<{ pick_number: number; kind: string; n: number }>(
        `SELECT p.pick_number, t.kind,
                (SELECT COUNT(*)::int FROM circuit_ownership o
                 WHERE o.acquired_transaction_id = t.id) AS n
         FROM circuit_draft_pick p
         JOIN circuit_transaction t ON t.draft_pick_id = p.id
         ORDER BY p.pick_number`
      );
      expect(kinds.rows).toEqual([
        { pick_number: 2, kind: "DRAFT", n: 1 },
        { pick_number: 3, kind: "DRAFT", n: 1 },
        { pick_number: 6, kind: "DRAFT", n: 1 },
        { pick_number: 7, kind: "SUPPLEMENTAL", n: 1 },
        { pick_number: 8, kind: "SUPPLEMENTAL", n: 1 }
      ]);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_transaction`)).toBe(5);
    });

    it("is resolved by the draft sweeper once the clock runs out", async () => {
      const { draft, seats } = await started();
      await enqueue(onTheClock(seats, 1), films[0]!);
      await db.pool.query(
        `UPDATE circuit_draft SET pick_deadline_at = now() - interval '1 second'
         WHERE id = $1`,
        [draft.id]
      );
      const sweeper = startDraftSweeper(db.pool, [circuitDraftSweeperPass]);
      try {
        await vi.waitFor(async () => expect(await picksOf(draft.id)).toHaveLength(1), {
          timeout: 5000,
          interval: 50
        });
      } finally {
        await sweeper.stop();
      }
      expect((await picksOf(draft.id))[0]).toMatchObject({
        pick_number: 1,
        outcome: "PICKED",
        source: "AUTO",
        selection_id: films[0]
      });
    });

    it("lets the league owner pause and resume, keeping the time that was left", async () => {
      const { draft } = await started();
      const deadline = new Date(draft.pick_deadline_at!).getTime();
      const pause = (user: User) =>
        api.post(`/circuit-drafts/${draft.id}/pause`).set(auth(user)).send();
      const resume = (user: User) =>
        api.post(`/circuit-drafts/${draft.id}/resume`).set(auth(user)).send();

      expect((await pause(bob)).status).toBe(403);
      const paused = await pause(alice);
      expect(paused.status).toBe(200);
      expect(paused.body.draft.status).toBe("PAUSED");
      expect((await pause(alice)).body.error.code).toBe("CIRCUIT_DRAFT_PAUSED");
      expect(await tick(draft.id)).toBeNull();

      const pausedAt = new Date(paused.body.draft.paused_at).getTime();
      const resumed = await resume(alice);
      expect(resumed.status).toBe(200);
      expect(resumed.body.draft).toMatchObject({
        status: "IN_PROGRESS",
        current_pick_number: 1,
        paused_at: null
      });
      const left = deadline - pausedAt;
      const newDeadline = new Date(resumed.body.draft.pick_deadline_at).getTime();
      expect(newDeadline - Date.now()).toBeLessThanOrEqual(left);
      expect(newDeadline - Date.now()).toBeGreaterThan(left - 5000);
      expect((await resume(alice)).body.error.code).toBe("CIRCUIT_DRAFT_NOT_PAUSED");
    });

    it("resumes in the supplemental round once the regular rounds are over", async () => {
      const { draft, seats } = await started();
      expect((await tick(draft.id))?.pick.outcome).toBe("MISSED");
      for (let n = 2; n <= 6; n += 1) {
        expect(
          (await pick(draft.id, onTheClock(seats, n), films[n]!, `r-${n}`)).status
        ).toBe(201);
      }
      const url = `/circuit-drafts/${draft.id}`;
      expect((await api.post(`${url}/pause`).set(auth(alice)).send()).status).toBe(200);
      const resumed = await api.post(`${url}/resume`).set(auth(alice)).send();
      expect(resumed.body.draft).toMatchObject({
        status: "SUPPLEMENTAL",
        current_pick_number: 7
      });
    });

    it("defaults the clock to 90 seconds", async () => {
      const { draft } = await started();
      expect(draft.pick_timer_seconds).toBe(90);
      const wait = new Date(draft.pick_deadline_at!).getTime() - Date.now();
      expect(wait).toBeLessThanOrEqual(90_000);
      expect(wait).toBeGreaterThan(80_000);
    });
  });

  describe("schema", () => {
    async function seededPick() {
      const { draft, seats } = await started();
      const res = await pick(draft.id, onTheClock(seats, 1), films[0]!, "s");
      expect(res.status).toBe(201);
      return { draft, seat: seats[0]!, pickId: res.body.pick.id as number };
    }

    it("refuses a second pick of one selection in a draft", async () => {
      const { draft, seat } = await seededPick();
      const code = await pgErrorCode(
        db.pool.query(
          `INSERT INTO circuit_draft_pick
             (draft_id, pick_number, original_pick_number, seat_number, member_id,
              outcome, selection_id, source)
           VALUES ($1, 2, 2, $2, $3, 'PICKED', $4, 'AUTO')`,
          [draft.id, seat.seat_number, seat.member_id, films[0]]
        )
      );
      expect(code).toBe("23505");
    });

    it("ties a selection to PICKED and a request id to MANUAL", async () => {
      const { draft, seat } = await seededPick();
      const insert = (
        outcome: string,
        selection: number | null,
        source: string,
        req: string | null
      ) =>
        pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_draft_pick
               (draft_id, pick_number, original_pick_number, seat_number, member_id,
                outcome, selection_id, source, request_id)
             VALUES ($1, 9, 9, $2, $3, $4, $5, $6, $7)`,
            [draft.id, seat.seat_number, seat.member_id, outcome, selection, source, req]
          )
        );
      expect(await insert("MISSED", films[1]!, "AUTO", null)).toBe("23514");
      expect(await insert("PICKED", null, "AUTO", null)).toBe("23514");
      expect(await insert("PICKED", films[1]!, "MANUAL", null)).toBe("23514");
      expect(await insert("MISSED", null, "AUTO", null)).toBeNull();
    });

    it("allows one supplemental pick per missed pick", async () => {
      const { draft, seat } = await seededPick();
      const supplemental = (pickNumber: number) =>
        pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_draft_pick
               (draft_id, pick_number, original_pick_number, seat_number, member_id,
                outcome, source)
             VALUES ($1, $2, 1, $3, $4, 'MISSED', 'AUTO')`,
            [draft.id, pickNumber, seat.seat_number, seat.member_id]
          )
        );
      expect(await supplemental(7)).toBeNull();
      expect(await supplemental(8)).toBe("23505");
    });

    it("keeps one chip per original pick in a league", async () => {
      const { seats } = await started();
      const chip = (memberId: number) =>
        pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number)
             VALUES ($1, $2, 4)`,
            [circuitLeagueId, memberId]
          )
        );
      expect(await chip(seats[0]!.member_id)).toBeNull();
      expect(await chip(seats[1]!.member_id)).toBe("23505");
    });

    it("keeps queue positions unique per member once the transaction ends", async () => {
      const { seats } = await started();
      const memberId = seats[0]!.member_id;
      const code = await pgErrorCode(
        db.pool.query(
          `INSERT INTO circuit_queue_item (member_id, selection_id, position)
           VALUES ($1, $2, 1), ($1, $3, 1)`,
          [memberId, films[0], films[1]]
        )
      );
      expect(code).toBe("23505");
    });

    it("keeps a draft transaction's member and selection equal to its pick's, once per pick", async () => {
      const { draft, seat, pickId } = await seededPick();
      const seats = await db.pool.query<{ seat_number: number; member_id: number }>(
        `SELECT seat_number, member_id::int FROM circuit_draft_seat
         WHERE draft_id = $1 ORDER BY seat_number`,
        [draft.id]
      );
      const next = seats.rows[1]!;
      // A pick with no transaction yet, as auto-draft would write it.
      const unpaired = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_draft_pick
           (draft_id, pick_number, original_pick_number, seat_number, member_id,
            outcome, selection_id, source)
         VALUES ($1, 2, 2, $2, $3, 'PICKED', $4, 'AUTO') RETURNING id::int`,
        [draft.id, next.seat_number, next.member_id, films[1]]
      );
      const transaction = (memberId: number, selectionId: number, draftPickId: number) =>
        pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_transaction
               (circuit_league_id, member_id, kind, add_selection_id, draft_pick_id)
             VALUES ($1, $2, 'DRAFT', $3, $4)`,
            [circuitLeagueId, memberId, selectionId, draftPickId]
          )
        );
      const unpairedId = unpaired.rows[0]!.id;
      expect(await transaction(seat.member_id, films[1]!, unpairedId)).toBe("23503");
      expect(await transaction(next.member_id, films[2]!, unpairedId)).toBe("23503");
      expect(await transaction(seat.member_id, films[0]!, pickId)).toBe("23505");
      expect(await transaction(next.member_id, films[1]!, unpairedId)).toBeNull();
    });

    it("seats only members of the draft's league", async () => {
      const { draft } = await started();
      const otherLeague = await insertLeague(db.pool, { created_by_user_id: bob.id });
      const otherCircuitLeague = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league (circuit_id, league_id, created_by_user_id)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [circuitId, otherLeague.id, bob.id]
      );
      const stranger = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id)
         VALUES ($1, $2) RETURNING id::int`,
        [otherCircuitLeague.rows[0]!.id, outsider.id]
      );
      const code = await pgErrorCode(
        db.pool.query(
          `INSERT INTO circuit_draft_seat (draft_id, circuit_league_id, seat_number, member_id)
           VALUES ($1, $2, 4, $3)`,
          [draft.id, circuitLeagueId, stranger.rows[0]!.id]
        )
      );
      expect(code).toBe("23503");
    });
  });
});
