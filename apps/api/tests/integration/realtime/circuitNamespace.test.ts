import { getSnakeSeatForPick } from "@fantasy-oscars/shared";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createServer } from "../../../src/server.js";
import { tickCircuitDraft } from "../../../src/services/circuit/circuitDraft.js";
import { emitCircuitWaiverResult } from "../../../src/services/circuit/circuitWaiverEvents.js";
import {
  CIRCUIT_NAMESPACE,
  connectCircuitDraftEvents,
  connectCircuitWaiverEvents,
  disconnectCircuitDraftEvents,
  disconnectCircuitWaiverEvents,
  registerCircuitNamespace
} from "../../../src/services/circuit/circuitNamespace.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertUser
} from "../../factories/db.js";
import {
  ListenPermissionError,
  createTestClient,
  disconnectClient,
  startSocketTestServer,
  waitForEvent,
  type SocketTestServer,
  type TestClient
} from "../../support/socket.js";
import { signTestToken } from "../../support/session.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";

const AUTH_SECRET = "test-secret";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

type User = { id: number; username: string };
type Seat = { seat_number: number; member_id: number; user_id: number };
type EventMessage = {
  draft_id: number;
  circuit_league_id: number;
  version: number;
  event_type: string;
  payload: {
    draft: Record<string, unknown>;
    on_the_clock: unknown;
    seats?: unknown[];
    pick?: unknown;
    selection?: unknown;
    chip?: unknown;
  };
};
type Board = {
  draft: Record<string, unknown> & { id: number; version: number };
  seats: unknown[];
  picks: unknown[];
  on_the_clock: unknown;
  chips: unknown[];
  selections: unknown[];
};

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let server: SocketTestServer | undefined;
let clients: TestClient[] = [];

function token(user: User) {
  return signTestToken({ sub: String(user.id), username: user.username }, AUTH_SECRET);
}

function auth(user: User) {
  return { Authorization: `Bearer ${token(user)}` };
}

async function connect(user: User, circuitLeagueId: number) {
  const client = await createTestClient(server!, {
    namespace: CIRCUIT_NAMESPACE,
    socketOptions: {
      query: { circuitLeagueId },
      extraHeaders: { Authorization: `Bearer ${token(user)}` }
    }
  });
  clients.push(client);
  return client;
}

async function refused(
  query: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<Error> {
  const socket: Socket = createClient(server!.url + CIRCUIT_NAMESPACE, {
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
    query,
    extraHeaders: headers
  });
  try {
    return await new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("expected a refusal")), 2000);
      socket.once("connect_error", (err) => {
        clearTimeout(timer);
        resolve(err);
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        reject(new Error("expected a refusal"));
      });
      socket.connect();
    });
  } finally {
    socket.disconnect();
  }
}

