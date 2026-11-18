import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { runInTransaction } from "../../../src/data/db.js";
import { getCircuitLeagueById } from "../../../src/data/repositories/circuitLeagueRepository.js";
import { instantOfDay, resultsDateOf } from "../../../src/domain/circuit.js";
import { applyOwnershipChange } from "../../../src/services/circuit/circuitOwnership.js";
import {
  updateCircuitWaiverClaimFor,
  withdrawCircuitWaiverClaimFor
} from "../../../src/services/circuit/circuitWaivers.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

type User = { id: number; username: string };
type Claims = {
  window: { starts_on: string; ends_on: string; resolves_on: string } | null;
  locked: boolean;
  claims: Array<{
    id: number;
    rank: number;
    status: string;
    selection: { id: number };
    drop: { id: number } | null;
    chip: { id: number; original_pick_number: number } | null;
  }>;
  chips: Array<{ id: number; status: string; claim_id: number | null }>;
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

describe("circuit waiver claims", () => {
  let alice: User;
  let bob: User;
  let carol: User;
  let dana: User;
  let outsider: User;
  let ceremonyId: number;
  let circuitLeagueId: number;
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
    dana = await insertUser(db.pool, { username: "dana" });
    outsider = await insertUser(db.pool, { username: "outsider" });
    const league = await insertLeague(db.pool, { created_by_user_id: alice.id });
    for (const user of [alice, bob, carol, dana]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }

    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ('awards', 'Awards', 'ACTIVE', now()) RETURNING id::int`
    );
    const circuitId = circuit.rows[0]!.id;
    const event = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
       VALUES ($1, 'oscars', 'Oscars', 0) RETURNING id::int`,
      [circuitId]
    );
    const eventId = event.rows[0]!.id;
    ceremonyId = (await insertCeremony(db.pool, {}, false)).id;
    // Undated: no scoring days, so no waiver window until a test opens one.
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
    const category = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [circuitId]
    );
    const picture = category.rows[0]!.id;

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
      [circuitLeagueId, circuitId, picture]
    );
    // dana is in the league but not in this season.
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

    films = [];
    for (let i = 0; i < 8; i += 1) {
      const film = await insertFilm(db.pool);
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_selection (circuit_category_id, film_tmdb_id, film_id)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [picture, film.id, film.id]
      );
      films.push(rows[0]!.id);
    }
  });

  /** Gives a member a selection, as an earlier free-agent add would have. */
  async function give(user: User, selectionId: number) {
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

  async function chipFor(user: User, originalPickNumber: number) {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_chip (circuit_league_id, member_id, original_pick_number)
       VALUES ($1, $2, $3) RETURNING id::int`,
      [circuitLeagueId, memberIds.get(user.id)!, originalPickNumber]
    );
    return rows[0]!.id;
  }

  const today = () => resultsDateOf(new Date())!;

  async function openWindowToday() {
    // Nominations today (Pacific) open a window over today and the next two
    // days; the ceremony, far off, is the final occasion.
    await db.pool.query(
      `UPDATE ceremony SET nominations_on = $2::date, starts_at = $3 WHERE id = $1`,
      [ceremonyId, today(), new Date(Date.now() + 60 * DAY_MS)]
    );
  }

  async function startRun(windowStartsOn: string) {
    await db.pool.query(
      `INSERT INTO circuit_waiver_run
         (circuit_league_id, window_starts_on, window_ends_on, priority_before)
       VALUES ($1, $2::date, $2::date + 2, '[]'::jsonb)`,
      [circuitLeagueId, windowStartsOn]
    );
  }

  const base = () => `/circuit-leagues/${circuitLeagueId}`;
  const claim = (
    user: User,
    body: { selection_id: number; drop_selection_id?: number; chip_id?: number }
  ) => api.post(`${base()}/claims`).set(auth(user)).send(body);
  const edit = (
    user: User,
    claimId: number,
    body: { drop_selection_id?: number | null; chip_id?: number | null }
  ) => api.patch(`${base()}/claims/${claimId}`).set(auth(user)).send(body);
  const withdraw = (user: User, claimId: number) =>
    api.delete(`${base()}/claims/${claimId}`).set(auth(user));
  const rank = (user: User, claimIds: number[]) =>
    api.put(`${base()}/claims`).set(auth(user)).send({ claim_ids: claimIds });
  const claimsOf = async (user: User) => {
    const res = await api.get(`${base()}/claims`).set(auth(user));
    expect(res.status).toBe(200);
    return res.body as Claims;
  };

  describe("outside a window", () => {
    it("refuses claims and lists none", async () => {
      const res = await claim(alice, { selection_id: films[0]! });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_WAIVER_WINDOW_CLOSED");
      expect(await claimsOf(alice)).toEqual({
        window: null,
        locked: false,
        claims: [],
        chips: []
      });
    });

    it("refuses claims before the season is in play", async () => {
      await openWindowToday();
      await db.pool.query(`UPDATE circuit_league SET status = 'DRAFTING' WHERE id = $1`, [
        circuitLeagueId
      ]);
      const res = await claim(alice, { selection_id: films[0]! });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_LEAGUE_NOT_IN_SEASON");
    });
  });

  describe("in a window", () => {
    beforeEach(async () => {
      await give(alice, films[0]!);
      await give(bob, films[1]!);
      await openWindowToday();
    });

    it("files ranked claims in the open window, with an optional drop and chip", async () => {
      const chip = await chipFor(alice, 4);
      const first = await claim(alice, { selection_id: films[2]! });
      expect(first.status).toBe(201);
      const res = await claim(alice, {
        selection_id: films[3]!,
        drop_selection_id: films[0]!,
        chip_id: chip
      });
      expect(res.status).toBe(201);
      const body = res.body as Claims;
      expect(body.window?.starts_on).toBe(today());
      expect(body.locked).toBe(false);
      expect(
        body.claims.map((c) => [c.rank, c.status, c.selection.id, c.drop?.id ?? null])
      ).toEqual([
        [1, "PENDING", films[2], null],
        [2, "PENDING", films[3], films[0]]
      ]);
      expect(body.claims[1]!.chip).toEqual({ id: chip, original_pick_number: 4 });
      expect(body.chips).toEqual([
        {
          id: chip,
          original_pick_number: 4,
          status: "AVAILABLE",
          claim_id: body.claims[1]!.id
        }
      ]);
      expect(await claimsOf(alice)).toEqual(body);
    });

    it("keeps one live claim per selection, and a withdrawn one frees it", async () => {
      const first = await claim(alice, { selection_id: films[2]! });
      const again = await claim(alice, { selection_id: films[2]! });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("CIRCUIT_WAIVER_CLAIM_EXISTS");
      // Another member may claim the same selection.
      expect((await claim(bob, { selection_id: films[2]! })).status).toBe(201);

      expect((await withdraw(alice, first.body.claims[0].id)).status).toBe(200);
      const refiled = await claim(alice, { selection_id: films[2]! });
      expect(refiled.status).toBe(201);
      expect(refiled.body.claims).toHaveLength(1);
    });

    it("claims only free agents of the league's Circuit", async () => {
      const own = await claim(alice, { selection_id: films[0]! });
      expect(own.body.error.code).toBe("CIRCUIT_SELECTION_ALREADY_OWNED");
      const taken = await claim(alice, { selection_id: films[1]! });
      expect(taken.body.error.code).toBe("CIRCUIT_SELECTION_TAKEN");
      const missing = await claim(alice, { selection_id: 999_999 });
      expect(missing.status).toBe(404);
      // A drop during the window is immediate, and the dropped selection can
      // then be claimed.
      const dropped = await api
        .post(`${base()}/drops`)
        .set(auth(bob))
        .send({ selection_id: films[1]! });
      expect(dropped.status).toBe(200);
      expect((await claim(alice, { selection_id: films[1]! })).status).toBe(201);
    });

    it("needs the drop to be on the claimant's roster", async () => {
      const notMine = await claim(alice, {
        selection_id: films[2]!,
        drop_selection_id: films[1]!
      });
      expect(notMine.status).toBe(409);
      expect(notMine.body.error.code).toBe("CIRCUIT_SELECTION_NOT_OWNED");
      const same = await claim(alice, {
        selection_id: films[2]!,
        drop_selection_id: films[2]!
      });
      expect(same.status).toBe(400);

      const filed = await claim(alice, { selection_id: films[2]! });
      const id = filed.body.claims[0].id as number;
      expect((await edit(alice, id, { drop_selection_id: films[1]! })).status).toBe(409);
      expect((await edit(alice, id, { drop_selection_id: films[2]! })).status).toBe(400);
      const set = await edit(alice, id, { drop_selection_id: films[0]! });
      expect(set.status).toBe(200);
      expect(set.body.claims[0].drop.id).toBe(films[0]);
      const cleared = await edit(alice, id, { drop_selection_id: null });
      expect(cleared.body.claims[0].drop).toBeNull();
    });

    it("attaches only the claimant's available chips, one claim each", async () => {
      const mine = await chipFor(alice, 2);
      const bobs = await chipFor(bob, 5);
      const used = await chipFor(alice, 7);
      await db.pool.query(
        `UPDATE circuit_chip SET status = 'EXPIRED', expired_at = now() WHERE id = $1`,
        [used]
      );

      const other = await claim(alice, { selection_id: films[2]!, chip_id: bobs });
      expect(other.status).toBe(404);
      const expired = await claim(alice, { selection_id: films[2]!, chip_id: used });
      expect(expired.body.error.code).toBe("CIRCUIT_CHIP_UNAVAILABLE");

      const first = await claim(alice, { selection_id: films[2]!, chip_id: mine });
      expect(first.status).toBe(201);
      const second = await claim(alice, { selection_id: films[3]!, chip_id: mine });
      expect(second.body.error.code).toBe("CIRCUIT_CHIP_IN_USE");

      // Move the chip: clear it from the first claim, then attach it to a second.
      const filed = await claim(alice, { selection_id: films[3]! });
      const [a, b] = (filed.body as Claims).claims.map((c) => c.id) as [number, number];
      expect((await edit(alice, b, { chip_id: mine })).body.error.code).toBe(
        "CIRCUIT_CHIP_IN_USE"
      );
      expect((await edit(alice, a, { chip_id: null })).status).toBe(200);
      const moved = await edit(alice, b, { chip_id: mine });
      expect(moved.status).toBe(200);
      expect((moved.body as Claims).claims.map((c) => c.chip?.id ?? null)).toEqual([
        null,
        mine
      ]);
      // Withdrawing frees the chip.
      const freed = await withdraw(alice, b);
      expect(
        (freed.body as Claims).chips.find((c) => c.id === mine)?.claim_id
      ).toBeNull();
    });

    it("ranks the viewer's pending claims and closes gaps on withdrawal", async () => {
      for (const film of films.slice(2, 5)) await claim(alice, { selection_id: film });
      const ids = (await claimsOf(alice)).claims.map((c) => c.id) as [
        number,
        number,
        number
      ];

      const ranked = await rank(alice, [ids[2], ids[0], ids[1]]);
      expect(ranked.status).toBe(200);
      expect((ranked.body as Claims).claims.map((c) => [c.id, c.rank])).toEqual([
        [ids[2], 1],
        [ids[0], 2],
        [ids[1], 3]
      ]);

      const stale = await rank(alice, [ids[0], ids[1]]);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("CIRCUIT_WAIVER_CLAIMS_CHANGED");

      const after = await withdraw(alice, ids[0]);
      expect((after.body as Claims).claims.map((c) => [c.id, c.rank])).toEqual([
        [ids[2], 1],
        [ids[1], 2]
      ]);
      expect(
        (await claim(alice, { selection_id: films[5]! })).body.claims.at(-1).rank
      ).toBe(3);
    });

    it("never returns another member's pending claims", async () => {
      const chip = await chipFor(alice, 3);
      const filed = await claim(alice, {
        selection_id: films[2]!,
        drop_selection_id: films[0]!,
        chip_id: chip
      });
      const id = filed.body.claims[0].id as number;

      const bobs = await claimsOf(bob);
      expect(bobs.claims).toEqual([]);
      expect(bobs.chips).toEqual([]);
      expect((await edit(bob, id, { chip_id: null })).status).toBe(404);
      expect((await withdraw(bob, id)).status).toBe(404);
      expect((await rank(bob, [id])).status).toBe(409);

      // Routes any member can read carry no claim.
      for (const path of [
        "",
        "/waivers",
        "/waivers/results",
        "/transactions",
        "/roster",
        `/members/${alice.id}/roster`,
        "/draft"
      ]) {
        const res = await api.get(`${base()}${path}`).set(auth(bob));
        const text = JSON.stringify(res.body);
        expect(text).not.toContain('"claims"');
        expect(text).not.toContain(`"claim_id":${id}`);
      }

      // dana is in the league but not the season; an outsider is in neither.
      expect((await api.get(`${base()}/claims`).set(auth(dana))).status).toBe(403);
      expect((await api.get(`${base()}/claims`).set(auth(outsider))).status).toBe(404);
      expect((await claim(outsider, { selection_id: films[3]! })).status).toBe(404);
      // Alice's claim is untouched.
      expect((await claimsOf(alice)).claims).toHaveLength(1);
    });

    it("refuses every edit once the processor has locked the window", async () => {
      const filed = await claim(alice, { selection_id: films[2]! });
      const id = filed.body.claims[0].id as number;
      await startRun(today());

      for (const res of [
        await claim(alice, { selection_id: films[3]! }),
        await edit(alice, id, { drop_selection_id: films[0]! }),
        await withdraw(alice, id),
        await rank(alice, [id])
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
      }
      const view = await claimsOf(alice);
      expect(view.locked).toBe(true);
      expect(view.claims.map((c) => c.status)).toEqual(["PENDING"]);
    });

    it("refuses edits once the window's resolution instant has passed", async () => {
      const filed = await claim(alice, { selection_id: films[2]! });
      const id = filed.body.claims[0].id as number;
      const window = (filed.body as Claims).window!;
      const viewer = { userId: alice.id, isSuperAdmin: false };
      const resolved = instantOfDay(window.resolves_on);

      for (const attempt of [
        updateCircuitWaiverClaimFor(
          db.pool,
          circuitLeagueId,
          viewer,
          id,
          { chipId: null },
          resolved
        ),
        withdrawCircuitWaiverClaimFor(db.pool, circuitLeagueId, viewer, id, resolved)
      ]) {
        await expect(attempt).rejects.toMatchObject({
          code: "CIRCUIT_WAIVER_CLAIMS_LOCKED"
        });
      }
      // A moment earlier, the edit goes through.
      await expect(
        updateCircuitWaiverClaimFor(
          db.pool,
          circuitLeagueId,
          viewer,
          id,
          { chipId: null },
          new Date(resolved.getTime() - 1)
        )
      ).resolves.toMatchObject({ locked: false });
    });

    it("refuses free-agent adds during the window", async () => {
      const res = await api
        .post(`${base()}/free-agents`)
        .set(auth(alice))
        .send({ selection_id: films[2]! });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CIRCUIT_WAIVER_WINDOW_OPEN");
    });
  });

  describe("waivers overview", () => {
    it("shows rolling priority and every chip to the league, and no claims", async () => {
      await openWindowToday();
      const chip = await chipFor(bob, 6);
      await claim(bob, { selection_id: films[2]!, chip_id: chip });

      for (const viewer of [alice, dana]) {
        const res = await api.get(`${base()}/waivers`).set(auth(viewer));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          window: {
            starts_on: today(),
            ends_on: expect.any(String),
            resolves_on: expect.any(String)
          },
          priority: [
            { user_id: carol.id, username: "carol", waiver_priority: 1 },
            { user_id: bob.id, username: "bob", waiver_priority: 2 },
            { user_id: alice.id, username: "alice", waiver_priority: 3 }
          ],
          chips: [
            {
              id: chip,
              member: { user_id: bob.id, username: "bob" },
              original_pick_number: 6,
              status: "AVAILABLE"
            }
          ]
        });
      }
      expect((await api.get(`${base()}/waivers`).set(auth(outsider))).status).toBe(404);
    });
  });

  describe("schema", () => {
    async function insertClaim(fields: {
      member: User;
      selection: number;
      status?: string;
      chip?: number | null;
      run?: number | null;
      reason?: string | null;
    }) {
      return db.pool.query(
        `INSERT INTO circuit_waiver_claim
           (circuit_league_id, member_id, window_starts_on, selection_id, chip_id,
            rank, status, run_id, failure_reason)
         VALUES ($1, $2, '2026-12-04', $3, $4, 1, $5, $6, $7)`,
        [
          circuitLeagueId,
          memberIds.get(fields.member.id)!,
          fields.selection,
          fields.chip ?? null,
          fields.status ?? "PENDING",
          fields.run ?? null,
          fields.reason ?? null
        ]
      );
    }

    it("resolves a claim only inside a run of its own window", async () => {
      expect(
        await pgErrorCode(
          insertClaim({ member: alice, selection: films[0]!, status: "WON" })
        )
      ).toBe("23514");
      await startRun("2026-12-11");
      const { rows } = await db.pool.query<{ id: number }>(
        `SELECT id::int FROM circuit_waiver_run`
      );
      expect(
        await pgErrorCode(
          insertClaim({
            member: alice,
            selection: films[0]!,
            status: "WON",
            run: rows[0]!.id
          })
        )
      ).toBe("23503");
    });

    it("needs a failure reason exactly when a claim is lost", async () => {
      await startRun("2026-12-04");
      const { rows } = await db.pool.query<{ id: number }>(
        `SELECT id::int FROM circuit_waiver_run`
      );
      const run = rows[0]!.id;
      expect(
        await pgErrorCode(
          insertClaim({ member: alice, selection: films[0]!, status: "LOST", run })
        )
      ).toBe("23514");
      expect(
        await pgErrorCode(
          insertClaim({
            member: alice,
            selection: films[0]!,
            status: "LOST",
            run,
            reason: "ROSTER_FULL"
          })
        )
      ).toBeNull();
    });

    it("keeps a claim's chip the claimant's and on one pending claim", async () => {
      const bobs = await chipFor(bob, 1);
      expect(
        await pgErrorCode(
          insertClaim({ member: alice, selection: films[0]!, chip: bobs })
        )
      ).toBe("23503");
      await insertClaim({ member: bob, selection: films[0]!, chip: bobs });
      expect(
        await pgErrorCode(insertClaim({ member: bob, selection: films[1]!, chip: bobs }))
      ).toBe("23505");
    });

    it("runs a league's window once", async () => {
      await startRun("2026-12-04");
      expect(await pgErrorCode(startRun("2026-12-04"))).toBe("23505");
    });
  });
});
