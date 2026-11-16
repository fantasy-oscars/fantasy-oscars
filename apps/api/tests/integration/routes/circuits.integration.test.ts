import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCategoryFamily,
  insertCeremony,
  insertIcon,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let token: string;

const AUTH_SECRET = "test-secret";

type EventRow = { id: number; code: string; name: string; sort_index: number };
type CategoryRow = {
  id: number;
  code: string;
  name: string;
  kind: string;
  sort_index: number;
  category_family_id: number | null;
  icon_id: number | null;
  icon_code: string | null;
  icon_variant: string;
};

type CircuitDetail = {
  circuit: { id: number; code: string; status: string; activated_at: string | null };
  events: EventRow[];
  categories: CategoryRow[];
  ceremonies: Array<{
    ceremony_id: number;
    circuit_event_id: number;
    event_code: string;
    event_name: string;
    nominations_on: string | null;
    results_on: string | null;
  }>;
  category_editions: Array<{
    id: number;
    family_id: number | null;
    circuit_category_id: number | null;
    suggested_circuit_category_id: number | null;
  }>;
  readiness: { missing_dates: Array<{ ceremony_id: number; missing: string[] }> };
  occasions: Array<{ ceremony_id: number; kind: string; date: string | null }>;
};

type CeremonyCircuits = {
  associations: Array<{
    circuit_id: number;
    circuit_event_id: number;
    event_code: string;
  }>;
  circuits: Array<{ id: number; events: EventRow[] }>;
};

type Association = { created: boolean; circuit_event_id: number };

type ErrorBody = { error: { code: string; details?: Record<string, unknown> } };