/** Waits until the client has received the draft event with this version. */
async function eventsThrough(client: TestClient, version: number) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const events = client.events
      .filter((e) => e.event === "draft:event")
      .map((e) => e.args[0] as EventMessage);
    if (events.some((e) => e.version >= version)) return events;
    if (Date.now() > deadline) throw new Error(`no draft event ${version}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Applies one event to a board, the way a client does after a snapshot. */
function applyEvent(board: Board, event: EventMessage): Board {
  expect(event.draft_id).toBe(board.draft.id);
  expect(event.version).toBe(board.draft.version + 1);
  const { payload } = event;
  return {
    draft: { ...payload.draft, version: event.version } as Board["draft"],
    seats: payload.seats ?? board.seats,
    picks: payload.pick ? [...board.picks, payload.pick] : board.picks,
    on_the_clock: payload.on_the_clock,
    chips: payload.chip ? [...board.chips, payload.chip] : board.chips,
    selections: payload.selection
      ? [...board.selections, payload.selection]
      : board.selections
  };
}

describe("circuits namespace", () => {
  let alice: User;
  let bob: User;
  let dana: User;
  let outsider: User;
  let users: Map<number, User>;
  let leagueA: { id: number; films: number[] };
  let leagueB: { id: number; films: number[] };

  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
    process.env.AUTH_SECRET = AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  });

  /** A league with an initialised Circuit league whose members are `members`. */
  async function circuitLeague(
    code: string,
    owner: User,
    members: User[],
    extra: User[]
  ) {
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    for (const user of [...members, ...extra]) {
      await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
    }
    const circuit = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit (code, name, status, activated_at)
       VALUES ($1, $1, 'ACTIVE', now()) RETURNING id::int`,
      [code]
    );
    const circuitId = circuit.rows[0]!.id;
    const category = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
       VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
      [circuitId]
    );
    const categoryId = category.rows[0]!.id;
    const created = await db.pool.query<{ id: number }>(
      `INSERT INTO circuit_league
         (circuit_id, league_id, status, roster_size, initialized_at, created_by_user_id)
       VALUES ($1, $2, 'INITIALIZED', 2, now(), $3) RETURNING id::int`,
      [circuitId, league.id, owner.id]
    );
    const id = created.rows[0]!.id;
    await db.pool.query(
      `INSERT INTO circuit_league_category
         (circuit_league_id, circuit_id, circuit_category_id, max_owned)
       VALUES ($1, $2, $3, NULL)`,
      [id, circuitId, categoryId]
    );
    for (const user of members) {
      await db.pool.query(
        `INSERT INTO circuit_league_member (circuit_league_id, user_id) VALUES ($1, $2)`,
        [id, user.id]
      );
    }
    const films: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const film = await insertFilm(db.pool);
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_selection (circuit_category_id, film_tmdb_id, film_id)
         VALUES ($1, $2, $3) RETURNING id::int`,
        [categoryId, film.id, film.id]
      );
      films.push(rows[0]!.id);
    }
    return { id, films };
  }

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    api = createApiAgent(createServer({ db: db.pool }));
    try {
      server = await startSocketTestServer((io) => {
        const nsp = registerCircuitNamespace(io, {
          db: db.pool,
          authSecret: AUTH_SECRET
        });
        connectCircuitDraftEvents(nsp);
        connectCircuitWaiverEvents(nsp);
      });
    } catch (err) {
      if (err instanceof ListenPermissionError) return;
      throw err;
    }
    alice = await insertUser(db.pool, { username: "alice" });
    bob = await insertUser(db.pool, { username: "bob" });
    dana = await insertUser(db.pool, { username: "dana" });
    outsider = await insertUser(db.pool, { username: "outsider" });
    users = new Map([alice, bob].map((u) => [u.id, u]));
    // dana is in league A but not in its season; bob plays both seasons.
    leagueA = await circuitLeague("a", alice, [alice, bob], [dana]);
    leagueB = await circuitLeague("b", bob, [bob, outsider], []);
  });

  afterEach(async () => {
    await Promise.all(clients.map(disconnectClient));
    clients = [];
    disconnectCircuitDraftEvents();
    disconnectCircuitWaiverEvents();
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  const start = (user: User, circuitLeagueId: number) =>
    api.post(`/circuit-leagues/${circuitLeagueId}/draft`).set(auth(user)).send();

  const pick = (draftId: number, user: User, selectionId: number, requestId: string) =>
    api
      .post(`/circuit-drafts/${draftId}/picks`)
      .set(auth(user))
      .send({ selection_id: selectionId, request_id: requestId });

  const snapshot = async (draftId: number, user: User) => {
    const res = await api.get(`/circuit-drafts/${draftId}/snapshot`).set(auth(user));
    expect(res.status).toBe(200);
    const { server_time: serverTime, ...board } = res.body as Board & {
      server_time: string;
    };
    expect(typeof serverTime).toBe("string");
    return board as Board;
  };

  const onTheClock = (seats: Seat[], pickNumber: number) => {
    const seatNumber = getSnakeSeatForPick(seats.length, pickNumber);
    return users.get(seats.find((s) => s.seat_number === seatNumber)!.user_id)!;
  };

  it("admits only members of the room's Circuit league", async () => {
    if (!server) return;
    const member = await connect(alice, leagueA.id);
    expect(await waitForEvent(member, "joined")).toEqual([
      { circuitLeagueId: leagueA.id }
    ]);

    const leagueOnly = await refused(
      { circuitLeagueId: leagueA.id },
      { Authorization: `Bearer ${token(dana)}` }
    );
    expect(leagueOnly.message).toBe("Not a member of this season");
    const otherSeason = await refused(
      { circuitLeagueId: leagueA.id },
      { Authorization: `Bearer ${token(outsider)}` }
    );
    expect(otherSeason.message).toBe("Not a member of this season");
    expect((await refused({ circuitLeagueId: leagueA.id })).message).toBe(
      "Missing auth token"
    );
    expect(
      (
        await refused(
          { circuitLeagueId: "x" },
          { Authorization: `Bearer ${token(alice)}` }
        )
      ).message
    ).toBe("Invalid season id");
    await db.pool.query(`UPDATE auth_session SET revoked_at = now() WHERE user_id = $1`, [
      alice.id
    ]);
    expect(
      (
        await refused(
          { circuitLeagueId: leagueA.id },
          { Authorization: `Bearer ${token(alice)}` }
        )
      ).message
    ).toBe("Your session has expired. Please log in again.");
  });

  it("sends each draft's versioned events to its own league's room", async () => {
    if (!server) return;
    const inA = await connect(alice, leagueA.id);
    const inB = await connect(outsider, leagueB.id);

    const a = await start(alice, leagueA.id);
    expect(a.status).toBe(201);
    const b = await start(bob, leagueB.id);
    expect(b.status).toBe(201);

    const eventsB = await eventsThrough(inB, 1);
    const eventsA = await eventsThrough(inA, 1);
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0]).toMatchObject({
      draft_id: a.body.draft.id,
      circuit_league_id: leagueA.id,
      version: 1,
      event_type: "draft.started"
    });
    expect(eventsB.map((e) => e.draft_id)).toEqual([b.body.draft.id]);
  });

  it("sends a completed waiver run to its own league's room", async () => {
    if (!server) return;
    const inA = await connect(alice, leagueA.id);
    const inB = await connect(outsider, leagueB.id);
    await waitForEvent(inA, "joined");
    await waitForEvent(inB, "joined");

    const run = {
      circuit_league_id: leagueA.id,
      run_id: 7,
      window_starts_on: "2026-12-04",
      won: 1,
      lost: 2,
      chips_expired: 0
    };
    const heard = waitForEvent(inA, "waiver:result");
    emitCircuitWaiverResult(run);
    const [message] = (await heard) as [Record<string, unknown>];
    expect(message).toMatchObject(run);
    expect(typeof message.server_time).toBe("string");
    expect(inB.events.some((e) => e.event === "waiver:result")).toBe(false);
  });

  it("rebuilds the board after a reconnect from the snapshot and the events after it", async () => {
    if (!server) return;
    const watching = await connect(alice, leagueA.id);
    const started = await start(alice, leagueA.id);
    expect(started.status).toBe(201);
    const draftId = started.body.draft.id as number;
    const seats = started.body.seats as Seat[];
    await eventsThrough(watching, 1);

    // Disconnected while the first two picks land.
    await disconnectClient(watching);
    const [f1, f2, f3] = leagueA.films as [number, number, number];
    expect((await pick(draftId, onTheClock(seats, 1), f1, "p1")).status).toBe(201);
    expect((await pick(draftId, onTheClock(seats, 2), f2, "p2")).status).toBe(201);

    // Reconnect first, then fetch the snapshot, so nothing falls in between.
    const back = await connect(alice, leagueA.id);
    await waitForEvent(back, "joined");
    const board = await snapshot(draftId, alice);
    expect(board.draft.version).toBe(3);
    expect(board.picks).toHaveLength(2);

    // Then a pick, a pause and resume, a missed pick into the supplemental
    // round, and a second miss that makes a chip and completes the draft.
    expect((await pick(draftId, onTheClock(seats, 3), f3, "p3")).status).toBe(201);
    const owner = auth(alice);
    expect((await api.post(`/circuit-drafts/${draftId}/pause`).set(owner)).status).toBe(
      200
    );
    expect((await api.post(`/circuit-drafts/${draftId}/resume`).set(owner)).status).toBe(
      200
    );
    const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
    expect(await tickCircuitDraft(db.pool, draftId, later(10))).not.toBeNull();
    expect(await tickCircuitDraft(db.pool, draftId, later(20))).not.toBeNull();

    const events = await eventsThrough(back, 9);
    const after = events.filter((e) => e.version > board.draft.version);
    expect(after.map((e) => e.event_type)).toEqual([
      "draft.pick.made",
      "draft.paused",
      "draft.resumed",
      "draft.pick.missed",
      "draft.pick.missed",
      "draft.completed"
    ]);
    const rebuilt = after.reduce(applyEvent, board);

    const fresh = await snapshot(draftId, alice);
    expect(fresh.draft.status).toBe("COMPLETED");
    expect(fresh.chips).toHaveLength(1);
    expect(rebuilt).toEqual(fresh);
  });
});
