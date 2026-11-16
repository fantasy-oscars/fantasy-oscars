import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertCategoryEdition, insertCeremony, insertUser } from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let token: string;

const AUTH_SECRET = "test-secret";

type SeriesDetail = {
  series: { id: number; code: string; status: string; activated_at: string | null };
  events: Array<{ id: number; code: string; name: string; sort_index: number }>;
  categories: Array<{ id: number; code: string; kind: string; sort_index: number }>;
  ceremonies: Array<{
    ceremony_id: number;
    series_event_id: number;
    event_code: string;
    nominations_on: string | null;
    results_on: string | null;
  }>;
  category_editions: Array<{ id: number; series_category_id: number | null }>;
  readiness: { missing_dates: Array<{ ceremony_id: number; missing: string[] }> };
  occasions: Array<{ ceremony_id: number; kind: string; date: string | null }>;
};

type CeremonySeries = {
  associations: Array<{ series_id: number; series_event_id: number; event_code: string }>;
  series: Array<{ id: number; events: Array<{ id: number; code: string }> }>;
};

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

async function createSeries(code = "2026-27") {
  const res = await send<SeriesDetail>("post", "/admin/series", {
    code,
    name: `Series ${code}`
  });
  expect(res.status).toBe(201);
  return res.json;
}

function eventId(detail: SeriesDetail, code: string) {
  return detail.events.find((e) => e.code === code)!.id;
}

function categoryId(detail: SeriesDetail, code: string) {
  return detail.categories.find((c) => c.code === code)!.id;
}

