import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runInTransaction } from "../../../src/data/db.js";
import { getCircuitLeagueById } from "../../../src/data/repositories/circuitLeagueRepository.js";
import { instantOfDay } from "../../../src/domain/circuit.js";
import {
  addCircuitFreeAgent,
  applyOwnershipChange,
  dropCircuitSelection
} from "../../../src/services/circuit/circuitOwnership.js";
import { createServer } from "../../../src/server.js";
import {
  registerCircuitWaiverEventEmitter,
  type CircuitWaiverResultMessage
} from "../../../src/services/circuit/circuitWaiverEvents.js";
import { processCircuitWaiverWindow } from "../../../src/services/circuit/circuitWaiverProcessor.js";
import {
  checkCircuitWaivers,
  runDueCircuitWaivers
} from "../../../src/services/circuit/circuitWaiverScheduler.js";
import {
  createCircuitWaiverClaim,
  updateCircuitWaiverClaimFor
} from "../../../src/services/circuit/circuitWaivers.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertUser
} from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";

const AUTH_SECRET = "test-secret";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const HOUR_MS = 60 * 60 * 1000;

type User = { id: number; username: string };

// Two waiver windows: Dec 4-6 (resolves Dec 7) and Dec 10-12 (resolves
// Dec 13). The ceremonies' results, in March, are the later occasions.
const W1 = { starts_on: "2026-12-04", ends_on: "2026-12-06", resolves_on: "2026-12-07" };
const W2 = { starts_on: "2026-12-10", ends_on: "2026-12-12", resolves_on: "2026-12-13" };
const IN_W1 = new Date(instantOfDay("2026-12-05").getTime() + 12 * HOUR_MS);
const AFTER_W1 = new Date(instantOfDay(W1.resolves_on).getTime() + 60_000);
const BEFORE_W1 = new Date("2026-12-01T20:00:00Z");

function auth(user: { id: number; username: string }) {
  const token = signTestToken(
    { sub: String(user.id), username: user.username },
    AUTH_SECRET
  );
  return { Authorization: `Bearer ${token}` };
}

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

