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
import { createServer } from "../../../src/server.js";
import * as circuitLeagueDomain from "../../../src/domain/circuitLeague.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertLeague,
  insertLeagueMember,
  insertSeason,
  insertSeasonMember,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";

type User = { id: number; username: string };
type Detail = {
  circuit_league: {
    id: number;
    status: string;
    roster_size: number;
    draft_type: string;
    pick_timer_seconds: number | null;
    auto_draft_enabled: boolean;
    nomination_points: number;
    win_bonus_points: number;
    initialized_at: string | null;
  };
  events: Array<{
    id: number;
    enabled: boolean;
    weight: number;
    ceremonies: Array<{ id: number }>;
  }>;
  categories: Array<{ id: number; weight: number; max_owned: number | null }>;
  members: Array<{ user_id: number }>;
  viewer: { is_member: boolean; can_manage: boolean };
};

function auth(user: User) {
  const token = signTestToken(
    { sub: String(user.id), username: user.username },
    AUTH_SECRET
  );
  return { Authorization: `Bearer ${token}` };
}

async function insertCircuit(
  status: "DRAFT" | "PUBLISHED" | "ACTIVE" | "ARCHIVED" = "ACTIVE"
) {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit (code, name, status, activated_at)
     VALUES ('c-' || floor(random() * 1e9)::text, 'Circuit', $1,
       CASE WHEN $1 IN ('DRAFT', 'PUBLISHED') THEN NULL ELSE now() END)
     RETURNING id::int`,
    [status]
  );
  return rows[0]!.id;
}

async function insertEvent(
  circuitId: number,
  code: string,
  sort: number,
  isGroup: boolean
) {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit_event (circuit_id, code, name, sort_index, is_group)
     VALUES ($1, $2, $2, $3, $4) RETURNING id::int`,
    [circuitId, code, sort, isGroup]
  );
  return rows[0]!.id;
}

async function addCeremonyToEvent(circuitId: number, eventId: number, sort: number) {
  const ceremony = await insertCeremony(db.pool, {}, false);
  await db.pool.query(`UPDATE ceremony SET status = 'ACTIVE' WHERE id = $1`, [
    ceremony.id
  ]);
  await db.pool.query(
    `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
     VALUES ($1, $2, $3, $4)`,
    [circuitId, ceremony.id, eventId, sort]
  );
  return ceremony.id;
}