async function ceremonyWithStatus(status = "PUBLISHED") {
  const ceremony = await insertCeremony(db.pool, {}, false);
  await db.pool.query(`UPDATE ceremony SET status = $2 WHERE id = $1`, [
    ceremony.id,
    status
  ]);
  return ceremony;
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

describe("series admin and public routes", () => {
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
    it("yields exactly five events and eight categories with kind fixed by code", async () => {
      const detail = await createSeries();
      expect(detail.series).toMatchObject({ code: "2026-27", status: "DRAFT" });
      expect(detail.events.map((e) => e.code)).toEqual([
        "CRITICS_CHOICE",
        "GOLDEN_GLOBES",
        "GUILDS",
        "BAFTA",
        "OSCARS"
      ]);
      expect(detail.categories.map((c) => [c.code, c.kind])).toEqual([
        ["PICTURE", "FILM"],
        ["DIRECTOR", "FILM"],
        ["ACTOR", "ACTING"],
        ["ACTRESS", "ACTING"],
        ["SUPPORTING_ACTOR", "ACTING"],
        ["SUPPORTING_ACTRESS", "ACTING"],
        ["SCREENPLAY", "FILM"],
        ["ANIMATED_FEATURE", "FILM"]
      ]);
      const { rows } = await db.pool.query<{ events: number; categories: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM series_event WHERE series_id = $1) AS events,
           (SELECT COUNT(*)::int FROM series_category WHERE series_id = $1) AS categories`,
        [detail.series.id]
      );
      expect(rows[0]).toEqual({ events: 5, categories: 8 });
    });

    it("refuses a duplicate code and leaves no partial rows", async () => {
      await createSeries();
      const res = await send<ErrorBody>("post", "/admin/series", {
        code: "2026-27",
        name: "Again"
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("VALIDATION_ERROR");
      const { rows } = await db.pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM series_event`
      );
      expect(rows[0]!.n).toBe(5);
    });

    it("is admin-only", async () => {
      await insertUser(db.pool, { id: 2 });
      token = signTestToken({ sub: "2", username: "player" }, AUTH_SECRET);
      const res = await send<ErrorBody>("post", "/admin/series", {
        code: "x",
        name: "x"
      });
      expect(res.status).toBe(403);
    });
  });

  describe("association shared by both admin screens", () => {
    it("an association made from the Series side is visible and editable from the ceremony side", async () => {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus();

      const put = await send<{ created: boolean }>(
        "put",
        `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`,
        { series_event_id: eventId(detail, "GUILDS") }
      );
      expect(put.status).toBe(200);
      expect(put.json.created).toBe(true);

      const fromCeremony = await send<CeremonySeries>(
        "get",
        `/admin/ceremonies/${ceremony.id}/series`
      );
      expect(fromCeremony.json.associations).toEqual([
        expect.objectContaining({ series_id: detail.series.id, event_code: "GUILDS" })
      ]);
      expect(fromCeremony.json.series[0]!.events).toHaveLength(5);

      const moved = await send<{ created: boolean }>(
        "put",
        `/admin/ceremonies/${ceremony.id}/series/${detail.series.id}`,
        { series_event_id: eventId(detail, "BAFTA") }
      );
      expect(moved.status).toBe(200);
      expect(moved.json.created).toBe(false);

      const fromSeries = await send<SeriesDetail>(
        "get",
        `/admin/series/${detail.series.id}`
      );
      expect(fromSeries.json.ceremonies).toEqual([
        expect.objectContaining({ ceremony_id: ceremony.id, event_code: "BAFTA" })
      ]);
    });

    it("an association made from the ceremony side can be removed from the Series side", async () => {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus("DRAFT");
      expect(
        (
          await send(
            "put",
            `/admin/ceremonies/${ceremony.id}/series/${detail.series.id}`,
            { series_event_id: eventId(detail, "OSCARS") }
          )
        ).status
      ).toBe(200);
      const fromSeries = await send<SeriesDetail>(
        "get",
        `/admin/series/${detail.series.id}`
      );
      expect(fromSeries.json.ceremonies.map((c) => c.ceremony_id)).toEqual([ceremony.id]);

      const del = await send(
        "delete",
        `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`
      );
      expect(del.status).toBe(200);
      const after = await send<CeremonySeries>(
        "get",
        `/admin/ceremonies/${ceremony.id}/series`
      );
      expect(after.json.associations).toEqual([]);
    });

    it("refuses an event from another Series and an unknown ceremony", async () => {
      const a = await createSeries("series-a");
      const b = await createSeries("series-b");
      const ceremony = await ceremonyWithStatus();
      const wrongEvent = await send<ErrorBody>(
        "put",
        `/admin/series/${a.series.id}/ceremonies/${ceremony.id}`,
        { series_event_id: eventId(b, "OSCARS") }
      );
      expect(wrongEvent.status).toBe(400);
      const missing = await send<ErrorBody>(
        "put",
        `/admin/series/${a.series.id}/ceremonies/999999`,
        { series_event_id: eventId(a, "OSCARS") }
      );
      expect(missing.status).toBe(404);
    });
  });

  describe("mappings", () => {
    it("maps a category edition to one canonical category, remapping in place", async () => {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus();
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      const path = `/admin/series/${detail.series.id}/mappings/${edition.id}`;

      const unassociated = await send<ErrorBody>("put", path, {
        series_category_id: categoryId(detail, "PICTURE")
      });
      expect(unassociated.status).toBe(409);
      expect(unassociated.json.error.code).toBe("SERIES_CEREMONY_NOT_ASSOCIATED");

      await send("put", `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`, {
        series_event_id: eventId(detail, "GOLDEN_GLOBES")
      });
      expect(
        (await send("put", path, { series_category_id: categoryId(detail, "PICTURE") }))
          .status
      ).toBe(200);
      expect(
        (await send("put", path, { series_category_id: categoryId(detail, "DIRECTOR") }))
          .status
      ).toBe(200);

      const after = await send<SeriesDetail>("get", `/admin/series/${detail.series.id}`);
      expect(after.json.category_editions).toEqual([
        expect.objectContaining({
          id: edition.id,
          series_category_id: categoryId(detail, "DIRECTOR")
        })
      ]);

      expect((await send("delete", path)).status).toBe(204);
      expect((await send("delete", path)).status).toBe(404);
    });

    it("removing an association drops that ceremony's mappings", async () => {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus();
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await send("put", `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`, {
        series_event_id: eventId(detail, "OSCARS")
      });
      await send("put", `/admin/series/${detail.series.id}/mappings/${edition.id}`, {
        series_category_id: categoryId(detail, "PICTURE")
      });
      const del = await send<{ mappings_removed: number }>(
        "delete",
        `/admin/ceremonies/${ceremony.id}/series/${detail.series.id}`
      );
      expect(del.json.mappings_removed).toBe(1);
      const { rows } = await db.pool.query(`SELECT 1 FROM series_mapping`);
      expect(rows).toEqual([]);
    });
  });

  describe("activation and dates", () => {
    it("activates with missing dates and returns the ceremonies that lack them", async () => {
      const detail = await createSeries();
      const dated = await ceremonyWithStatus();
      const undated = await ceremonyWithStatus();
      await db.pool.query(
        `UPDATE ceremony SET nominations_on = '2026-12-05', results_on = '2027-01-04' WHERE id = $1`,
        [dated.id]
      );
      for (const [c, code] of [
        [dated, "CRITICS_CHOICE"],
        [undated, "OSCARS"]
      ] as const) {
        await send("put", `/admin/series/${detail.series.id}/ceremonies/${c.id}`, {
          series_event_id: eventId(detail, code)
        });
      }

      const res = await send<{
        series: { status: string; activated_at: string | null };
        readiness: SeriesDetail["readiness"];
      }>("post", `/admin/series/${detail.series.id}/activate`);
      expect(res.status).toBe(200);
      expect(res.json.series.status).toBe("ACTIVE");
      expect(res.json.series.activated_at).not.toBeNull();
      expect(res.json.readiness.missing_dates).toEqual([
        expect.objectContaining({
          ceremony_id: undated.id,
          missing: ["nominations_on", "results_on"]
        })
      ]);

      const again = await send<ErrorBody>(
        "post",
        `/admin/series/${detail.series.id}/activate`
      );
      expect(again.status).toBe(409);
      expect(again.json.error.code).toBe("SERIES_NOT_DRAFT");
    });

    it("editing a date after activation leaves the Series ACTIVE", async () => {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus();
      await send("put", `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`, {
        series_event_id: eventId(detail, "OSCARS")
      });
      await send("post", `/admin/series/${detail.series.id}/activate`);

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

      const after = await send<SeriesDetail>("get", `/admin/series/${detail.series.id}`);
      expect(after.json.series.status).toBe("ACTIVE");
      expect(after.json.ceremonies[0]).toMatchObject({
        nominations_on: null,
        results_on: "2027-03-14"
      });
      expect(after.json.readiness.missing_dates).toEqual([
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
        {
          results_on: "2027-02-30"
        }
      );
      expect(res.status).toBe(400);
    });

    it("keeps structural edits possible after activation", async () => {
      const detail = await createSeries();
      await send("post", `/admin/series/${detail.series.id}/activate`);
      const ceremony = await ceremonyWithStatus();
      const res = await send(
        "put",
        `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`,
        { series_event_id: eventId(detail, "BAFTA") }
      );
      expect(res.status).toBe(200);
    });

    it("treats an archived Series as read-only", async () => {
      const detail = await createSeries();
      await db.pool.query(
        `UPDATE series SET status = 'ARCHIVED', archived_at = now() WHERE id = $1`,
        [detail.series.id]
      );
      const ceremony = await ceremonyWithStatus();
      const res = await send<ErrorBody>(
        "put",
        `/admin/series/${detail.series.id}/ceremonies/${ceremony.id}`,
        { series_event_id: eventId(detail, "BAFTA") }
      );
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("SERIES_ARCHIVED");
    });
  });

  describe("audit log", () => {
    type Ctx = {
      seriesId: number;
      ceremonyId: number;
      editionId: number;
      event: (code: string) => number;
      category: (code: string) => number;
    };

    async function arrange(): Promise<Ctx> {
      const detail = await createSeries();
      const ceremony = await ceremonyWithStatus();
      const edition = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await db.pool.query(
        `INSERT INTO series_ceremony (series_id, ceremony_id, series_event_id)
         VALUES ($1, $2, $3)`,
        [detail.series.id, ceremony.id, eventId(detail, "OSCARS")]
      );
      await db.pool.query(
        `INSERT INTO series_mapping (series_id, category_edition_id, series_category_id)
         VALUES ($1, $2, $3)`,
        [detail.series.id, edition.id, categoryId(detail, "PICTURE")]
      );
      await db.pool.query(`DELETE FROM admin_audit_log`);
      return {
        seriesId: detail.series.id,
        ceremonyId: ceremony.id,
        editionId: edition.id,
        event: (code) => eventId(detail, code),
        category: (code) => categoryId(detail, code)
      };
    }

    const writes: Array<{
      name: string;
      action: string;
      target: (c: Ctx) => [string, number | "new"];
      run: (c: Ctx) => Promise<{ status: number }>;
    }> = [
      {
        name: "POST /admin/series",
        action: "create_series",
        target: () => ["series", "new"],
        run: () => send("post", "/admin/series", { code: "2027-28", name: "Next" })
      },
      {
        name: "PUT /admin/series/:id/ceremonies/:ceremonyId",
        action: "associate_series_ceremony",
        target: (c) => ["series", c.seriesId],
        run: (c) =>
          send("put", `/admin/series/${c.seriesId}/ceremonies/${c.ceremonyId}`, {
            series_event_id: c.event("BAFTA")
          })
      },
      {
        name: "DELETE /admin/series/:id/ceremonies/:ceremonyId",
        action: "remove_series_ceremony",
        target: (c) => ["series", c.seriesId],
        run: (c) =>
          send("delete", `/admin/series/${c.seriesId}/ceremonies/${c.ceremonyId}`)
      },
      {
        name: "PUT /admin/ceremonies/:id/series/:seriesId",
        action: "associate_series_ceremony",
        target: (c) => ["series", c.seriesId],
        run: (c) =>
          send("put", `/admin/ceremonies/${c.ceremonyId}/series/${c.seriesId}`, {
            series_event_id: c.event("GUILDS")
          })
      },
      {
        name: "DELETE /admin/ceremonies/:id/series/:seriesId",
        action: "remove_series_ceremony",
        target: (c) => ["series", c.seriesId],
        run: (c) =>
          send("delete", `/admin/ceremonies/${c.ceremonyId}/series/${c.seriesId}`)
      },
      {
        name: "PUT /admin/series/:id/mappings/:categoryEditionId",
        action: "set_series_mapping",
        target: (c) => ["series", c.seriesId],
        run: (c) =>
          send("put", `/admin/series/${c.seriesId}/mappings/${c.editionId}`, {
            series_category_id: c.category("DIRECTOR")
          })
      },
      {
        name: "DELETE /admin/series/:id/mappings/:categoryEditionId",
        action: "remove_series_mapping",
        target: (c) => ["series", c.seriesId],
        run: (c) => send("delete", `/admin/series/${c.seriesId}/mappings/${c.editionId}`)
      },
      {
        name: "POST /admin/series/:id/activate",
        action: "activate_series",
        target: (c) => ["series", c.seriesId],
        run: (c) => send("post", `/admin/series/${c.seriesId}/activate`)
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
    it("hides a Series in DRAFT", async () => {
      const detail = await createSeries();
      expect((await getPublic(`/series/${detail.series.id}`)).status).toBe(404);
      expect((await getPublic<{ series: unknown[] }>("/series")).json.series).toEqual([]);
    });

    it("serves an active Series, its events, categories and schedule", async () => {
      const detail = await createSeries();
      const published = await ceremonyWithStatus("PUBLISHED");
      const hidden = await ceremonyWithStatus("DRAFT");
      await db.pool.query(
        `UPDATE ceremony SET nominations_on = '2027-01-21', results_on = '2027-03-14' WHERE id = $1`,
        [published.id]
      );
      for (const [c, code] of [
        [published, "OSCARS"],
        [hidden, "BAFTA"]
      ] as const) {
        await send("put", `/admin/series/${detail.series.id}/ceremonies/${c.id}`, {
          series_event_id: eventId(detail, code)
        });
      }
      await send("post", `/admin/series/${detail.series.id}/activate`);
      const id = detail.series.id;

      const list = await getPublic<{ series: Array<{ id: number }> }>("/series");
      expect(list.json.series.map((s) => s.id)).toEqual([id]);

      const one = await getPublic<{
        series: { status: string };
        events: unknown[];
        categories: unknown[];
      }>(`/series/${id}`);
      expect(one.status).toBe(200);
      expect(one.json.series.status).toBe("ACTIVE");
      expect(one.json.events).toHaveLength(5);
      expect(one.json.categories).toHaveLength(8);

      const events = await getPublic<{
        events: Array<{ code: string; ceremonies: Array<{ id: number }> }>;
      }>(`/series/${id}/events`);
      expect(events.json.events.find((e) => e.code === "OSCARS")!.ceremonies).toEqual([
        expect.objectContaining({ id: published.id, nominations_on: "2027-01-21" })
      ]);
      expect(events.json.events.find((e) => e.code === "BAFTA")!.ceremonies).toEqual([]);

      const categories = await getPublic<{ categories: unknown[] }>(
        `/series/${id}/categories`
      );
      expect(categories.json.categories).toHaveLength(8);

      const schedule = await getPublic<{
        occasions: Array<{ ceremony_id: number; kind: string; date: string | null }>;
      }>(`/series/${id}/schedule`);
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