async function send<T>(
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: T }> {
  let req = api[method](path).set({ Authorization: `Bearer ${token}` });
  if (body) req = req.set("content-type", "application/json").send(body);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function getPublic<T>(path: string): Promise<{ status: number; json: T }> {
  const res = await api.get(path);
  return { status: res.status, json: res.body as T };
}

async function createCircuit(code = "2026-27") {
  const res = await send<CircuitDetail>("post", "/admin/circuits", {
    code,
    name: `Circuit ${code}`
  });
  expect(res.status).toBe(201);
  return res.json.circuit.id;
}

async function detailOf(circuitId: number) {
  const res = await send<CircuitDetail>("get", `/admin/circuits/${circuitId}`);
  expect(res.status).toBe(200);
  return res.json;
}

async function ceremonyWithStatus(status = "PUBLISHED", fields: { name?: string } = {}) {
  const ceremony = await insertCeremony(db.pool, fields, false);
  await db.pool.query(`UPDATE ceremony SET status = $2 WHERE id = $1`, [
    ceremony.id,
    status
  ]);
  return ceremony;
}

/** Adds a ceremony from the Circuit screen; without an event it gets its own. */
async function addCeremony(circuitId: number, ceremonyId: number, eventId?: number) {
  const res = await send<Association>(
    "put",
    `/admin/circuits/${circuitId}/ceremonies/${ceremonyId}`,
    eventId === undefined ? {} : { circuit_event_id: eventId }
  );
  expect(res.status).toBe(200);
  return res.json;
}

async function template(kind: "FILM" | "PERFORMANCE" | "SONG", code?: string) {
  return insertCategoryFamily(db.pool, {
    default_unit_kind: kind,
    ...(code ? { code } : {})
  });
}

async function addCategory(circuitId: number, familyId: number) {
  const res = await send<{ category: CategoryRow }>(
    "post",
    `/admin/circuits/${circuitId}/categories`,
    { category_family_id: familyId }
  );
  expect(res.status).toBe(201);
  return res.json.category;
}

async function eventIds(circuitId: number) {
  const { rows } = await db.pool.query<{ id: number }>(
    `SELECT id::int FROM circuit_event WHERE circuit_id = $1 ORDER BY id`,
    [circuitId]
  );
  return rows.map((r) => r.id);
}

async function auditActions() {
  const { rows } = await db.pool.query<{
    action: string;
    target_type: string;
    target_id: number;
    actor_user_id: number;
  }>(
    `SELECT action, target_type, target_id::int, actor_user_id::int
     FROM admin_audit_log ORDER BY id`
  );
  return rows;
}

describe("circuit admin and public routes", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3122";
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
    const user = await insertUser(db.pool, { id: 1 });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = 1`);
    token = signTestToken({ sub: "1", username: user.username }, AUTH_SECRET);
  });

  describe("create", () => {
    it("inserts no events and no categories", async () => {
      const res = await send<CircuitDetail>("post", "/admin/circuits", {
        code: "2026-27",
        name: "Awards Season"
      });
      expect(res.status).toBe(201);
      expect(res.json.circuit).toMatchObject({ code: "2026-27", status: "DRAFT" });
      expect(res.json.events).toEqual([]);
      expect(res.json.categories).toEqual([]);
      const { rows } = await db.pool.query<{ events: number; categories: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM circuit_event) AS events,
           (SELECT COUNT(*)::int FROM circuit_category) AS categories`
      );
      expect(rows[0]).toEqual({ events: 0, categories: 0 });
    });

    it("refuses a duplicate code", async () => {
      await createCircuit();
      const res = await send<ErrorBody>("post", "/admin/circuits", {
        code: "2026-27",
        name: "Again"
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION_ERROR");
    });

    it("is admin-only", async () => {
      await insertUser(db.pool, { id: 2 });
      token = signTestToken({ sub: "2", username: "player" }, AUTH_SECRET);
      const res = await send<ErrorBody>("post", "/admin/circuits", {
        code: "x",
        name: "x"
      });
      expect(res.status).toBe(403);
    });
  });

  describe("ceremonies and events", () => {
    it("adds any ceremony, giving it a one-ceremony event named after it", async () => {
      const circuitId = await createCircuit();
      const globes = await ceremonyWithStatus("DRAFT", { name: "Golden Globe Awards" });
      const added = await addCeremony(circuitId, globes.id);
      expect(added.created).toBe(true);

      const detail = await detailOf(circuitId);
      expect(detail.events).toEqual([
        expect.objectContaining({
          id: added.circuit_event_id,
          name: "Golden Globe Awards",
          code: globes.code,
          sort_index: 0
        })
      ]);
      expect(detail.ceremonies).toEqual([
        expect.objectContaining({
          ceremony_id: globes.id,
          circuit_event_id: added.circuit_event_id
        })
      ]);
    });

    it("shows and edits the association from the ceremony screen", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      const other = await ceremonyWithStatus();
      const own = await addCeremony(circuitId, ceremony.id);
      const target = await addCeremony(circuitId, other.id);

      const fromCeremony = await send<CeremonyCircuits>(
        "get",
        `/admin/ceremonies/${ceremony.id}/circuits`
      );
      expect(fromCeremony.json.associations).toEqual([
        expect.objectContaining({
          circuit_id: circuitId,
          circuit_event_id: own.circuit_event_id
        })
      ]);
      expect(fromCeremony.json.circuits[0]!.events).toHaveLength(2);

      const moved = await send<Association>(
        "put",
        `/admin/ceremonies/${ceremony.id}/circuits/${circuitId}`,
        { circuit_event_id: target.circuit_event_id }
      );
      expect(moved.status).toBe(200);
      expect(moved.json.created).toBe(false);

      const detail = await detailOf(circuitId);
      expect(detail.ceremonies.map((c) => c.circuit_event_id)).toEqual([
        target.circuit_event_id,
        target.circuit_event_id
      ]);
      expect(await eventIds(circuitId)).toEqual([target.circuit_event_id]);

      const removed = await send(
        "delete",
        `/admin/ceremonies/${ceremony.id}/circuits/${circuitId}`
      );
      expect(removed.status).toBe(200);
      expect((await detailOf(circuitId)).ceremonies.map((c) => c.ceremony_id)).toEqual([
        other.id
      ]);
    });

    it("an association made from the ceremony side gets its own event", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus("DRAFT");
      const res = await send<Association>(
        "put",
        `/admin/ceremonies/${ceremony.id}/circuits/${circuitId}`
      );
      expect(res.status).toBe(200);
      expect(res.json.created).toBe(true);
      expect(await eventIds(circuitId)).toEqual([res.json.circuit_event_id]);
    });

    it("moving a ceremony deletes the event it leaves only when that event is empty", async () => {
      const circuitId = await createCircuit();
      const [a, b, c] = [
        await ceremonyWithStatus(),
        await ceremonyWithStatus(),
        await ceremonyWithStatus()
      ];
      const eventA = (await addCeremony(circuitId, a.id)).circuit_event_id;
      const eventB = (await addCeremony(circuitId, b.id)).circuit_event_id;
      await addCeremony(circuitId, c.id, eventB);

      await addCeremony(circuitId, b.id, eventA);
      expect(await eventIds(circuitId)).toEqual([eventA, eventB]);

      await addCeremony(circuitId, c.id, eventA);
      expect(await eventIds(circuitId)).toEqual([eventA]);
    });

    it("ungroups a ceremony into its own event, and leaves a lone ceremony where it is", async () => {
      const circuitId = await createCircuit();
      const a = await ceremonyWithStatus();
      const b = await ceremonyWithStatus();
      const shared = (await addCeremony(circuitId, a.id)).circuit_event_id;
      await addCeremony(circuitId, b.id, shared);

      const ungrouped = await addCeremony(circuitId, b.id);
      expect(ungrouped.created).toBe(false);
      expect(ungrouped.circuit_event_id).not.toBe(shared);

      const again = await addCeremony(circuitId, b.id);
      expect(again.circuit_event_id).toBe(ungrouped.circuit_event_id);
      expect(await eventIds(circuitId)).toEqual([shared, ungrouped.circuit_event_id]);
    });

    it("creates an event that groups ceremonies, deleting the events they leave", async () => {
      const circuitId = await createCircuit();
      const guilds = [await ceremonyWithStatus(), await ceremonyWithStatus()];
      const oscars = await ceremonyWithStatus();
      for (const g of guilds) await addCeremony(circuitId, g.id);
      const oscarsEvent = (await addCeremony(circuitId, oscars.id)).circuit_event_id;

      const res = await send<{ event: EventRow }>(
        "post",
        `/admin/circuits/${circuitId}/events`,
        { name: "Guild Awards", ceremony_ids: guilds.map((g) => g.id) }
      );
      expect(res.status).toBe(201);
      expect(res.json.event).toMatchObject({
        code: "guild-awards",
        name: "Guild Awards",
        sort_index: 3
      });

      const detail = await detailOf(circuitId);
      expect(detail.events.map((e) => e.id)).toEqual([oscarsEvent, res.json.event.id]);
      expect(
        detail.ceremonies
          .filter((c) => c.circuit_event_id === res.json.event.id)
          .map((c) => c.ceremony_id)
      ).toEqual(guilds.map((g) => g.id));

      const duplicate = await send<ErrorBody>(
        "post",
        `/admin/circuits/${circuitId}/events`,
        { name: "Other", code: "guild-awards" }
      );
      expect(duplicate.status).toBe(400);

      const outsider = await ceremonyWithStatus();
      const notInCircuit = await send<ErrorBody>(
        "post",
        `/admin/circuits/${circuitId}/events`,
        { name: "Other", ceremony_ids: [outsider.id] }
      );
      expect(notInCircuit.status).toBe(400);
      expect(await eventIds(circuitId)).toEqual([oscarsEvent, res.json.event.id]);
    });

    it("renames, reorders and deletes events; deleting ungroups and keeps mappings", async () => {
      const circuitId = await createCircuit();
      const a = await ceremonyWithStatus();
      const b = await ceremonyWithStatus();
      const first = (await addCeremony(circuitId, a.id)).circuit_event_id;
      await addCeremony(circuitId, b.id, first);
      const solo = await ceremonyWithStatus();
      const second = (await addCeremony(circuitId, solo.id)).circuit_event_id;
      const picture = await addCategory(circuitId, (await template("FILM")).id);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: a.id });
      await send("put", `/admin/circuits/${circuitId}/mappings/${edition.id}`, {
        circuit_category_id: picture.id
      });

      const renamed = await send<{ event: EventRow }>(
        "patch",
        `/admin/circuits/${circuitId}/events/${first}`,
        { name: "Guilds", code: "guilds" }
      );
      expect(renamed.json.event).toMatchObject({ name: "Guilds", code: "guilds" });

      const badOrder = await send<ErrorBody>(
        "put",
        `/admin/circuits/${circuitId}/events/order`,
        { event_ids: [second] }
      );
      expect(badOrder.status).toBe(400);
      const reordered = await send<{ events: EventRow[] }>(
        "put",
        `/admin/circuits/${circuitId}/events/order`,
        { event_ids: [second, first] }
      );
      expect(reordered.json.events.map((e) => [e.id, e.sort_index])).toEqual([
        [second, 0],
        [first, 1]
      ]);

      const deleted = await send<{
        ungrouped: Array<{ ceremony_id: number; circuit_event_id: number }>;
      }>("delete", `/admin/circuits/${circuitId}/events/${first}`);
      expect(deleted.status).toBe(200);
      expect(deleted.json.ungrouped.map((u) => u.ceremony_id)).toEqual([a.id, b.id]);

      const detail = await detailOf(circuitId);
      expect(detail.events.map((e) => e.id)).not.toContain(first);
      expect(detail.events).toHaveLength(3);
      expect(new Set(detail.ceremonies.map((c) => c.circuit_event_id)).size).toBe(3);
      expect(detail.category_editions).toEqual([
        expect.objectContaining({ id: edition.id, circuit_category_id: picture.id })
      ]);
      expect(
        (await send("delete", `/admin/circuits/${circuitId}/events/${first}`)).status
      ).toBe(404);
    });

    it("removing a ceremony drops its mappings and its event when empty", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      const picture = await addCategory(circuitId, (await template("FILM")).id);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await send("put", `/admin/circuits/${circuitId}/mappings/${edition.id}`, {
        circuit_category_id: picture.id
      });

      const del = await send<{ mappings_removed: number }>(
        "delete",
        `/admin/circuits/${circuitId}/ceremonies/${ceremony.id}`
      );
      expect(del.json.mappings_removed).toBe(1);
      expect(await eventIds(circuitId)).toEqual([]);
      const { rows } = await db.pool.query(`SELECT 1 FROM circuit_mapping`);
      expect(rows).toEqual([]);
      expect(
        (await send("delete", `/admin/circuits/${circuitId}/ceremonies/${ceremony.id}`))
          .status
      ).toBe(404);
    });

    it("refuses an event from another Circuit and an unknown ceremony", async () => {
      const a = await createCircuit("circuit-a");
      const b = await createCircuit("circuit-b");
      const ceremony = await ceremonyWithStatus();
      const otherEvent = (await addCeremony(b, ceremony.id)).circuit_event_id;
      const wrongEvent = await send<ErrorBody>(
        "put",
        `/admin/circuits/${a}/ceremonies/${ceremony.id}`,
        { circuit_event_id: otherEvent }
      );
      expect(wrongEvent.status).toBe(400);
      const missing = await send<ErrorBody>(
        "put",
        `/admin/circuits/${a}/ceremonies/999999`,
        {}
      );
      expect(missing.status).toBe(404);
    });
  });

  describe("categories", () => {
    it("copies name, icon and kind from the template: PERFORMANCE gives ACTING, FILM gives FILM", async () => {
      const circuitId = await createCircuit();
      const icon = await insertIcon(db.pool, { code: "mask" });
      const actor = await insertCategoryFamily(db.pool, {
        code: "actor",
        name: "Lead Actor",
        icon_id: icon.id,
        icon_variant: "inverted",
        default_unit_kind: "PERFORMANCE"
      });
      const picture = await template("FILM", "picture");

      const acting = await addCategory(circuitId, actor.id);
      expect(acting).toMatchObject({
        code: "actor",
        name: "Lead Actor",
        kind: "ACTING",
        category_family_id: actor.id,
        icon_id: icon.id,
        icon_code: "mask",
        icon_variant: "inverted",
        sort_index: 0
      });
      expect(await addCategory(circuitId, picture.id)).toMatchObject({
        code: "picture",
        kind: "FILM",
        sort_index: 1
      });
      expect(await addCategory(circuitId, actor.id)).toMatchObject({
        code: "actor-2",
        kind: "ACTING"
      });

      await db.pool.query(`UPDATE category_family SET name = 'Changed' WHERE id = $1`, [
        actor.id
      ]);
      expect((await detailOf(circuitId)).categories[0]!.name).toBe("Lead Actor");
    });

    it("rejects a SONG template and an unknown template", async () => {
      const circuitId = await createCircuit();
      const song = await template("SONG");
      const rejected = await send<ErrorBody>(
        "post",
        `/admin/circuits/${circuitId}/categories`,
        { category_family_id: song.id }
      );
      expect(rejected.status).toBe(400);
      expect(rejected.json.error.code).toBe("VALIDATION_ERROR");
      const unknown = await send<ErrorBody>(
        "post",
        `/admin/circuits/${circuitId}/categories`,
        { category_family_id: 999999 }
      );
      expect(unknown.status).toBe(400);
      expect((await detailOf(circuitId)).categories).toEqual([]);
    });

    it("renames, reorders and removes categories; removing drops their mappings", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      const first = await addCategory(circuitId, (await template("FILM")).id);
      const second = await addCategory(circuitId, (await template("PERFORMANCE")).id);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await send("put", `/admin/circuits/${circuitId}/mappings/${edition.id}`, {
        circuit_category_id: first.id
      });

      const renamed = await send<{ category: CategoryRow }>(
        "patch",
        `/admin/circuits/${circuitId}/categories/${first.id}`,
        { name: "Picture" }
      );
      expect(renamed.json.category.name).toBe("Picture");

      expect(
        (
          await send<ErrorBody>("put", `/admin/circuits/${circuitId}/categories/order`, {
            category_ids: [first.id, 999999]
          })
        ).status
      ).toBe(400);
      const reordered = await send<{ categories: CategoryRow[] }>(
        "put",
        `/admin/circuits/${circuitId}/categories/order`,
        { category_ids: [second.id, first.id] }
      );
      expect(reordered.json.categories.map((c) => c.id)).toEqual([second.id, first.id]);

      const removed = await send<{ mappings_removed: number }>(
        "delete",
        `/admin/circuits/${circuitId}/categories/${first.id}`
      );
      expect(removed.json.mappings_removed).toBe(1);
      const detail = await detailOf(circuitId);
      expect(detail.categories.map((c) => c.id)).toEqual([second.id]);
      expect(detail.category_editions[0]!.circuit_category_id).toBeNull();
    });
  });

  describe("mappings", () => {
    it("maps two categories of one ceremony to one Circuit category, remapping in place", async () => {
      const circuitId = await createCircuit();
      const globes = await ceremonyWithStatus();
      const actor = await addCategory(circuitId, (await template("PERFORMANCE")).id);
      const director = await addCategory(circuitId, (await template("FILM")).id);
      const drama = await insertCategoryEdition(db.pool, { ceremony_id: globes.id });
      const comedy = await insertCategoryEdition(db.pool, { ceremony_id: globes.id });
      const path = (id: number) => `/admin/circuits/${circuitId}/mappings/${id}`;

      const unassociated = await send<ErrorBody>("put", path(drama.id), {
        circuit_category_id: actor.id
      });
      expect(unassociated.status).toBe(409);
      expect(unassociated.json.error.code).toBe("CIRCUIT_CEREMONY_NOT_ASSOCIATED");

      await addCeremony(circuitId, globes.id);
      for (const e of [drama, comedy]) {
        expect(
          (await send("put", path(e.id), { circuit_category_id: actor.id })).status
        ).toBe(200);
      }
      let detail = await detailOf(circuitId);
      expect(detail.category_editions.map((e) => e.circuit_category_id)).toEqual([
        actor.id,
        actor.id
      ]);

      await send("put", path(comedy.id), { circuit_category_id: director.id });
      detail = await detailOf(circuitId);
      expect(
        detail.category_editions.find((e) => e.id === comedy.id)!.circuit_category_id
      ).toBe(director.id);

      expect((await send("delete", path(drama.id))).status).toBe(204);
      expect((await send("delete", path(drama.id))).status).toBe(404);
    });

    it("refuses a category of another Circuit", async () => {
      const a = await createCircuit("circuit-a");
      const b = await createCircuit("circuit-b");
      const ceremony = await ceremonyWithStatus();
      await addCeremony(a, ceremony.id);
      const foreign = await addCategory(b, (await template("FILM")).id);
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      const res = await send<ErrorBody>(
        "put",
        `/admin/circuits/${a}/mappings/${edition.id}`,
        {
          circuit_category_id: foreign.id
        }
      );
      expect(res.status).toBe(400);
    });

    it("suggests the Circuit category built from the same template, saving nothing", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      const actorTemplate = await template("PERFORMANCE");
      const actor = await addCategory(circuitId, actorTemplate.id);
      const matching = await insertCategoryEdition(db.pool, {
        ceremony_id: ceremony.id,
        family_id: actorTemplate.id,
        code: "actor-drama"
      });
      const unrelated = await insertCategoryEdition(db.pool, {
        ceremony_id: ceremony.id
      });

      const detail = await detailOf(circuitId);
      expect(
        detail.category_editions.map((e) => [
          e.id,
          e.suggested_circuit_category_id,
          e.circuit_category_id
        ])
      ).toEqual([
        [matching.id, actor.id, null],
        [unrelated.id, null, null]
      ]);
      const { rows } = await db.pool.query(`SELECT 1 FROM circuit_mapping`);
      expect(rows).toEqual([]);
    });
  });

  describe("activation and dates", () => {
    it("activates with missing dates and returns the ceremonies that lack them", async () => {
      const circuitId = await createCircuit();
      const dated = await ceremonyWithStatus();
      const undated = await ceremonyWithStatus();
      await db.pool.query(
        `UPDATE ceremony SET nominations_on = '2026-12-05', results_on = '2027-01-04' WHERE id = $1`,
        [dated.id]
      );
      await addCeremony(circuitId, dated.id);
      await addCeremony(circuitId, undated.id);

      const res = await send<{
        circuit: { status: string; activated_at: string | null };
        readiness: CircuitDetail["readiness"];
      }>("post", `/admin/circuits/${circuitId}/activate`);
      expect(res.status).toBe(200);
      expect(res.json.circuit.status).toBe("ACTIVE");
      expect(res.json.circuit.activated_at).not.toBeNull();
      expect(res.json.readiness.missing_dates).toEqual([
        expect.objectContaining({
          ceremony_id: undated.id,
          missing: ["nominations_on", "results_on"]
        })
      ]);

      const again = await send<ErrorBody>(
        "post",
        `/admin/circuits/${circuitId}/activate`
      );
      expect(again.status).toBe(409);
      expect(again.json.error.code).toBe("CIRCUIT_NOT_DRAFT");
    });

    it("editing a date after activation leaves the Circuit ACTIVE", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      await send("post", `/admin/circuits/${circuitId}/activate`);

      const set = await send<{ ceremony: { nominations_on: string; results_on: null } }>(
        "patch",
        `/admin/ceremonies/${ceremony.id}/dates`,
        { nominations_on: "2027-01-21" }
      );
      expect(set.status).toBe(200);
      expect(set.json.ceremony).toMatchObject({
        nominations_on: "2027-01-21",
        results_on: null
      });
      await send("patch", `/admin/ceremonies/${ceremony.id}/dates`, {
        nominations_on: null,
        results_on: "2027-03-14"
      });

      const after = await detailOf(circuitId);
      expect(after.circuit.status).toBe("ACTIVE");
      expect(after.ceremonies[0]).toMatchObject({
        nominations_on: null,
        results_on: "2027-03-14"
      });
      expect(after.readiness.missing_dates).toEqual([
        expect.objectContaining({ ceremony_id: ceremony.id, missing: ["nominations_on"] })
      ]);
    });

    it.each(["DRAFT", "PUBLISHED", "ACTIVE", "LOCKED", "ARCHIVED"])(
      "sets dates on a %s ceremony and shows them on the ceremony admin",
      async (status) => {
        const ceremony = await ceremonyWithStatus(status);
        const res = await send("patch", `/admin/ceremonies/${ceremony.id}/dates`, {
          nominations_on: "2027-01-08",
          results_on: "2027-02-22"
        });
        expect(res.status).toBe(200);
        const get = await send<{
          ceremony: { status: string; nominations_on: string; results_on: string };
        }>("get", `/admin/ceremonies/${ceremony.id}`);
        expect(get.json.ceremony).toMatchObject({
          status,
          nominations_on: "2027-01-08",
          results_on: "2027-02-22"
        });
      }
    );

    it("rejects a malformed date", async () => {
      const ceremony = await ceremonyWithStatus();
      const res = await send<ErrorBody>(
        "patch",
        `/admin/ceremonies/${ceremony.id}/dates`,
        { results_on: "2027-02-30" }
      );
      expect(res.status).toBe(400);
    });

    it("keeps structural edits possible after activation", async () => {
      const circuitId = await createCircuit();
      await send("post", `/admin/circuits/${circuitId}/activate`);
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      await addCategory(circuitId, (await template("FILM")).id);
      const res = await send("post", `/admin/circuits/${circuitId}/events`, {
        name: "Late event"
      });
      expect(res.status).toBe(201);
    });

    it("treats an archived Circuit as read-only", async () => {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      await addCeremony(circuitId, ceremony.id);
      await db.pool.query(
        `UPDATE circuit SET status = 'ARCHIVED', archived_at = now() WHERE id = $1`,
        [circuitId]
      );
      const film = await template("FILM");
      for (const [method, path, body] of [
        ["put", `/admin/circuits/${circuitId}/ceremonies/${ceremony.id}`, {}],
        ["post", `/admin/circuits/${circuitId}/events`, { name: "x" }],
        [
          "post",
          `/admin/circuits/${circuitId}/categories`,
          { category_family_id: film.id }
        ]
      ] as const) {
        const res = await send<ErrorBody>(method, path, body);
        expect(res.status, path).toBe(409);
        expect(res.json.error.code).toBe("CIRCUIT_ARCHIVED");
      }
    });
  });

  describe("audit log", () => {
    type Ctx = {
      circuitId: number;
      ceremonyId: number;
      editionId: number;
      eventId: number;
      otherEventId: number;
      categoryId: number;
      otherCategoryId: number;
      filmTemplateId: number;
    };

    async function arrange(): Promise<Ctx> {
      const circuitId = await createCircuit();
      const ceremony = await ceremonyWithStatus();
      const other = await ceremonyWithStatus();
      const eventId = (await addCeremony(circuitId, ceremony.id)).circuit_event_id;
      const otherEventId = (await addCeremony(circuitId, other.id)).circuit_event_id;
      const film = await template("FILM");
      const category = await addCategory(circuitId, film.id);
      const otherCategory = await addCategory(
        circuitId,
        (await template("PERFORMANCE")).id
      );
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await send("put", `/admin/circuits/${circuitId}/mappings/${edition.id}`, {
        circuit_category_id: category.id
      });
      await db.pool.query(`DELETE FROM admin_audit_log`);
      return {
        circuitId,
        ceremonyId: ceremony.id,
        editionId: edition.id,
        eventId,
        otherEventId,
        categoryId: category.id,
        otherCategoryId: otherCategory.id,
        filmTemplateId: film.id
      };
    }

    const writes: Array<{
      name: string;
      action: string;
      target: (c: Ctx) => [string, number | "new"];
      run: (c: Ctx) => Promise<{ status: number }>;
    }> = [
      {
        name: "POST /admin/circuits",
        action: "create_circuit",
        target: () => ["circuit", "new"],
        run: () => send("post", "/admin/circuits", { code: "2027-28", name: "Next" })
      },
      {
        name: "PUT /admin/circuits/:id/ceremonies/:ceremonyId",
        action: "associate_circuit_ceremony",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("put", `/admin/circuits/${c.circuitId}/ceremonies/${c.ceremonyId}`, {
            circuit_event_id: c.otherEventId
          })
      },
      {
        name: "DELETE /admin/circuits/:id/ceremonies/:ceremonyId",
        action: "remove_circuit_ceremony",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("delete", `/admin/circuits/${c.circuitId}/ceremonies/${c.ceremonyId}`)
      },
      {
        name: "PUT /admin/ceremonies/:id/circuits/:circuitId",
        action: "associate_circuit_ceremony",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("put", `/admin/ceremonies/${c.ceremonyId}/circuits/${c.circuitId}`, {
            circuit_event_id: c.otherEventId
          })
      },
      {
        name: "DELETE /admin/ceremonies/:id/circuits/:circuitId",
        action: "remove_circuit_ceremony",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("delete", `/admin/ceremonies/${c.ceremonyId}/circuits/${c.circuitId}`)
      },
      {
        name: "POST /admin/circuits/:id/events",
        action: "create_circuit_event",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("post", `/admin/circuits/${c.circuitId}/events`, {
            name: "Grouped",
            ceremony_ids: [c.ceremonyId]
          })
      },
      {
        name: "PATCH /admin/circuits/:id/events/:eventId",
        action: "update_circuit_event",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("patch", `/admin/circuits/${c.circuitId}/events/${c.eventId}`, {
            name: "Renamed"
          })
      },
      {
        name: "PUT /admin/circuits/:id/events/order",
        action: "reorder_circuit_events",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("put", `/admin/circuits/${c.circuitId}/events/order`, {
            event_ids: [c.otherEventId, c.eventId]
          })
      },
      {
        name: "DELETE /admin/circuits/:id/events/:eventId",
        action: "delete_circuit_event",
        target: (c) => ["circuit", c.circuitId],
        run: (c) => send("delete", `/admin/circuits/${c.circuitId}/events/${c.eventId}`)
      },
      {
        name: "POST /admin/circuits/:id/categories",
        action: "add_circuit_category",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("post", `/admin/circuits/${c.circuitId}/categories`, {
            category_family_id: c.filmTemplateId
          })
      },
      {
        name: "PATCH /admin/circuits/:id/categories/:categoryId",
        action: "rename_circuit_category",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("patch", `/admin/circuits/${c.circuitId}/categories/${c.categoryId}`, {
            name: "Renamed"
          })
      },
      {
        name: "PUT /admin/circuits/:id/categories/order",
        action: "reorder_circuit_categories",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("put", `/admin/circuits/${c.circuitId}/categories/order`, {
            category_ids: [c.otherCategoryId, c.categoryId]
          })
      },
      {
        name: "DELETE /admin/circuits/:id/categories/:categoryId",
        action: "remove_circuit_category",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("delete", `/admin/circuits/${c.circuitId}/categories/${c.categoryId}`)
      },
      {
        name: "PUT /admin/circuits/:id/mappings/:categoryEditionId",
        action: "set_circuit_mapping",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("put", `/admin/circuits/${c.circuitId}/mappings/${c.editionId}`, {
            circuit_category_id: c.otherCategoryId
          })
      },
      {
        name: "DELETE /admin/circuits/:id/mappings/:categoryEditionId",
        action: "remove_circuit_mapping",
        target: (c) => ["circuit", c.circuitId],
        run: (c) =>
          send("delete", `/admin/circuits/${c.circuitId}/mappings/${c.editionId}`)
      },
      {
        name: "POST /admin/circuits/:id/activate",
        action: "activate_circuit",
        target: (c) => ["circuit", c.circuitId],
        run: (c) => send("post", `/admin/circuits/${c.circuitId}/activate`)
      },
      {
        name: "PATCH /admin/ceremonies/:id/dates",
        action: "update_ceremony_dates",
        target: (c) => ["ceremony", c.ceremonyId],
        run: (c) =>
          send("patch", `/admin/ceremonies/${c.ceremonyId}/dates`, {
            nominations_on: "2027-01-21"
          })
      }
    ];

    it.each(writes)("$name appends $action", async ({ action, target, run }) => {
      const ctx = await arrange();
      const res = await run(ctx);
      expect(res.status).toBeLessThan(300);
      const [targetType, targetId] = target(ctx);
      const rows = await auditActions();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action,
        target_type: targetType,
        actor_user_id: 1
      });
      if (targetId !== "new") expect(rows[0]!.target_id).toBe(targetId);
    });
  });

  describe("public reads", () => {
    it("hides a Circuit in DRAFT", async () => {
      const circuitId = await createCircuit();
      expect((await getPublic(`/circuits/${circuitId}`)).status).toBe(404);
      expect(
        (await getPublic<{ circuits: unknown[] }>("/circuits")).json.circuits
      ).toEqual([]);
    });

    it("serves an active Circuit with its admin-defined events, categories and schedule", async () => {
      const circuitId = await createCircuit();
      const published = await ceremonyWithStatus("PUBLISHED", { name: "Academy Awards" });
      const hidden = await ceremonyWithStatus("DRAFT", { name: "BAFTA Film Awards" });
      await db.pool.query(
        `UPDATE ceremony SET nominations_on = '2027-01-21', results_on = '2027-03-14' WHERE id = $1`,
        [published.id]
      );
      const oscarsEvent = (await addCeremony(circuitId, published.id)).circuit_event_id;
      const baftaEvent = (await addCeremony(circuitId, hidden.id)).circuit_event_id;
      await addCategory(circuitId, (await template("FILM")).id);
      await send("post", `/admin/circuits/${circuitId}/activate`);

      const list = await getPublic<{ circuits: Array<{ id: number }> }>("/circuits");
      expect(list.json.circuits.map((c) => c.id)).toEqual([circuitId]);

      const one = await getPublic<{
        circuit: { status: string };
        events: EventRow[];
        categories: CategoryRow[];
      }>(`/circuits/${circuitId}`);
      expect(one.status).toBe(200);
      expect(one.json.circuit.status).toBe("ACTIVE");
      expect(one.json.events.map((e) => e.name)).toEqual([
        "Academy Awards",
        "BAFTA Film Awards"
      ]);
      expect(one.json.categories).toHaveLength(1);

      const events = await getPublic<{
        events: Array<{ id: number; ceremonies: Array<{ id: number }> }>;
      }>(`/circuits/${circuitId}/events`);
      expect(events.json.events.find((e) => e.id === oscarsEvent)!.ceremonies).toEqual([
        expect.objectContaining({ id: published.id, nominations_on: "2027-01-21" })
      ]);
      expect(events.json.events.find((e) => e.id === baftaEvent)!.ceremonies).toEqual([]);

      const categories = await getPublic<{ categories: unknown[] }>(
        `/circuits/${circuitId}/categories`
      );
      expect(categories.json.categories).toHaveLength(1);

      const schedule = await getPublic<{
        occasions: Array<{ ceremony_id: number; kind: string; date: string | null }>;
      }>(`/circuits/${circuitId}/schedule`);
      expect(schedule.json.occasions).toEqual([
        expect.objectContaining({
          ceremony_id: published.id,
          kind: "NOMINATION",
          date: "2027-01-21"
        }),
        expect.objectContaining({
          ceremony_id: published.id,
          kind: "WIN",
          date: "2027-03-14"
        })
      ]);
    });
  });
});