describe("circuit waiver processing", () => {
  let alice: User;
  let bob: User;
  let carol: User;
  let circuitLeagueId: number;
  let pictureId: number;
  const memberIds = new Map<number, number>();
  let films: number[];

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
    memberIds.clear();
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });
    carol = await insertUser(db.pool, { username: "carol" });
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    for (const user of [alice, bob, carol]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }

    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    const circuitId = circuit.rows[0]!.id;
    const event = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
       VALUES ($1, 'awards', 'Awards', 0) RETURNING id::int`,
      [circuitId]
    );
    const eventId = event.rows[0]!.id;
    for (const [i, nominationsOn] of [W1.starts_on, W2.starts_on].entries()) {
      const ceremony = await insertCeremony(db.pool, {}, false);
      await db.pool.query(
        `UPDATE ceremony SET status = 'ACTIVE', nominations_on = $2::date, starts_at = $3
         WHERE id = $1`,
        [ceremony.id, nominationsOn, new Date(`2027-03-0${i + 1}T20:00:00Z`)]
      );
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
         VALUES ($1, $2, $3, $4)`,
        [circuitId, ceremony.id, eventId, i]
      );
    }
    const category = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [circuitId]
    );
    pictureId = category.rows[0]!.id;

    const created = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_league
         (circuit_id, league_id, status, roster_size, initialized_at, created_by_user_id)
       VALUES ($1, $2, 'IN_SEASON', 3, now(), $3) RETURNING id::int`,
      [circuitId, league.id, alice.id]
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
       VALUES ($1, $2, $3, NULL)`,
      [circuitLeagueId, circuitId, pictureId]
    );
    // Priority: carol 1, bob 2, alice 3.
    let priority = 3;
    for (const user of [alice, bob, carol]) {
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id, waiver_priority)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [circuitLeagueId, user.id, priority]
      );
      priority -= 1;
      memberIds.set(user.id, rows[0]!.id);
    }
    await completeDraftAt(BEFORE_W1);

    films = [];
    for (let i = 0; i < 10; i += 1) {
      const film = await insertFilm(db.pool);
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_selection (circuit_category_id, film_tmdb_id, film_id)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [pictureId, film.id, film.id]
      );
      films.push(rows[0]!.id);
    }
  });

  async function completeDraftAt(at: Date) {
    await db.pool.query(
      `INSERT INTO circuit_draft (circuit_league_id, status, rounds, started_at, completed_at)
       VALUES ($1, 'COMPLETED', 3, $2, $2)
       ON CONFLICT (circuit_league_id) DO UPDATE
       SET started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at`,
      [circuitLeagueId, at]
    );
  }

  const viewer = (user: User) => ({ userId: user.id, isSuperAdmin: false });

  async function give(user: User, ...selectionIds: number[]) {
    for (const selectionId of selectionIds) {
      await runInTransaction(db.pool, async (tx) => {
        const league = (await getCircuitLeagueById(tx, circuitLeagueId))!;
        await applyOwnershipChange(tx, league, {
          kind: "FREE_AGENT",
          memberId: memberIds.get(user.id)!,
          addSelectionId: selectionId,
          dropSelectionId: null,
          actorUserId: user.id
        });
      });
    }
  }

  async function chipFor(user: User, originalPickNumber: number) {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number)
       VALUES ($1, $2, $3) RETURNING id::int`,
      [circuitLeagueId, memberIds.get(user.id)!, originalPickNumber]
    );
    return rows[0]!.id;
  }

  /** Files a claim in window 1 and returns its id. */
  async function claim(
    user: User,
    selectionId: number,
    opts: { drop?: number; chip?: number; at?: Date } = {}
  ) {
    const result = await createCircuitWaiverClaim(
      db.pool,
      circuitLeagueId,
      viewer(user),
      {
        selectionId,
        dropSelectionId: opts.drop ?? null,
        chipId: opts.chip ?? null
      },
      opts.at ?? IN_W1
    );
    return result.claims.find((c) => c.selection.id === selectionId)!.id;
  }

  async function outcome(claimId: number) {
    const { rows } = await db.pool.query<{
      status: string;
      failure_reason: string | null;
    }>(`SELECT status, failure_reason FROM circuit_waiver_claim WHERE id = $1`, [
      claimId
    ]);
    const row = rows[0]!;
    return row.failure_reason ?? row.status;
  }

  async function rosterOf(user: User) {
    const { rows } = await db.pool.query<{ selection_id: number }>(
      `SELECT selection_id::int FROM circuit_ownership
       WHERE member_id = $1 AND released_at IS NULL ORDER BY selection_id`,
      [memberIds.get(user.id)!]
    );
    return rows.map((r) => r.selection_id);
  }

  async function priorities() {
    const { rows } = await db.pool.query<{ user_id: number; waiver_priority: number }>(
      `SELECT user_id::int, waiver_priority FROM circuit_league_member
       WHERE circuit_league_id = $1 ORDER BY waiver_priority`,
      [circuitLeagueId]
    );
    return rows.map((r) => r.user_id);
  }

  async function chipStatus(chipId: number) {
    const { rows } = await db.pool.query<{
      status: string;
      consumed_claim_id: number | null;
    }>(`SELECT status, consumed_claim_id::int FROM circuit_chip WHERE id = $1`, [chipId]);
    return rows[0]!;
  }

  const runW1 = () => processCircuitWaiverWindow(db.pool, circuitLeagueId, W1);

  it("runs chipped claims first by pick number, then by rolling priority", async () => {
    const aliceChip = await chipFor(alice, 7);
    const bobChip = await chipFor(bob, 4);
    const carolOnFive = await claim(carol, films[5]!);
    const aliceOnFive = await claim(alice, films[5]!, { chip: aliceChip });
    const bobOnFive = await claim(bob, films[5]!, { chip: bobChip });
    const aliceOnSix = await claim(alice, films[6]!);
    const carolOnSix = await claim(carol, films[6]!);

    const result = await runW1();

    expect(result).toMatchObject({ won: 2, lost: 3 });
    expect(await outcome(bobOnFive)).toBe("WON");
    expect(await outcome(aliceOnFive)).toBe("SELECTION_OWNED");
    expect(await outcome(carolOnFive)).toBe("SELECTION_OWNED");
    expect(await outcome(carolOnSix)).toBe("WON");
    expect(await outcome(aliceOnSix)).toBe("SELECTION_OWNED");
  });

  it("writes wins as WAIVER transactions and evaluates each claim on the state before it", async () => {
    await give(carol, films[0]!);
    const first = await claim(carol, films[3]!);
    const second = await claim(carol, films[4]!);
    const third = await claim(carol, films[5]!);
    const bobsFirst = await claim(bob, films[3]!);

    await runW1();

    expect(await outcome(first)).toBe("WON");
    expect(await outcome(second)).toBe("WON");
    expect(await outcome(third)).toBe("ROSTER_FULL");
    expect(await outcome(bobsFirst)).toBe("SELECTION_OWNED");
    expect(await rosterOf(carol)).toEqual([films[0], films[3], films[4]]);
    const { rows } = await db.pool.query(
      `SELECT kind, claim_id::int, add_selection_id::int, actor_user_id
       FROM circuit_transaction WHERE kind = 'WAIVER' ORDER BY id`
    );
    expect(rows).toEqual([
      {
        kind: "WAIVER",
        claim_id: first,
        add_selection_id: films[3],
        actor_user_id: null
      },
      {
        kind: "WAIVER",
        claim_id: second,
        add_selection_id: films[4],
        actor_user_id: null
      }
    ]);
  });

  it("fails the second of two claims naming the same drop", async () => {
    await give(alice, films[0]!, films[1]!, films[2]!);
    const first = await claim(alice, films[3]!, { drop: films[0]! });
    const second = await claim(alice, films[4]!, { drop: films[0]! });

    await runW1();

    expect(await outcome(first)).toBe("WON");
    expect(await outcome(second)).toBe("DROP_NOT_OWNED");
    expect(await rosterOf(alice)).toEqual([films[1], films[2], films[3]]);
  });

  it("fails a claim without a drop at capacity and wins it with space", async () => {
    await give(alice, films[0]!, films[1]!, films[2]!);
    await give(bob, films[3]!);
    const full = await claim(alice, films[5]!);
    const roomy = await claim(bob, films[6]!);

    await runW1();

    expect(await outcome(full)).toBe("ROSTER_FULL");
    expect(await outcome(roomy)).toBe("WON");
    expect(await rosterOf(alice)).toEqual([films[0], films[1], films[2]]);
  });

  it("fails a claim past a category limit", async () => {
    await db.pool.query(
      `UPDATE circuit_league_category SET max_owned = 1 WHERE circuit_league_id = $1`,
      [circuitLeagueId]
    );
    await give(alice, films[0]!);
    const limited = await claim(alice, films[5]!);
    await runW1();
    expect(await outcome(limited)).toBe("CATEGORY_LIMIT");
  });

  it("keeps a failed claim's chip and roster, and consumes a winner's chip", async () => {
    // A draft that completed inside window 1: its chips outlive that window.
    await completeDraftAt(IN_W1);
    await give(alice, films[0]!);
    const losingChip = await chipFor(alice, 2);
    const winningChip = await chipFor(alice, 5);
    const lost = await claim(alice, films[5]!, { chip: losingChip });
    const won = await claim(alice, films[6]!, { chip: winningChip });
    // Taken after the claim was filed, so the claim fails at the run.
    await give(bob, films[5]!);

    const result = await runW1();

    expect(result).toMatchObject({ won: 1, lost: 1, chips_expired: 0 });
    expect(await outcome(lost)).toBe("SELECTION_OWNED");
    expect(await chipStatus(losingChip)).toEqual({
      status: "AVAILABLE",
      consumed_claim_id: null
    });
    expect(await chipStatus(winningChip)).toEqual({
      status: "CONSUMED",
      consumed_claim_id: won
    });
    expect(await rosterOf(alice)).toEqual([films[0], films[6]]);
    expect(await rosterOf(bob)).toEqual([films[5]]);
  });

  it("moves a member with several wins to the bottom once and ignores failures", async () => {
    await give(alice, films[0]!, films[1]!, films[2]!);
    await claim(carol, films[5]!);
    await claim(carol, films[6]!);
    await claim(alice, films[7]!);

    expect(await priorities()).toEqual([carol.id, bob.id, alice.id]);
    const result = await runW1();
    expect(await priorities()).toEqual([bob.id, alice.id, carol.id]);

    const { rows } = await db.pool.query(
      `SELECT status, priority_before, priority_after FROM circuit_waiver_run WHERE id = $1`,
      [result!.run_id]
    );
    const [c, b, a] = [carol, bob, alice].map((u) => memberIds.get(u.id)!);
    expect(rows[0]).toEqual({
      status: "COMPLETED",
      priority_before: [
        { member_id: c, waiver_priority: 1 },
        { member_id: b, waiver_priority: 2 },
        { member_id: a, waiver_priority: 3 }
      ],
      priority_after: [
        { member_id: b, waiver_priority: 1 },
        { member_id: a, waiver_priority: 2 },
        { member_id: c, waiver_priority: 3 }
      ]
    });
  });

  it("leaves priority alone when every claim fails", async () => {
    await give(alice, films[0]!, films[1]!, films[2]!);
    await claim(alice, films[5]!);
    await runW1();
    expect(await priorities()).toEqual([carol.id, bob.id, alice.id]);
  });

  describe("chip expiry (question 12)", () => {
    it("expires every available chip when the first window after the draft resolves", async () => {
      const unused = await chipFor(bob, 1);
      const onLoser = await chipFor(alice, 2);
      const onWinner = await chipFor(carol, 3);
      await claim(alice, films[5]!, { chip: onLoser });
      const won = await claim(carol, films[6]!, { chip: onWinner });
      await give(bob, films[5]!);

      const result = await runW1();

      expect(result).toMatchObject({ won: 1, lost: 1, chips_expired: 2 });
      expect((await chipStatus(unused)).status).toBe("EXPIRED");
      expect((await chipStatus(onLoser)).status).toBe("EXPIRED");
      expect(await chipStatus(onWinner)).toEqual({
        status: "CONSUMED",
        consumed_claim_id: won
      });
    });

    it("waits for the next window when the draft completed inside the first", async () => {
      await completeDraftAt(IN_W1);
      const chip = await chipFor(bob, 1);

      expect(await runW1()).toMatchObject({ chips_expired: 0 });
      expect((await chipStatus(chip)).status).toBe("AVAILABLE");

      const second = await processCircuitWaiverWindow(db.pool, circuitLeagueId, W2);
      expect(second).toMatchObject({ chips_expired: 1 });
      expect((await chipStatus(chip)).status).toBe("EXPIRED");
    });

    it("skips windows that resolved before the draft completed", async () => {
      await completeDraftAt(new Date(instantOfDay("2026-12-08").getTime()));
      const chip = await chipFor(bob, 1);
      const results = await runDueCircuitWaivers(
        db.pool,
        new Date("2026-12-20T00:00:00Z")
      );
      expect(results.map((r) => r.window_starts_on)).toEqual([W2.starts_on]);
      expect(results[0]).toMatchObject({ chips_expired: 1 });
      expect((await chipStatus(chip)).status).toBe("EXPIRED");
    });
  });

  it("refuses claim edits once the processor has run the window", async () => {
    await give(alice, films[0]!);
    const id = await claim(alice, films[5]!);
    await runW1();
    expect(
      await errorCode(
        updateCircuitWaiverClaimFor(
          db.pool,
          circuitLeagueId,
          viewer(alice),
          id,
          { dropSelectionId: films[0]! },
          IN_W1
        )
      )
    ).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
  });

  it("treats a re-run of a completed window as a no-op", async () => {
    await claim(carol, films[5]!);
    expect(await runW1()).toMatchObject({ won: 1 });
    const snapshot = async () =>
      (
        await db.pool.query(
          `SELECT
             (SELECT count(*) FROM circuit_transaction)::int AS transactions,
             (SELECT count(*) FROM circuit_waiver_run)::int AS runs,
             (SELECT json_agg(waiver_priority ORDER BY id) FROM circuit_league_member)
               AS priority`
        )
      ).rows[0];
    const before = await snapshot();

    expect(await runW1()).toBeNull();
    expect(await runDueCircuitWaivers(db.pool, AFTER_W1)).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  describe("the scheduler", () => {
    it("does nothing before a window resolves", async () => {
      await claim(carol, films[5]!);
      expect(await checkCircuitWaivers(db.pool, IN_W1)).toEqual([]);
    });

    it("runs a window on the first check after its resolution instant", async () => {
      const id = await claim(carol, films[5]!);
      const results = await checkCircuitWaivers(db.pool, AFTER_W1);
      expect(results).toMatchObject([
        { circuit_league_id: circuitLeagueId, window_starts_on: W1.starts_on, won: 1 }
      ]);
      expect(await outcome(id)).toBe("WON");
    });

    it("catches up on windows missed during downtime, oldest first", async () => {
      const first = await claim(carol, films[5]!);
      const results = await checkCircuitWaivers(
        db.pool,
        new Date("2026-12-20T00:00:00Z")
      );
      expect(results!.map((r) => r.window_starts_on)).toEqual([
        W1.starts_on,
        W2.starts_on
      ]);
      expect(await outcome(first)).toBe("WON");
    });

    it("leaves the work to the instance holding its advisory lock", async () => {
      await claim(carol, films[5]!);
      const other = await db.pool.connect();
      try {
        await other.query("SELECT pg_advisory_lock(923701145)");
        expect(await checkCircuitWaivers(db.pool, AFTER_W1)).toBeNull();
        await other.query("SELECT pg_advisory_unlock(923701145)");
      } finally {
        other.release();
      }
      expect(await checkCircuitWaivers(db.pool, AFTER_W1)).toHaveLength(1);
    });
  });

  describe("free agency around a window", () => {
    it("drops at once during a window", async () => {
      await give(alice, films[0]!, films[1]!);
      await dropCircuitSelection(
        db.pool,
        circuitLeagueId,
        viewer(alice),
        films[0]!,
        IN_W1
      );
      expect(await rosterOf(alice)).toEqual([films[1]]);
    });

    it("refuses adds during the window and until its run, then reopens", async () => {
      const add = (at: Date) =>
        addCircuitFreeAgent(
          db.pool,
          circuitLeagueId,
          viewer(bob),
          { selectionId: films[8]!, dropSelectionId: null },
          at
        );
      expect(await errorCode(add(IN_W1))).toBe("CIRCUIT_WAIVER_WINDOW_OPEN");
      expect(await errorCode(add(AFTER_W1))).toBe("CIRCUIT_WAIVER_WINDOW_OPEN");
      await runW1();
      expect(await errorCode(add(AFTER_W1))).toBeNull();
      expect(await rosterOf(bob)).toEqual([films[8]]);
    });
  });

  describe("results", () => {
    const results = (user: User) =>
      api.get(`/circuit-leagues/${circuitLeagueId}/waivers/results`).set(auth(user));

    afterEach(() => registerCircuitWaiverEventEmitter(null));

    it("shows the league each run's claims in evaluation order, never a pending one", async () => {
      const bobChip = await chipFor(bob, 4);
      await give(alice, films[0]!, films[1]!, films[2]!);
      const aliceFull = await claim(alice, films[7]!);
      const carolOnFive = await claim(carol, films[5]!);
      const bobOnFive = await claim(bob, films[5]!, { chip: bobChip });

      expect((await results(carol)).body).toEqual({ runs: [] });
      await runW1();
      // Filed in the next window, so still pending.
      const pending = await claim(bob, films[8]!, {
        at: new Date(instantOfDay("2026-12-11").getTime())
      });

      const res = await results(carol);
      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(1);
      const [run] = res.body.runs;
      expect(run).toMatchObject({
        window: { starts_on: W1.starts_on, ends_on: W1.ends_on },
        priority_before: [
          { username: "carol", waiver_priority: 1 },
          { username: "bob", waiver_priority: 2 },
          { username: "alice", waiver_priority: 3 }
        ],
        priority_after: [
          { username: "carol", waiver_priority: 1 },
          { username: "alice", waiver_priority: 2 },
          { username: "bob", waiver_priority: 3 }
        ]
      });
      expect(
        run.claims.map((c: Record<string, unknown>) => ({
          id: c.id,
          order: c.order,
          member: (c.member as { username: string }).username,
          status: c.status,
          failure_reason: c.failure_reason,
          chip: c.chip
        }))
      ).toEqual([
        {
          id: bobOnFive,
          order: 1,
          member: "bob",
          status: "WON",
          failure_reason: null,
          chip: { original_pick_number: 4 }
        },
        {
          id: carolOnFive,
          order: 2,
          member: "carol",
          status: "LOST",
          failure_reason: "SELECTION_OWNED",
          chip: null
        },
        {
          id: aliceFull,
          order: 3,
          member: "alice",
          status: "LOST",
          failure_reason: "ROSTER_FULL",
          chip: null
        }
      ]);
      expect(run.claims[0].selection.id).toBe(films[5]);
      expect(JSON.stringify(res.body)).not.toContain(`"id":${pending},`);
      // The same for every member, and for nobody outside the league.
      expect((await results(alice)).body).toEqual(res.body);
      const outsider = await insertUser(db.pool, { username: "outsider" });
      expect((await results(outsider)).status).toBe(404);
    });

    it("tells the league once a run commits, and not on a repeat", async () => {
      const heard: CircuitWaiverResultMessage[] = [];
      registerCircuitWaiverEventEmitter((message) => heard.push(message));
      await claim(carol, films[5]!);

      const result = await runW1();
      expect(await runW1()).toBeNull();

      expect(heard).toHaveLength(1);
      expect(heard[0]).toMatchObject({ ...result, circuit_league_id: circuitLeagueId });
      expect(typeof heard[0]!.server_time).toBe("string");
    });
  });
});
