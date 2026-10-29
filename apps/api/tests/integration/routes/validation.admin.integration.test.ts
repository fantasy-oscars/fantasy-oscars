import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertCategoryEdition, insertCeremony, insertUser } from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

type ErrorBody = {
  error: { code: string; message: string; details?: { fields?: string[] } };
};

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let token: string;
const secret = "test-secret";

type Method = "get" | "post" | "put" | "patch" | "delete";

async function call(method: Method, path: string, body?: unknown) {
  const req = api[method](path).set("Authorization", `Bearer ${token}`);
  const res = await (body === undefined
    ? req
    : req.set("content-type", "application/json").send(body as object));
  return { status: res.status, json: res.body as ErrorBody };
}

function expectValidation(
  res: { status: number; json: ErrorBody },
  message: string,
  fields?: string[]
) {
  expect(res.status).toBe(400);
  expect(res.json.error.code).toBe("VALIDATION_ERROR");
  expect(res.json.error.message).toBe(message);
  expect(res.json.error.details?.fields).toEqual(fields);
}

describe("request validation: admin routes", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3110";
    process.env.AUTH_SECRET = secret;
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
    const admin = await insertUser(db.pool);
    await db.pool.query(
      `UPDATE app_user SET is_admin = TRUE, admin_role = 'SUPER_ADMIN' WHERE id = $1`,
      [admin.id]
    );
    token = signTestToken(
      { sub: String(admin.id), username: admin.username, is_admin: true },
      secret
    );
  });

  describe("path ids", () => {
    it("rejects bad ids on every admin route that takes one", async () => {
      const cases: Array<[Method, string, string, string]> = [
        ["get", "/admin/ceremonies/abc", "That link doesn't look right", "id"],
        ["patch", "/admin/ceremonies/0", "That link doesn't look right", "id"],
        ["delete", "/admin/ceremonies/-1", "That link doesn't look right", "id"],
        [
          "get",
          "/admin/ceremonies/1.5/delete-preview",
          "That link doesn't look right",
          "id"
        ],
        [
          "get",
          "/admin/ceremonies/abc/draft-board",
          "That link doesn't look right",
          "id"
        ],
        ["get", "/admin/ceremonies/abc/lock", "That link doesn't look right", "id"],
        ["post", "/admin/ceremonies/abc/lock", "That link doesn't look right", "id"],
        ["post", "/admin/ceremonies/abc/publish", "That link doesn't look right", "id"],
        ["post", "/admin/ceremonies/abc/archive", "That link doesn't look right", "id"],
        ["post", "/admin/ceremonies/abc/name", "That link doesn't look right", "id"],
        ["get", "/admin/ceremonies/abc/categories", "That link doesn't look right", "id"],
        [
          "post",
          "/admin/ceremonies/abc/categories",
          "That link doesn't look right",
          "id"
        ],
        [
          "post",
          "/admin/ceremonies/abc/categories/clone",
          "That link doesn't look right",
          "id"
        ],
        [
          "put",
          "/admin/ceremonies/abc/categories/reorder",
          "That link doesn't look right",
          "id"
        ],
        [
          "get",
          "/admin/ceremonies/abc/nominations",
          "That link doesn't look right",
          "id"
        ],
        [
          "post",
          "/admin/ceremonies/abc/nominations",
          "That link doesn't look right",
          "id"
        ],
        [
          "put",
          "/admin/ceremonies/abc/nominations/reorder",
          "That link doesn't look right",
          "id"
        ],
        ["get", "/admin/ceremonies/abc/winners", "That link doesn't look right", "id"],
        [
          "post",
          "/admin/ceremonies/abc/finalize-winners",
          "That link doesn't look right",
          "id"
        ],
        [
          "post",
          "/admin/ceremonies/abc/nominees/upload",
          "That link doesn't look right",
          "id"
        ],
        ["patch", "/admin/category-editions/abc", "That link doesn't look right", "id"],
        ["delete", "/admin/category-editions/abc", "That link doesn't look right", "id"],
        ["patch", "/admin/category-families/abc", "That link doesn't look right", "id"],
        ["delete", "/admin/category-families/abc", "That link doesn't look right", "id"],
        ["delete", "/admin/nominations/abc", "That link doesn't look right", "id"],
        ["post", "/admin/nominations/abc/change", "That link doesn't look right", "id"],
        [
          "post",
          "/admin/nominations/abc/contributors",
          "That link doesn't look right",
          "id"
        ],
        [
          "patch",
          "/admin/nominations/1/contributors/abc",
          "That link doesn't look right",
          "contributorId"
        ],
        [
          "delete",
          "/admin/nominations/abc/contributors/1",
          "That link doesn't look right",
          "id"
        ],
        ["patch", "/admin/people/abc", "That link doesn't look right", "id"],
        ["get", "/admin/users/abc", "That link doesn't look right", "id"],
        ["patch", "/admin/users/abc", "That link doesn't look right", "id"],
        ["get", "/admin/users/abc/delete-preview", "That link doesn't look right", "id"],
        ["delete", "/admin/users/abc", "That link doesn't look right", "id"],
        [
          "get",
          "/admin/seasons/abc/delete-preview",
          "That link doesn't look right",
          "id"
        ],
        ["delete", "/admin/seasons/abc", "That link doesn't look right", "id"],
        [
          "get",
          "/admin/leagues/abc/delete-preview",
          "That link doesn't look right",
          "id"
        ],
        ["delete", "/admin/leagues/abc", "That link doesn't look right", "id"],
        ["get", "/admin/films/abc/credits", "That link doesn't look right", "id"],
        ["get", "/admin/films/abc/consolidated", "That link doesn't look right", "id"],
        ["patch", "/admin/films/abc", "That link doesn't look right", "id"],
        ["post", "/admin/films/abc/merge", "That link doesn't look right", "canonicalId"],
        [
          "post",
          "/admin/films/abc/consolidated/1/decouple",
          "That link doesn't look right",
          "canonicalId"
        ],
        [
          "post",
          "/admin/films/1/consolidated/0/decouple",
          "That link doesn't look right",
          "filmId"
        ],
        [
          "get",
          "/admin/films/by-tmdb/abc",
          "TMDB ID must be a positive whole number",
          "tmdbId"
        ],
        [
          "patch",
          "/admin/content/dynamic/home_main/drafts/abc",
          "That link doesn't look right",
          "id"
        ],
        [
          "post",
          "/admin/content/dynamic/home_main/drafts/abc/publish",
          "That link doesn't look right",
          "id"
        ],
        [
          "delete",
          "/admin/content/dynamic/home_main/entries/abc",
          "That link doesn't look right",
          "id"
        ],
        [
          "post",
          "/admin/content/dynamic/home_main/entries/abc/unpublish",
          "That link doesn't look right",
          "id"
        ]
      ];
      for (const [method, path, message, field] of cases) {
        expectValidation(await call(method, path, {}), message, [field]);
      }
    });
  });

  describe("ceremonies", () => {
    it("rejects invalid create payloads", async () => {
      const create = (body: unknown) => call("post", "/admin/ceremonies", body);
      expectValidation(await create({}), "Code is required", ["code", "name"]);
      expectValidation(await create({ code: 5, name: "x" }), "Code is required", [
        "code"
      ]);
      expectValidation(
        await create({ code: "Bad Code", name: "x" }),
        "Code must be lowercase letters/numbers/dashes only",
        ["code"]
      );
      expectValidation(await create({ code: "ok" }), "Name is required", ["name"]);
      expectValidation(
        await create({ code: "ok", name: "x", year: 1800 }),
        "Enter a valid year",
        ["year"]
      );
      expectValidation(
        await create({ code: "ok", name: "x", year: "soon" }),
        "Enter a valid year",
        ["year"]
      );
      expectValidation(
        await create({ code: "ok", name: "x", starts_at: "not a date" }),
        "Enter a valid start date and time",
        ["starts_at"]
      );
    });

    it("accepts a numeric-string year and a null year", async () => {
      const a = await call("post", "/admin/ceremonies", {
        code: "year-string",
        name: "A",
        year: "2030"
      });
      expect(a.status).toBe(201);
      const b = await call("post", "/admin/ceremonies", {
        code: "year-null",
        name: "B",
        year: null,
        starts_at: ""
      });
      expect(b.status).toBe(201);
    });

    it("rejects invalid update payloads", async () => {
      const update = (body: unknown) => call("patch", "/admin/ceremonies/1", body);
      expectValidation(await update({}), "No fields to update");
      expectValidation(await update({ name: 7 }), "No fields to update");
      expectValidation(await update({ code: "  " }), "Code is required", ["code"]);
      expectValidation(
        await update({ code: "No Good" }),
        "Code must be lowercase letters/numbers/dashes only",
        ["code"]
      );
      expectValidation(await update({ name: "  " }), "Name is required", ["name"]);
      expectValidation(
        await update({ starts_at: "garbage" }),
        "Enter a valid start date and time",
        ["starts_at"]
      );
      expectValidation(
        await update({ draft_warning_hours: 400 }),
        "Draft warning must be a whole number of hours, up to 336",
        ["draft_warning_hours"]
      );
      expectValidation(
        await update({ draft_warning_hours: 1.5 }),
        "Draft warning must be a whole number of hours, up to 336",
        ["draft_warning_hours"]
      );
      expectValidation(
        await update({ draft_warning_hours: "soon" }),
        "Draft warning must be a whole number of hours, up to 336",
        ["draft_warning_hours"]
      );
    });

    it("rejects invalid name and active-ceremony payloads", async () => {
      expectValidation(
        await call("post", "/admin/ceremonies/1/name", {}),
        "Name is required",
        ["name"]
      );
      expectValidation(
        await call("post", "/admin/ceremonies/1/name", { name: "   " }),
        "Name is required",
        ["name"]
      );
      for (const body of [{}, { ceremony_id: "x" }, { ceremony_id: 0 }]) {
        expectValidation(
          await call("post", "/admin/ceremony/active", body),
          "Choose a ceremony",
          ["ceremony_id"]
        );
      }
    });
  });

  describe("ceremony categories", () => {
    it("rejects invalid add payloads", async () => {
      const add = (body: unknown) => call("post", "/admin/ceremonies/1/categories", body);
      expectValidation(await add({}), "Choose a category family", ["family_id"]);
      expectValidation(await add({ family_id: "x" }), "Choose a category family", [
        "family_id"
      ]);
      expectValidation(await add({ family_id: 0 }), "Choose a category family", [
        "family_id"
      ]);
      expectValidation(
        await add({ family_id: 1, unit_kind: "MOVIE" }),
        "Choose a valid unit type",
        ["unit_kind"]
      );
      expectValidation(
        await add({ family_id: 1, icon: "Bad Icon" }),
        "Icon must be lowercase letters/numbers/dashes only",
        ["icon"]
      );
      expectValidation(await add({ family_id: 1, icon_id: "x" }), "Choose a valid icon", [
        "icon_id"
      ]);
      expectValidation(
        await add({ family_id: 1, sort_index: -1 }),
        "Sort position must be a whole number",
        ["sort_index"]
      );
      expectValidation(
        await add({ family_id: 1, sort_index: 1.5 }),
        "Sort position must be a whole number",
        ["sort_index"]
      );
    });

    it("rejects invalid clone and reorder payloads", async () => {
      const clone = (id: number, body: unknown) =>
        call("post", `/admin/ceremonies/${id}/categories/clone`, body);
      expectValidation(await clone(1, {}), "Choose a ceremony to copy from", [
        "from_ceremony_id"
      ]);
      expectValidation(
        await clone(1, { from_ceremony_id: "x" }),
        "Choose a ceremony to copy from",
        ["from_ceremony_id"]
      );
      expectValidation(
        await clone(2, { from_ceremony_id: 2 }),
        "Cannot clone from the same ceremony",
        ["from_ceremony_id"]
      );

      const reorder = (body: unknown) =>
        call("put", "/admin/ceremonies/1/categories/reorder", body);
      const message = "Select at least one category";
      expectValidation(await reorder({}), message, ["category_ids"]);
      expectValidation(await reorder({ category_ids: [] }), message, ["category_ids"]);
      expectValidation(await reorder({ category_ids: "1" }), message, ["category_ids"]);
      expectValidation(await reorder({ category_ids: ["x", -1, 0] }), message, [
        "category_ids"
      ]);
    });

    it("rejects invalid category edition updates", async () => {
      const category = await insertCategoryEdition(db.pool);
      const update = (body: unknown) =>
        call("patch", `/admin/category-editions/${category.id}`, body);
      expectValidation(await update({}), "No fields to update");
      expectValidation(await update({ unit_kind: "MOVIE" }), "Choose a valid unit type", [
        "unit_kind"
      ]);
      expectValidation(await update({ icon: "  " }), "Icon is required", ["icon"]);
      expectValidation(
        await update({ icon: "Bad Icon" }),
        "Icon must be lowercase letters/numbers/dashes only",
        ["icon"]
      );
      expectValidation(await update({ icon_id: "x" }), "Choose a valid icon", [
        "icon_id"
      ]);
      expectValidation(await update({ icon_id: 0 }), "Choose a valid icon", ["icon_id"]);
      expectValidation(
        await update({ sort_index: -1 }),
        "Sort position must be a whole number",
        ["sort_index"]
      );
    });

    it("accepts lower-case unit kinds and numeric-string sort_index on category edition updates", async () => {
      const category = await insertCategoryEdition(db.pool);
      const res = await api
        .patch(`/admin/category-editions/${category.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ unit_kind: "song", sort_index: "4" });
      expect(res.status).toBe(200);
      expect(res.body.category.unit_kind).toBe("SONG");
      expect(res.body.category.sort_index).toBe(4);
    });
  });

  describe("category families and icons", () => {
    it("rejects invalid family create payloads", async () => {
      const create = (body: unknown) => call("post", "/admin/category-families", body);
      const base = {
        code: "best",
        name: "Best",
        default_unit_kind: "FILM",
        icon: "star"
      };
      expectValidation(await create({}), "Code is required", [
        "code",
        "name",
        "default_unit_kind"
      ]);
      expectValidation(
        await create({ ...base, code: "Best Picture" }),
        "Code must be lowercase letters/numbers/dashes only",
        ["code"]
      );
      expectValidation(await create({ ...base, name: " " }), "Name is required", [
        "name"
      ]);
      expectValidation(
        await create({ ...base, default_unit_kind: "MOVIE" }),
        "Choose a valid unit type",
        ["default_unit_kind"]
      );
      expectValidation(
        await create({ ...base, default_unit_kind: undefined }),
        "Choose a valid unit type",
        ["default_unit_kind"]
      );
      expectValidation(
        await create({ ...base, icon_variant: "sepia" }),
        "Choose a valid icon style",
        ["icon_variant"]
      );
      expectValidation(
        await create({ ...base, icon: "bad icon" }),
        "Icon must be lowercase letters/numbers/dashes/underscores only",
        ["icon"]
      );
      expectValidation(
        await create({ ...base, icon: "Star" }),
        "Icon must be lowercase letters/numbers/dashes/underscores only",
        ["icon"]
      );
      expectValidation(
        await create({ ...base, icon: "a:b" }),
        "Icon must be lowercase letters/numbers/dashes/underscores only",
        ["icon"]
      );
      expectValidation(await create({ ...base, icon: undefined }), "Icon is required", [
        "icon"
      ]);
      expectValidation(
        await create({ ...base, icon: undefined, icon_id: "x" }),
        "Choose a valid icon",
        ["icon_id"]
      );
    });

    it("rejects invalid family update payloads", async () => {
      const update = (body: unknown) => call("patch", "/admin/category-families/1", body);
      expectValidation(await update({}), "No fields to update");
      expectValidation(await update({ code: "" }), "Code is required", ["code"]);
      expectValidation(
        await update({ code: "Nope" }),
        "Code must be lowercase letters/numbers/dashes only",
        ["code"]
      );
      expectValidation(await update({ name: "" }), "Name is required", ["name"]);
      expectValidation(
        await update({ default_unit_kind: "MOVIE" }),
        "Choose a valid unit type",
        ["default_unit_kind"]
      );
      expectValidation(
        await update({ default_unit_kind: null }),
        "Choose a valid unit type",
        ["default_unit_kind"]
      );
      expectValidation(
        await update({ icon_variant: "sepia" }),
        "Choose a valid icon style",
        ["icon_variant"]
      );
      expectValidation(await update({ icon: " " }), "Icon is required", ["icon"]);
      expectValidation(
        await update({ icon: "Star" }),
        "Icon must be lowercase letters/numbers/dashes/underscores only",
        ["icon"]
      );
      expectValidation(
        await update({ icon: "bad icon" }),
        "Icon must be lowercase letters/numbers/dashes/underscores only",
        ["icon"]
      );
    });

    it("rejects invalid icon create payloads", async () => {
      expectValidation(await call("post", "/admin/icons", {}), "Code is required", [
        "code"
      ]);
      expectValidation(
        await call("post", "/admin/icons", { code: "Bad Code" }),
        "Icon code must be lowercase letters/numbers/dashes only",
        ["code"]
      );
    });
  });

  describe("nominations", () => {
    it("rejects invalid create payloads", async () => {
      const create = (body: unknown) =>
        call("post", "/admin/ceremonies/1/nominations", body);
      expectValidation(await create({}), "Choose a category", ["category_edition_id"]);
      expectValidation(await create({ category_edition_id: "x" }), "Choose a category", [
        "category_edition_id"
      ]);
      expectValidation(await create({ category_edition_id: 0 }), "Choose a category", [
        "category_edition_id"
      ]);
    });

    it("rejects invalid reorder payloads", async () => {
      const reorder = (body: unknown) =>
        call("put", "/admin/ceremonies/1/nominations/reorder", body);
      expectValidation(await reorder({}), "Choose a category", [
        "category_edition_id",
        "nomination_ids"
      ]);
      const message = "Select at least one nominee";
      expectValidation(await reorder({ category_edition_id: 1 }), message, [
        "nomination_ids"
      ]);
      expectValidation(
        await reorder({ category_edition_id: 1, nomination_ids: ["x"] }),
        message,
        ["nomination_ids"]
      );
    });

    it("rejects invalid change payloads", async () => {
      const change = (body: unknown) => call("post", "/admin/nominations/1/change", body);
      const ok = {
        action: "REVOKE",
        origin: "INTERNAL",
        impact: "BENIGN",
        reason: "duplicate entry"
      };
      expectValidation(
        await change({ ...ok, action: undefined }),
        "Choose a valid action",
        ["action"]
      );
      expectValidation(
        await change({ ...ok, action: "revoke" }),
        "Choose a valid action",
        ["action"]
      );
      expectValidation(
        await change({ ...ok, origin: "OUTER" }),
        "Choose a valid origin",
        ["origin"]
      );
      expectValidation(await change({ ...ok, impact: 3 }), "Choose a valid impact", [
        "impact"
      ]);
      expectValidation(
        await change({ ...ok, reason: "no" }),
        "Enter a reason of at least 5 characters",
        ["reason"]
      );
      expectValidation(
        await change({ ...ok, reason: undefined }),
        "Enter a reason of at least 5 characters",
        ["reason"]
      );
      expectValidation(
        await change({ ...ok, action: "REPLACE" }),
        "Choose a replacement nominee",
        ["replacement_nomination_id"]
      );
      expectValidation(
        await change({ ...ok, action: "REPLACE", replacement_nomination_id: "x" }),
        "Choose a replacement nominee",
        ["replacement_nomination_id"]
      );
    });

    it("rejects invalid contributor payloads", async () => {
      const add = (body: unknown) =>
        call("post", "/admin/nominations/1/contributors", body);
      expectValidation(await add({}), "Choose a person or enter a name", [
        "person_id",
        "name"
      ]);
      expectValidation(await add({ name: "  " }), "Choose a person or enter a name", [
        "person_id",
        "name"
      ]);
      expectValidation(
        await add({ name: "A", tmdb_id: "abc" }),
        "TMDB ID must be a positive whole number",
        ["tmdb_id"]
      );
      expectValidation(
        await add({ name: "A", tmdb_id: -4 }),
        "TMDB ID must be a positive whole number",
        ["tmdb_id"]
      );
      expectValidation(
        await call("patch", "/admin/nominations/1/contributors/1", {
          avatar_person_id_override: "x"
        }),
        "Avatar person must be a valid person",
        ["avatar_person_id_override"]
      );
    });
  });

  describe("winners", () => {
    it("rejects invalid payloads", async () => {
      const upsert = (body: unknown) => call("post", "/admin/winners", body);
      expectValidation(await upsert({}), "Choose a category", ["category_edition_id"]);
      expectValidation(
        await upsert({ category_edition_id: "x", nomination_ids: [1] }),
        "Choose a category",
        ["category_edition_id"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1 }),
        "Select at least one nominee",
        ["nomination_ids"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1, nomination_ids: [] }),
        "Select at least one nominee",
        ["nomination_ids"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1, nomination_ids: ["x", 0] }),
        "Select at least one nominee",
        ["nomination_ids"]
      );
    });
  });

  describe("people and films", () => {
    it("rejects invalid tmdb ids", async () => {
      const message = "TMDB ID must be a positive whole number";
      for (const path of ["/admin/people/1", "/admin/films/1"]) {
        for (const tmdb_id of ["abc", 0, -1, 1.5, true]) {
          expectValidation(await call("patch", path, { tmdb_id }), message, ["tmdb_id"]);
        }
      }
    });

    it("rejects invalid merge payloads", async () => {
      const merge = (body: unknown) => call("post", "/admin/films/5/merge", body);
      const empty = "Select at least one duplicate film";
      expectValidation(await merge({}), empty, ["duplicate_ids"]);
      expectValidation(await merge({ duplicate_ids: [] }), empty, ["duplicate_ids"]);
      expectValidation(await merge({ duplicate_ids: "5" }), empty, ["duplicate_ids"]);
      expectValidation(
        await merge({ duplicate_ids: ["x", 0] }),
        "Select at least one valid duplicate film",
        ["duplicate_ids"]
      );
      expectValidation(
        await merge({ duplicate_ids: [5, "5"] }),
        "Select at least one valid duplicate film",
        ["duplicate_ids"]
      );
    });

    it("rejects invalid import and upload datasets", async () => {
      expectValidation(
        await call("post", "/admin/films/import", {}),
        "Missing JSON body",
        ["body"]
      );
      expectValidation(
        await call("post", "/admin/films/import", { films: "nope" }),
        "Dataset must include films",
        ["films"]
      );
      expectValidation(
        await call("post", "/admin/films/import", { other: 1 }),
        "Dataset must include films",
        ["films"]
      );
      expectValidation(
        await call("post", "/admin/ceremonies/1/nominees/upload", {}),
        "Dataset must include ceremonies",
        ["ceremonies"]
      );
      expectValidation(
        await call("post", "/admin/ceremonies/1/nominees/upload", { ceremonies: [] }),
        "Dataset must include ceremonies",
        ["ceremonies"]
      );
      expectValidation(
        await call("post", "/admin/nominees/upload", {}),
        "Missing JSON body",
        ["body"]
      );
    });

    it("passes shape validation for a dataset and then checks it against the ceremony", async () => {
      const ceremony = await insertCeremony(db.pool);
      const res = await call("post", `/admin/ceremonies/${ceremony.id}/nominees/upload`, {
        ceremonies: [{ id: ceremony.id + 1000 }]
      });
      expectValidation(
        res,
        "Dataset ceremonies must include only the selected ceremony",
        ["ceremonies"]
      );
    });
  });

  describe("users and search", () => {
    it("rejects invalid admin role updates", async () => {
      const message = "Admin role must be none, operator or super admin";
      for (const body of [
        {},
        { admin_role: "ROOT" },
        { admin_role: 3 },
        { admin_role: "" }
      ]) {
        expectValidation(await call("patch", "/admin/users/1", body), message, [
          "admin_role"
        ]);
      }
    });

    it("treats a repeated or missing q as empty", async () => {
      const res = await api
        .get("/admin/users?q=a&q=b")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ users: [] });
    });

    it("falls back to defaults for bad paging values", async () => {
      const res = await api
        .get("/admin/films?page=-3&page_size=abc&year=nope&linked=weird")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.page_size).toBe(50);
    });
  });

  describe("content", () => {
    it("rejects blank content keys", async () => {
      expectValidation(
        await call("get", "/admin/content/static/%20", undefined),
        "Key is required",
        ["key"]
      );
      expectValidation(
        await call("get", "/admin/content/dynamic/%20", undefined),
        "Key is required",
        ["key"]
      );
      expectValidation(
        await call("put", "/admin/content/static/%20", { title: "t" }),
        "Key is required",
        ["key"]
      );
      expectValidation(
        await call("post", "/admin/content/dynamic/%20/unpublish", {}),
        "Key is required",
        ["key"]
      );
    });

    it("stores empty text for non-string static content fields", async () => {
      const res = await api
        .put("/admin/content/static/about")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: 5, body_markdown: null });
      expect(res.status).toBe(200);
      expect(res.body.content.title).toBe("");
      expect(res.body.content.body_markdown).toBe("");
    });
  });
});
