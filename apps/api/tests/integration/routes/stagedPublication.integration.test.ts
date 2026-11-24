import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { circuitDraftSweeperPass } from "../../../src/services/circuit/circuitDraft.js";
import { rebuildCircuitScores } from "../../../src/services/circuit/circuitScoring.js";
import { runDueCircuitWaivers } from "../../../src/services/circuit/circuitWaiverScheduler.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertCeremonyWinner,
  insertFilm,
  insertLeague,
  insertLeagueMember,
  insertNomination,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

// Seasons set up while a ceremony or Circuit is visible but not yet live:
// everything before the draft works, and nothing from the draft on runs
// until it goes live.

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";

type User = { id: number; username: string };

function auth(user: User) {
  const token = signTestToken(
    { sub: String(user.id), username: user.username },
    AUTH_SECRET
  );
  return { Authorization: `Bearer ${token}` };
}

const count = async (sql: string, params: unknown[] = []) =>
  (await db.pool.query<{ n: number }>(sql, params)).rows[0]!.n;

describe("staged publication", () => {
  let admin: User;
  let commissioner: User;
  let friend: User;

  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3131";
    process.env.AUTH_SECRET = AUTH_SECRET;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
    // A fresh server per test, so per-server rate limiters start empty.
    api = createApiAgent(createServer({ db: db.pool }));
    admin = await insertUser(db.pool, { username: "admin" });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [admin.id]);
    commissioner = await insertUser(db.pool, { username: "commissioner" });
    friend = await insertUser(db.pool, { username: "friend" });
  });

  describe("ceremony seasons", () => {
    let ceremonyId: number;
    let categoryId: number;
    let nominationIds: number[];

    beforeEach(async () => {
      ceremonyId = (await insertCeremony(db.pool, {}, false)).id;
      await db.pool.query(`UPDATE ceremony SET status = 'PUBLISHED' WHERE id = $1`, [
        ceremonyId
      ]);
      categoryId = (await insertCategoryEdition(db.pool, { ceremony_id: ceremonyId })).id;
      nominationIds = [];
      for (let i = 0; i < 2; i += 1) {
        const nomination = await insertNomination(db.pool, {
          category_edition_id: categoryId,
          ceremony_id: ceremonyId
        });
        nominationIds.push(nomination.id);
      }
    });

    const ceremonyStatus = async () =>
      (
        await db.pool.query<{ status: string }>(
          `SELECT status FROM ceremony WHERE id = $1`,
          [ceremonyId]
        )
      ).rows[0]!.status;

    const openCeremony = () =>
      api.post(`/admin/ceremonies/${ceremonyId}/open`).set(auth(admin)).send();

    const startDraft = (draftId: number) =>
      api.post(`/drafts/${draftId}/start`).set(auth(commissioner)).send();

    /** League, season and pending draft through the API, with the friend joined by invite. */
    async function setUpSeason(forCeremony = ceremonyId) {
      const league = await api
        .post("/leagues")
        .set(auth(commissioner))
        .send({ name: "Early Birds" });
      expect(league.status).toBe(201);
      const leagueId = (league.body as { league: { id: number } }).league.id;

      const created = await api
        .post(`/leagues/${leagueId}/seasons`)
        .set(auth(commissioner))
        .send({ ceremony_id: forCeremony });
      if (created.status !== 201) return { created };
      const { season, draft } = created.body as {
        season: { id: number; ceremony_id: number };
        draft: { id: number; status: string };
      };

      const invite = await api
        .post(`/seasons/${season.id}/invites`)
        .set(auth(commissioner))
        .send({});
      expect(invite.status).toBe(201);
      const accepted = await api
        .post(`/seasons/invites/token/${(invite.body as { token: string }).token}/accept`)
        .set(auth(friend))
        .send({});
      expect(accepted.status).toBe(200);

      return { created, leagueId, season, draft };
    }

    const seasonMemberIds = async (seasonId: number) =>
      (
        await db.pool.query<{ user_id: number }>(
          `SELECT user_id::int FROM season_member WHERE season_id = $1 ORDER BY user_id`,
          [seasonId]
        )
      ).rows.map((r) => r.user_id);

    it("sets up a season and invites while published, and starts the draft once open", async () => {
      const { created, season, draft } = await setUpSeason();
      expect(created.status).toBe(201);
      expect(season!.ceremony_id).toBe(ceremonyId);
      expect(draft!.status).toBe("PENDING");
      expect(await seasonMemberIds(season!.id)).toEqual(
        [commissioner.id, friend.id].sort((a, b) => a - b)
      );

      const early = await startDraft(draft!.id);
      expect(early.status).toBe(409);
      expect(early.body.error).toMatchObject({
        code: "CEREMONY_NOT_ACTIVE",
        message: "This ceremony isn't open yet. You can start the draft once it is."
      });
      expect(await count(`SELECT COUNT(*)::int AS n FROM draft_seat`)).toBe(0);
      // The refused start leaves the season's invites and members alone.
      expect(await seasonMemberIds(season!.id)).toHaveLength(2);

      expect((await openCeremony()).status).toBe(200);
      const started = await startDraft(draft!.id);
      expect(started.status).toBe(200);
      expect(started.body.draft.status).toBe("IN_PROGRESS");
    });

    it("lists a season set up while published as upcoming, with the ceremony's status", async () => {
      const { leagueId, season } = await setUpSeason();
      type Listed = { id: number; ceremony_status: string; is_active_ceremony: boolean };
      for (const path of [
        `/leagues/${leagueId}/seasons`,
        `/seasons/leagues/${leagueId}/seasons`
      ]) {
        const listed = await api.get(path).set(auth(friend));
        expect(listed.status).toBe(200);
        const row = (listed.body as { seasons: Listed[] }).seasons.find(
          (s) => s.id === season!.id
        );
        expect(row).toMatchObject({
          ceremony_status: "PUBLISHED",
          is_active_ceremony: true
        });
      }
    });

    it("still refuses a season against a draft ceremony", async () => {
      const draftCeremony = await insertCeremony(db.pool, {}, false);
      const { created } = await setUpSeason(draftCeremony.id);
      expect(created.status).toBe(409);
      expect(created.body.error.code).toBe("CEREMONY_NOT_ACTIVE");
    });

    it("refuses picks before the ceremony opens", async () => {
      const { draft } = await setUpSeason();
      const res = await api
        .post(`/drafts/${draft!.id}/picks`)
        .set(auth(commissioner))
        .send({ nomination_id: nominationIds[0], request_id: "early-pick" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DRAFT_NOT_IN_PROGRESS");
      expect(await count(`SELECT COUNT(*)::int AS n FROM draft_pick`)).toBe(0);
    });

    it("keeps auto-draft settings but makes no auto-picks before the ceremony opens", async () => {
      const { draft } = await setUpSeason();
      const plan = await api
        .post(`/drafts/${draft!.id}/autodraft`)
        .set(auth(friend))
        .send({ enabled: true, strategy: "RANDOM" });
      expect(plan.status).toBe(200);

      const tick = await api.post(`/drafts/${draft!.id}/tick`).set(auth(friend)).send();
      expect(tick.status).toBe(200);
      expect(tick.body.draft).toMatchObject({
        status: "PENDING",
        current_pick_number: null,
        pick_deadline_at: null
      });
      expect(await count(`SELECT COUNT(*)::int AS n FROM draft_pick`)).toBe(0);
    });

    it("scores nothing before the ceremony opens, even with a winner recorded", async () => {
      const { draft } = await setUpSeason();
      await insertCeremonyWinner(db.pool, {
        ceremony_id: ceremonyId,
        category_edition_id: categoryId,
        nomination_id: nominationIds[0]
      });
      const res = await api.get(`/drafts/${draft!.id}/standings`).set(auth(friend));
      expect(res.status).toBe(200);
      expect(res.body.draft.status).toBe("PENDING");
      expect(res.body.standings).toEqual([]);
      expect(res.body.results).toEqual([]);
    });

    it("keeps categories and nominees editable with a season set up, and open still needs every category filled", async () => {
      await setUpSeason();
      const send = (method: "post" | "put" | "patch", path: string, body: object) =>
        api[method](path).set(auth(admin)).send(body);

      const family = await insertCategoryFamily(db.pool);
      const added = await send("post", `/admin/ceremonies/${ceremonyId}/categories`, {
        family_id: family.id,
        unit_kind: "FILM"
      });
      expect(added.status).toBe(201);
      const newCategoryId = (added.body as { category: { id: number } }).category.id;

      const incomplete = await openCeremony();
      expect(incomplete.status).toBe(409);
      expect(incomplete.body.error.code).toBe("CEREMONY_INCOMPLETE");
      expect(
        incomplete.body.error.details.incomplete_categories.map(
          (c: { id: number }) => c.id
        )
      ).toEqual([newCategoryId]);
      expect(await ceremonyStatus()).toBe("PUBLISHED");

      const film = await insertFilm(db.pool);
      const nominee = await send("post", `/admin/ceremonies/${ceremonyId}/nominations`, {
        category_edition_id: newCategoryId,
        film_id: film.id
      });
      expect(nominee.status).toBe(201);

      const categoriesReordered = await send(
        "put",
        `/admin/ceremonies/${ceremonyId}/categories/reorder`,
        { category_ids: [newCategoryId, categoryId] }
      );
      expect(categoriesReordered.status).toBe(200);
      const nomineesReordered = await send(
        "put",
        `/admin/ceremonies/${ceremonyId}/nominations/reorder`,
        { category_edition_id: categoryId, nomination_ids: [...nominationIds].reverse() }
      );
      expect(nomineesReordered.status).toBe(200);
      const edited = await send("patch", `/admin/category-editions/${categoryId}`, {
        sort_index: 7
      });
      expect(edited.status).toBe(200);

      expect((await openCeremony()).status).toBe(200);
      expect(await ceremonyStatus()).toBe("ACTIVE");
    });

    it("refuses to withdraw a ceremony with a season set up, and is audited once empty", async () => {
      const withdraw = () =>
        api.post(`/admin/ceremonies/${ceremonyId}/unpublish`).set(auth(admin)).send();
      const { season } = await setUpSeason();

      const refused = await withdraw();
      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatchObject({
        code: "CEREMONY_HAS_SEASONS",
        details: { season_count: 1 }
      });
      expect(await ceremonyStatus()).toBe("PUBLISHED");

      await db.pool.query(`UPDATE season SET status = 'CANCELLED' WHERE id = $1`, [
        season!.id
      ]);
      const withdrawn = await withdraw();
      expect(withdrawn.status).toBe(200);
      expect(await ceremonyStatus()).toBe("DRAFT");
      expect(
        await count(
          `SELECT COUNT(*)::int AS n FROM admin_audit_log
           WHERE action = 'unpublish_ceremony' AND target_id = $1`,
          [ceremonyId]
        )
      ).toBe(1);

      // Once open for leagues, there is no way back.
      await db.pool.query(`UPDATE ceremony SET status = 'ACTIVE' WHERE id = $1`, [
        ceremonyId
      ]);
      const fromActive = await withdraw();
      expect(fromActive.status).toBe(409);
      expect(fromActive.body.error.code).toBe("CEREMONY_NOT_PUBLISHED");
    });
  });

  describe("Circuit seasons", () => {
    let leagueId: number;
    let circuitId: number;
    let selections: number[];

    async function insertCircuit(status: "DRAFT" | "PUBLISHED" | "ACTIVE" | "ARCHIVED") {
      const { rows } = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit (code, name, status, activated_at, published_at)
         VALUES ('c-' || floor(random() * 1e9)::text, 'Awards', $1,
           CASE WHEN $1 IN ('ACTIVE', 'ARCHIVED') THEN now() END,
           CASE WHEN $1 = 'PUBLISHED' THEN now() END)
         RETURNING id::int`,
        [status]
      );
      return rows[0]!.id;
    }

    beforeEach(async () => {
      const league = await insertLeague(db.pool, {
        created_by_user_id: commissioner.id
      });
      leagueId = league.id;
      await insertLeagueMember(db.pool, {
        league_id: leagueId,
        user_id: commissioner.id,
        role: "OWNER"
      });
      await insertLeagueMember(db.pool, { league_id: leagueId, user_id: friend.id });

      circuitId = await insertCircuit("PUBLISHED");
      const event = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_event (circuit_id, code, name, sort_index)
         VALUES ($1, 'guild', 'Guild', 0) RETURNING id::int`,
        [circuitId]
      );
      const ceremony = await insertCeremony(db.pool, {}, false);
      await db.pool.query(`UPDATE ceremony SET status = 'ACTIVE' WHERE id = $1`, [
        ceremony.id
      ]);
      await db.pool.query(
        `INSERT INTO circuit_ceremony (circuit_id, ceremony_id, circuit_event_id, sort_index)
         VALUES ($1, $2, $3, 0)`,
        [circuitId, ceremony.id, event.rows[0]!.id]
      );
      await insertCeremonyWinner(db.pool, { ceremony_id: ceremony.id });
      const category = await db.pool.query<{ id: number }>(
        `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
         VALUES ($1, 'picture', 'Picture', 'FILM', 0) RETURNING id::int`,
        [circuitId]
      );
      selections = [];
      for (let i = 0; i < 4; i += 1) {
        const film = await insertFilm(db.pool);
        const { rows } = await db.pool.query<{ id: number }>(
          `INSERT INTO circuit_selection (circuit_category_id, film_tmdb_id, film_id)
           VALUES ($1, $2, $3) RETURNING id::int`,
          [category.rows[0]!.id, film.id, film.id]
        );
        selections.push(rows[0]!.id);
      }
    });

    async function setSuperAdmin(user: User, on: boolean) {
      await db.pool.query(
        `UPDATE app_user SET is_admin = $2, admin_role = $3 WHERE id = $1`,
        [user.id, on, on ? "SUPER_ADMIN" : null]
      );
    }

    // Creating is gated to super admins, so the commissioner is one only for the request.
    async function createSeason(body: object) {
      await setSuperAdmin(commissioner, true);
      try {
        return await api
          .post(`/leagues/${leagueId}/circuits`)
          .set(auth(commissioner))
          .send(body);
      } finally {
        await setSuperAdmin(commissioner, false);
      }
    }

    const seasonUrl = (id: number) => `/circuit-leagues/${id}`;
    const startDraft = (id: number) =>
      api
        .post(`${seasonUrl(id)}/draft`)
        .set(auth(commissioner))
        .send();
    const activate = () =>
      api.post(`/admin/circuits/${circuitId}/activate`).set(auth(admin)).send();

    /** A full season through the API, from create with settings to initialised. */
    async function setUpSeason() {
      const created = await createSeason({
        circuit_id: circuitId,
        settings: { roster_size: 2, nomination_points: 2, auto_draft_enabled: true }
      });
      expect(created.status).toBe(201);
      const detail = created.body as {
        circuit_league: { id: number; roster_size: number; nomination_points: number };
      };
      expect(detail.circuit_league).toMatchObject({
        roster_size: 2,
        nomination_points: 2
      });
      const id = detail.circuit_league.id;

      expect(
        (
          await api
            .post(`${seasonUrl(id)}/join`)
            .set(auth(friend))
            .send()
        ).status
      ).toBe(200);
      const settings = await api
        .patch(`${seasonUrl(id)}/settings`)
        .set(auth(commissioner))
        .send({ win_bonus_points: 4 });
      expect(settings.status).toBe(200);
      expect(settings.body.circuit_league.win_bonus_points).toBe(4);

      const queued = await api
        .post(`${seasonUrl(id)}/queue`)
        .set(auth(friend))
        .send({ selection_id: selections[0] });
      expect(queued.status).toBe(201);
      const staged = await api
        .post(`${seasonUrl(id)}/queue/staged`)
        .set(auth(friend))
        .send({ selection_id: selections[1] });
      expect(staged.status).toBe(201);

      const initialized = await api
        .post(`${seasonUrl(id)}/initialize`)
        .set(auth(commissioner))
        .send();
      expect(initialized.status).toBe(200);
      expect(initialized.body.circuit_league.status).toBe("INITIALIZED");
      return id;
    }

    it("sets up a full season while published, and starts the draft once active", async () => {
      const id = await setUpSeason();

      const early = await startDraft(id);
      expect(early.status).toBe(409);
      expect(early.body.error).toMatchObject({
        code: "CIRCUIT_NOT_LIVE",
        message: "This season isn't open yet. You can start the draft once it is."
      });
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft`)).toBe(0);

      expect((await activate()).status).toBe(200);
      const started = await startDraft(id);
      expect(started.status).toBe(201);
      expect(started.body.draft.status).toBe("IN_PROGRESS");
    });

    it("still hides a draft Circuit and refuses an archived one", async () => {
      expect(
        (await createSeason({ circuit_id: await insertCircuit("DRAFT") })).status
      ).toBe(404);
      expect(
        (await createSeason({ circuit_id: await insertCircuit("ARCHIVED") })).status
      ).toBe(409);
    });

    it("refuses picks and roster moves before the Circuit goes live", async () => {
      const id = await setUpSeason();
      expect((await startDraft(id)).status).toBe(409);

      const draft = await api.get(`${seasonUrl(id)}/draft`).set(auth(friend));
      expect(draft.status).toBe(404);
      expect(draft.body.error.code).toBe("CIRCUIT_DRAFT_NOT_STARTED");
      const add = await api
        .post(`${seasonUrl(id)}/free-agents`)
        .set(auth(friend))
        .send({ selection_id: selections[2] });
      expect(add.status).toBe(409);
      expect(add.body.error.code).toBe("CIRCUIT_LEAGUE_NOT_IN_SEASON");
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_ownership`)).toBe(0);
    });

    it("gives the draft sweeper nothing to auto-pick before the Circuit goes live", async () => {
      const id = await setUpSeason();
      expect((await startDraft(id)).status).toBe(409);

      const client = await db.pool.connect();
      try {
        expect(await circuitDraftSweeperPass.listExpired(client, 25)).toEqual([]);
        expect(await circuitDraftSweeperPass.nextWaitMs(client)).toBeNull();
      } finally {
        client.release();
      }
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_draft_pick`)).toBe(0);
    });

    it("refuses waiver claims and runs no waivers before the Circuit goes live", async () => {
      const id = await setUpSeason();
      const claim = await api
        .post(`${seasonUrl(id)}/claims`)
        .set(auth(friend))
        .send({ selection_id: selections[2] });
      expect(claim.status).toBe(409);
      expect(claim.body.error.code).toBe("CIRCUIT_LEAGUE_NOT_IN_SEASON");

      const farFuture = new Date(Date.now() + 365 * 86_400_000);
      expect(await runDueCircuitWaivers(db.pool, farFuture)).toEqual([]);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_waiver_run`)).toBe(0);
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_waiver_claim`)).toBe(0);
    });

    it("scores nothing before the Circuit goes live, even with a winner recorded", async () => {
      const id = await setUpSeason();
      await rebuildCircuitScores(db.pool, { circuitLeagueId: id });
      expect(await count(`SELECT COUNT(*)::int AS n FROM circuit_score_entry`)).toBe(0);

      const standings = await api.get(`${seasonUrl(id)}/standings`).set(auth(friend));
      expect(standings.status).toBe(200);
      const rows = standings.body.standings as Array<{ points: number }>;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.points === 0)).toBe(true);
    });

    it("refuses to withdraw a Circuit with a season set up, and is audited once empty", async () => {
      const withdraw = () =>
        api.post(`/admin/circuits/${circuitId}/unpublish`).set(auth(admin)).send();
      const circuitStatus = async () =>
        (
          await db.pool.query<{ status: string }>(
            `SELECT status FROM circuit WHERE id = $1`,
            [circuitId]
          )
        ).rows[0]!.status;
      const created = await createSeason({ circuit_id: circuitId });
      expect(created.status).toBe(201);

      const refused = await withdraw();
      expect(refused.status).toBe(409);
      expect(refused.body.error).toMatchObject({
        code: "CIRCUIT_HAS_SEASONS",
        details: { season_count: 1 }
      });
      expect(await circuitStatus()).toBe("PUBLISHED");

      await db.pool.query(`DELETE FROM circuit_league WHERE circuit_id = $1`, [
        circuitId
      ]);
      const withdrawn = await withdraw();
      expect(withdrawn.status).toBe(200);
      expect(await circuitStatus()).toBe("DRAFT");
      expect(
        await count(
          `SELECT COUNT(*)::int AS n FROM admin_audit_log
           WHERE action = 'unpublish_circuit' AND target_id = $1`,
          [circuitId]
        )
      ).toBe(1);

      // Activate still works straight from DRAFT, and there is no way back from ACTIVE.
      expect((await activate()).status).toBe(200);
      expect(await circuitStatus()).toBe("ACTIVE");
      const fromActive = await withdraw();
      expect(fromActive.status).toBe(409);
      expect(fromActive.body.error.code).toBe("CIRCUIT_NOT_PUBLISHED");
    });
  });
});