async function insertCategory(circuitId: number, code: string, kind: "FILM" | "ACTING") {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
     VALUES ($1, $2, $2, $3, 0) RETURNING id::int`,
    [circuitId, code, kind]
  );
  return rows[0]!.id;
}

async function circuitMemberIds(circuitLeagueId: number) {
  const { rows } = await db.pool.query<{ user_id: number }>(
    `SELECT user_id::int FROM circuit_league_member
     WHERE circuit_league_id = $1 ORDER BY user_id`,
    [circuitLeagueId]
  );
  return rows.map((r) => r.user_id);
}

async function seasonMemberIds(seasonId: number) {
  const { rows } = await db.pool.query<{ user_id: number }>(
    `SELECT user_id::int FROM season_member WHERE season_id = $1 ORDER BY user_id`,
    [seasonId]
  );
  return rows.map((r) => r.user_id);
}

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
}

describe("circuit leagues", () => {
  let owner: User;
  let coOwner: User;
  let member: User;
  let outsider: User;
  let leagueId: number;
  let leagueCeremonyId: number;
  let circuitId: number;
  let guildEvent: number;
  let baftaEvent: number;
  let guildCeremonies: number[];
  let picture: number;
  let actor: number;

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    owner = await insertUser(db.pool, { username: "owner" });
    coOwner = await insertUser(db.pool, { username: "coowner" });
    member = await insertUser(db.pool, { username: "member" });
    outsider = await insertUser(db.pool, { username: "outsider" });
    const league = await insertLeague(db.pool, { created_by_user_id: owner.id });
    leagueId = league.id;
    leagueCeremonyId = league.ceremony_id;
    await insertLeagueMember(db.pool, {
      league_id: leagueId,
      user_id: owner.id,
      role: "OWNER"
    });
    await insertLeagueMember(db.pool, {
      league_id: leagueId,
      user_id: coOwner.id,
      role: "CO_OWNER"
    });
    await insertLeagueMember(db.pool, { league_id: leagueId, user_id: member.id });

    circuitId = await insertCircuit();
    guildEvent = await insertEvent(circuitId, "guild-awards", 0, true);
    baftaEvent = await insertEvent(circuitId, "bafta", 1, false);
    guildCeremonies = [
      await addCeremonyToEvent(circuitId, guildEvent, 0),
      await addCeremonyToEvent(circuitId, guildEvent, 1)
    ];
    await addCeremonyToEvent(circuitId, baftaEvent, 0);
    picture = await insertCategory(circuitId, "picture", "FILM");
    actor = await insertCategory(circuitId, "actor", "ACTING");
  });

  async function create(user: User = owner, body: object = { circuit_id: circuitId }) {
    return api.post(`/leagues/${leagueId}/circuits`).set(auth(user)).send(body);
  }

  async function createId() {
    const res = await create();
    expect(res.status).toBe(201);
    return (res.body as Detail).circuit_league.id;
  }

  async function initialize(id: number) {
    const res = await api.post(`/circuit-leagues/${id}/initialize`).set(auth(owner));
    expect(res.status).toBe(200);
    return res.body as Detail;
  }

  describe("create", () => {
    it("starts with every event enabled, roster 16, no limits, 1 + 2 points, weights 1 and a 90-second clock", async () => {
      const res = await create();
      expect(res.status).toBe(201);
      const detail = res.body as Detail;
      expect(detail.circuit_league).toMatchObject({
        status: "SETUP",
        roster_size: 16,
        draft_type: "SNAKE",
        pick_timer_seconds: 90,
        auto_draft_enabled: true,
        nomination_points: 1,
        win_bonus_points: 2,
        initialized_at: null
      });
      expect(detail.events).toEqual([
        expect.objectContaining({ id: guildEvent, enabled: true, weight: 1 }),
        expect.objectContaining({ id: baftaEvent, enabled: true, weight: 1 })
      ]);
      expect(detail.categories).toEqual([
        expect.objectContaining({ id: picture, weight: 1, max_owned: null }),
        expect.objectContaining({ id: actor, weight: 1, max_owned: null })
      ]);
      expect(detail.members.map((m) => m.user_id)).toEqual([owner.id]);
      expect(detail.viewer).toEqual({
        is_league_member: true,
        is_member: true,
        can_manage: true
      });

      const { rows } = await db.pool.query<{ events: number; categories: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM circuit_league_event) AS events,
           (SELECT COUNT(*)::int FROM circuit_league_category) AS categories`
      );
      expect(rows[0]).toEqual({ events: 2, categories: 2 });
    });

    it("lets a co-owner create, but not a plain member or someone outside the league", async () => {
      expect((await create(member)).status).toBe(403);
      // A league's existence is not revealed to someone outside it.
      expect((await create(outsider)).status).toBe(404);
      expect((await create(coOwner)).status).toBe(201);
    });

    it("lets the league's owner create without any admin role, and refuses a non-commissioner", async () => {
      const { rows } = await db.pool.query<{ is_admin: boolean }>(
        `SELECT is_admin FROM app_user WHERE id = $1`,
        [owner.id]
      );
      expect(rows[0]?.is_admin).toBe(false);
      const refused = await create(member);
      expect(refused.status).toBe(403);
      const listed = await api.get(`/leagues/${leagueId}/circuits`).set(auth(owner));
      expect(listed.body.circuit_leagues).toEqual([]);
      expect((await create(owner)).status).toBe(201);
    });

    it("sets up a season against a published Circuit before it goes live", async () => {
      const published = await insertCircuit("PUBLISHED");
      const res = await create(owner, { circuit_id: published });
      expect(res.status).toBe(201);
    });

    it("refuses a second competition for the same Circuit, a draft Circuit and an unknown one", async () => {
      expect((await create()).status).toBe(201);
      const again = await create();
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("CIRCUIT_LEAGUE_EXISTS");

      const draft = await insertCircuit("DRAFT");
      expect((await create(owner, { circuit_id: draft })).status).toBe(404);
      expect((await create(owner, { circuit_id: 999999 })).status).toBe(404);
      expect((await create(owner, {})).status).toBe(400);
    });

    it("applies initial settings, events and categories in the same request", async () => {
      const res = await create(owner, {
        circuit_id: circuitId,
        settings: {
          roster_size: 10,
          nomination_points: 0,
          win_bonus_points: 5,
          pick_timer_seconds: null,
          auto_draft_enabled: false
        },
        events: [{ circuit_event_id: baftaEvent, weight: 1.5 }],
        categories: [{ circuit_category_id: actor, weight: 2, max_owned: 3 }]
      });
      expect(res.status).toBe(201);
      const detail = res.body as Detail;
      expect(detail.circuit_league).toMatchObject({
        status: "SETUP",
        roster_size: 10,
        pick_timer_seconds: null,
        auto_draft_enabled: false,
        nomination_points: 0,
        win_bonus_points: 5
      });
      expect(detail.events).toEqual([
        expect.objectContaining({ id: guildEvent, enabled: false }),
        expect.objectContaining({ id: baftaEvent, enabled: true, weight: 1.5 })
      ]);
      expect(detail.categories).toEqual([
        expect.objectContaining({ id: picture, weight: 1, max_owned: null }),
        expect.objectContaining({ id: actor, weight: 2, max_owned: 3 })
      ]);
      expect(detail.members.map((m) => m.user_id)).toEqual([owner.id]);
    });

    it("creates nothing when an initial value is invalid or belongs to another Circuit", async () => {
      const other = await insertCircuit();
      const otherEvent = await insertEvent(other, "elsewhere", 0, false);
      const badEvent = await create(owner, {
        circuit_id: circuitId,
        events: [{ circuit_event_id: otherEvent, weight: 1 }]
      });
      expect(badEvent.status).toBe(400);
      const badRoster = await create(owner, {
        circuit_id: circuitId,
        settings: { roster_size: 0 }
      });
      expect(badRoster.status).toBe(400);

      const { rows } = await db.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM circuit_league`
      );
      expect(rows[0]).toEqual({ count: 0 });
    });

    it("starts nothing in any league when an admin activates a Circuit", async () => {
      const admin = await insertUser(db.pool, { username: "admin" });
      await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
        admin.id
      ]);
      const draft = await insertCircuit("DRAFT");
      const activated = await api
        .post(`/admin/circuits/${draft}/activate`)
        .set(auth(admin));
      expect(activated.status).toBe(200);

      const { rows } = await db.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM circuit_league`
      );
      expect(rows[0]).toEqual({ count: 0 });
      const listed = await api.get(`/leagues/${leagueId}/circuits`).set(auth(owner));
      expect(listed.status).toBe(200);
      expect(listed.body.circuit_leagues).toEqual([]);
    });

    it("lists the league's competitions for its members only", async () => {
      const id = await createId();
      const res = await api.get(`/leagues/${leagueId}/circuits`).set(auth(member));
      expect(res.status).toBe(200);
      expect(res.body.circuit_leagues).toEqual([
        expect.objectContaining({ id, member_count: 1, is_member: false })
      ]);
      expect(
        (await api.get(`/leagues/${leagueId}/circuits`).set(auth(outsider))).status
      ).toBe(404);
      expect((await api.get(`/circuit-leagues/${id}`).set(auth(outsider))).status).toBe(
        404
      );
    });
  });

  describe("events", () => {
    it("toggles an event of several ceremonies as one unit", async () => {
      const id = await createId();
      const res = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(owner))
        .send({ events: [{ circuit_event_id: baftaEvent }] });
      expect(res.status).toBe(200);
      const guild = (res.body as Detail).events.find((e) => e.id === guildEvent)!;
      expect(guild.enabled).toBe(false);
      expect(guild.ceremonies.map((c) => c.id)).toEqual(guildCeremonies);

      const back = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(owner))
        .send({ events: [{ circuit_event_id: guildEvent, weight: 2 }] });
      const enabled = (back.body as Detail).events.filter((e) => e.enabled);
      expect(enabled).toEqual([
        expect.objectContaining({
          id: guildEvent,
          weight: 2,
          ceremonies: expect.any(Array)
        })
      ]);
      expect(enabled[0]!.ceremonies).toHaveLength(2);
    });

    it("saves any subset, including none", async () => {
      const id = await createId();
      const none = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(owner))
        .send({ events: [] });
      expect(none.status).toBe(200);
      expect((none.body as Detail).events.every((e) => !e.enabled)).toBe(true);

      const both = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(owner))
        .send({
          events: [
            { circuit_event_id: guildEvent, weight: 1.5 },
            { circuit_event_id: baftaEvent }
          ]
        });
      expect((both.body as Detail).events).toEqual([
        expect.objectContaining({ id: guildEvent, enabled: true, weight: 1.5 }),
        expect.objectContaining({ id: baftaEvent, enabled: true, weight: 1 })
      ]);
    });

    it("refuses events of another Circuit, and edits by plain members", async () => {
      const id = await createId();
      const other = await insertCircuit();
      const foreign = await insertEvent(other, "other", 0, false);
      const res = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(owner))
        .send({ events: [{ circuit_event_id: foreign }] });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields).toEqual(["events"]);

      const byMember = await api
        .put(`/circuit-leagues/${id}/events`)
        .set(auth(member))
        .send({ events: [] });
      expect(byMember.status).toBe(403);
    });
  });

  describe("settings in setup", () => {
    it("edits roster, points, clock, auto-draft and category weights and limits", async () => {
      const id = await createId();
      const res = await api
        .patch(`/circuit-leagues/${id}/settings`)
        .set(auth(coOwner))
        .send({
          roster_size: 12,
          nomination_points: 3,
          win_bonus_points: 5,
          pick_timer_seconds: null,
          auto_draft_enabled: false
        });
      expect(res.status).toBe(200);
      expect((res.body as Detail).circuit_league).toMatchObject({
        roster_size: 12,
        nomination_points: 3,
        win_bonus_points: 5,
        pick_timer_seconds: null,
        auto_draft_enabled: false
      });

      const cats = await api
        .put(`/circuit-leagues/${id}/categories`)
        .set(auth(owner))
        .send({ categories: [{ circuit_category_id: actor, weight: 2, max_owned: 3 }] });
      expect(cats.status).toBe(200);
      expect((cats.body as Detail).categories).toEqual([
        expect.objectContaining({ id: picture, weight: 1, max_owned: null }),
        expect.objectContaining({ id: actor, weight: 2, max_owned: 3 })
      ]);
    });

    it("refuses settings from plain members and out-of-range values", async () => {
      const id = await createId();
      const byMember = await api
        .patch(`/circuit-leagues/${id}/settings`)
        .set(auth(member))
        .send({ roster_size: 10 });
      expect(byMember.status).toBe(403);
      const tooBig = await api
        .patch(`/circuit-leagues/${id}/settings`)
        .set(auth(owner))
        .send({ roster_size: 65 });
      expect(tooBig.status).toBe(400);
      expect(tooBig.body.error.details.fields).toEqual(["roster_size"]);
    });
  });

  describe("membership", () => {
    it("lets league members join and leave", async () => {
      const id = await createId();
      const joined = await api.post(`/circuit-leagues/${id}/join`).set(auth(member));
      expect(joined.status).toBe(200);
      expect((joined.body as Detail).viewer.is_member).toBe(true);
      expect(await circuitMemberIds(id)).toEqual(
        [owner.id, member.id].sort((a, b) => a - b)
      );

      const left = await api.post(`/circuit-leagues/${id}/leave`).set(auth(member));
      expect(left.status).toBe(200);
      expect(await circuitMemberIds(id)).toEqual([owner.id]);
    });

    it("lets only league members join", async () => {
      const id = await createId();
      expect(
        (await api.post(`/circuit-leagues/${id}/join`).set(auth(outsider))).status
      ).toBe(404);
      await db.pool.query(
        `UPDATE app_user SET is_admin = true, admin_role = 'SUPER_ADMIN' WHERE id = $1`,
        [outsider.id]
      );
      const admin = await api.post(`/circuit-leagues/${id}/join`).set(auth(outsider));
      expect(admin.status).toBe(403);
      expect(admin.body.error.code).toBe("LEAGUE_MEMBERSHIP_REQUIRED");
      expect(await circuitMemberIds(id)).toEqual([owner.id]);
    });
  });

  describe("initialisation", () => {
    it("moves SETUP to INITIALIZED, for commissioners, once someone has joined", async () => {
      const id = await createId();
      expect(
        (await api.post(`/circuit-leagues/${id}/initialize`).set(auth(member))).status
      ).toBe(403);

      await api.post(`/circuit-leagues/${id}/leave`).set(auth(owner));
      const empty = await api.post(`/circuit-leagues/${id}/initialize`).set(auth(owner));
      expect(empty.status).toBe(409);
      expect(empty.body.error.code).toBe("CIRCUIT_LEAGUE_EMPTY");

      await api.post(`/circuit-leagues/${id}/join`).set(auth(owner));
      const detail = await initialize(id);
      expect(detail.circuit_league.status).toBe("INITIALIZED");
      expect(detail.circuit_league.initialized_at).not.toBeNull();
    });

    describe("refuses every member and event write afterwards, through the guard", () => {
      let id: number;
      let guard: ReturnType<typeof vi.spyOn>;

      beforeEach(async () => {
        id = await createId();
        await api.post(`/circuit-leagues/${id}/join`).set(auth(coOwner));
        await initialize(id);
        guard = vi.spyOn(circuitLeagueDomain, "assertCircuitLeagueOpen");
      });

      async function expectLocked(res: {
        status: number;
        body: { error: { code: string } };
      }) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("CIRCUIT_LEAGUE_LOCKED");
        expect(guard).toHaveBeenCalledTimes(1);
        expect(guard.mock.results[0]?.type).toBe("throw");
      }

      it("join", async () => {
        await expectLocked(
          await api.post(`/circuit-leagues/${id}/join`).set(auth(member))
        );
        expect(await circuitMemberIds(id)).toEqual(
          [owner.id, coOwner.id].sort((a, b) => a - b)
        );
      });

      it("leave", async () => {
        await expectLocked(
          await api.post(`/circuit-leagues/${id}/leave`).set(auth(coOwner))
        );
        expect(await circuitMemberIds(id)).toContain(coOwner.id);
      });

      it("events", async () => {
        await expectLocked(
          await api
            .put(`/circuit-leagues/${id}/events`)
            .set(auth(owner))
            .send({ events: [] })
        );
        const { rows } = await db.pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM circuit_league_event WHERE circuit_league_id = $1`,
          [id]
        );
        expect(rows[0]!.n).toBe(2);
      });

      it("initialise", async () => {
        await expectLocked(
          await api.post(`/circuit-leagues/${id}/initialize`).set(auth(owner))
        );
      });
    });

    it("keeps the pick clock and auto-draft editable until the draft starts, and freezes the rest", async () => {
      const id = await createId();
      await initialize(id);

      const clock = await api
        .patch(`/circuit-leagues/${id}/settings`)
        .set(auth(owner))
        .send({ pick_timer_seconds: 120, auto_draft_enabled: false });
      expect(clock.status).toBe(200);
      expect((clock.body as Detail).circuit_league).toMatchObject({
        pick_timer_seconds: 120,
        auto_draft_enabled: false
      });

      for (const body of [
        { roster_size: 10 },
        { nomination_points: 2 },
        { win_bonus_points: 4 }
      ]) {
        const res = await api
          .patch(`/circuit-leagues/${id}/settings`)
          .set(auth(owner))
          .send({ ...body, pick_timer_seconds: 60 });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("CIRCUIT_LEAGUE_SETTINGS_LOCKED");
      }
      const cats = await api
        .put(`/circuit-leagues/${id}/categories`)
        .set(auth(owner))
        .send({ categories: [{ circuit_category_id: picture, weight: 3 }] });
      expect(cats.status).toBe(409);
      expect(cats.body.error.code).toBe("CIRCUIT_LEAGUE_SETTINGS_LOCKED");

      await db.pool.query(`UPDATE circuit_league SET status = 'DRAFTING' WHERE id = $1`, [
        id
      ]);
      const drafting = await api
        .patch(`/circuit-leagues/${id}/settings`)
        .set(auth(owner))
        .send({ pick_timer_seconds: 30 });
      expect(drafting.status).toBe(409);
      expect(drafting.body.error.code).toBe("CIRCUIT_LEAGUE_SETTINGS_LOCKED");
    });
  });

  it("keeps Season and Circuit memberships apart in one league", async () => {
    const season = await insertSeason(db.pool, {
      league_id: leagueId,
      ceremony_id: leagueCeremonyId
    });
    const { rows: lm } = await db.pool.query<{ id: number; user_id: number }>(
      `SELECT id::int, user_id::int FROM league_member WHERE league_id = $1`,
      [leagueId]
    );
    const leagueMemberOf = (userId: number) => lm.find((m) => m.user_id === userId)!.id;
    await insertSeasonMember(db.pool, {
      season_id: season.id,
      user_id: owner.id,
      league_member_id: leagueMemberOf(owner.id),
      role: "OWNER"
    });
    await insertSeasonMember(db.pool, {
      season_id: season.id,
      user_id: coOwner.id,
      league_member_id: leagueMemberOf(coOwner.id)
    });
    const seasonBefore = await seasonMemberIds(season.id);

    // Circuit changes leave the Season alone.
    const id = await createId();
    await api.post(`/circuit-leagues/${id}/join`).set(auth(member));
    await api.post(`/circuit-leagues/${id}/leave`).set(auth(owner));
    expect(await seasonMemberIds(season.id)).toEqual(seasonBefore);
    const circuitBefore = await circuitMemberIds(id);
    expect(circuitBefore).toEqual([member.id]);

    // Season changes leave the Circuit alone.
    const added = await api
      .post(`/seasons/${season.id}/members`)
      .set(auth(owner))
      .send({ user_id: member.id });
    expect(added.status).toBe(201);
    const left = await api.post(`/seasons/${season.id}/leave`).set(auth(coOwner));
    expect(left.status).toBe(200);
    expect(await seasonMemberIds(season.id)).toEqual(
      [owner.id, member.id].sort((a, b) => a - b)
    );
    expect(await circuitMemberIds(id)).toEqual(circuitBefore);
  });

  describe("schema", () => {
    it("keeps a league's event and category rows inside its own Circuit", async () => {
      const id = await createId();
      const other = await insertCircuit();
      const foreignEvent = await insertEvent(other, "other", 0, false);
      const foreignCategory = await insertCategory(other, "other", "FILM");
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_league_event (circuit_league_id, circuit_id, circuit_event_id)
             VALUES ($1, $2, $3)`,
            [id, other, foreignEvent]
          )
        )
      ).toBe("23503");
      expect(
        await pgErrorCode(
          db.pool.query(
            `INSERT INTO circuit_league_category
               (circuit_league_id, circuit_id, circuit_category_id)
             VALUES ($1, $2, $3)`,
            [id, circuitId, foreignCategory]
          )
        )
      ).toBe("23503");
    });

    it("ties the status to initialized_at and bounds the settings", async () => {
      const id = await createId();
      const update = (sql: string) =>
        pgErrorCode(
          db.pool.query(`UPDATE circuit_league SET ${sql} WHERE id = $1`, [id])
        );
      expect(await update(`status = 'INITIALIZED'`)).toBe("23514");
      expect(await update(`initialized_at = now()`)).toBe("23514");
      expect(await update(`roster_size = 0`)).toBe("23514");
      expect(await update(`roster_size = 65`)).toBe("23514");
      expect(await update(`draft_type = 'LINEAR'`)).toBe("23514");
      expect(await update(`pick_timer_seconds = -1`)).toBe("23514");
      expect(await update(`nomination_points = -1`)).toBe("23514");
      expect(
        await pgErrorCode(
          db.pool.query(
            `UPDATE circuit_league_category SET max_owned = 0 WHERE circuit_league_id = $1`,
            [id]
          )
        )
      ).toBe("23514");
      expect(
        await pgErrorCode(
          db.pool.query(
            `UPDATE circuit_league_event SET weight = 0 WHERE circuit_league_id = $1`,
            [id]
          )
        )
      ).toBe("23514");
    });
  });
});
