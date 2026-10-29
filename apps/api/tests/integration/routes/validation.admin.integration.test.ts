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
        ["get", "/admin/ceremonies/abc", "Invalid ceremony id", "id"],
        ["patch", "/admin/ceremonies/0", "Invalid ceremony id", "id"],
        ["delete", "/admin/ceremonies/-1", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/1.5/delete-preview", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/abc/draft-board", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/abc/lock", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/lock", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/publish", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/archive", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/name", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/abc/categories", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/categories", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/categories/clone", "Invalid ceremony id", "id"],
        ["put", "/admin/ceremonies/abc/categories/reorder", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/abc/nominations", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/nominations", "Invalid ceremony id", "id"],
        ["put", "/admin/ceremonies/abc/nominations/reorder", "Invalid ceremony id", "id"],
        ["get", "/admin/ceremonies/abc/winners", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/finalize-winners", "Invalid ceremony id", "id"],
        ["post", "/admin/ceremonies/abc/nominees/upload", "Invalid ceremony id", "id"],
        ["patch", "/admin/category-editions/abc", "Invalid category edition id", "id"],
        ["delete", "/admin/category-editions/abc", "Invalid category edition id", "id"],
        ["patch", "/admin/category-families/abc", "Invalid category id", "id"],
        ["delete", "/admin/category-families/abc", "Invalid category template id", "id"],
        ["delete", "/admin/nominations/abc", "Invalid nomination id", "id"],
        ["post", "/admin/nominations/abc/change", "Invalid nomination id", "id"],
        ["post", "/admin/nominations/abc/contributors", "Invalid nomination id", "id"],
        [
          "patch",
          "/admin/nominations/1/contributors/abc",
          "Invalid contributor id",
          "contributorId"
        ],
        [
          "delete",
          "/admin/nominations/abc/contributors/1",
          "Invalid nomination id",
          "id"
        ],
        ["patch", "/admin/people/abc", "Invalid person id", "id"],
        ["get", "/admin/users/abc", "Invalid user id", "id"],
        ["patch", "/admin/users/abc", "Invalid user id", "id"],
        ["get", "/admin/users/abc/delete-preview", "Invalid user id", "id"],
        ["delete", "/admin/users/abc", "Invalid user id", "id"],
        ["get", "/admin/seasons/abc/delete-preview", "Invalid season id", "id"],
        ["delete", "/admin/seasons/abc", "Invalid season id", "id"],
        ["get", "/admin/leagues/abc/delete-preview", "Invalid league id", "id"],
        ["delete", "/admin/leagues/abc", "Invalid league id", "id"],
        ["get", "/admin/films/abc/credits", "Invalid film id", "id"],
        ["get", "/admin/films/abc/consolidated", "Invalid film id", "id"],
        ["patch", "/admin/films/abc", "Invalid film id", "id"],
        ["post", "/admin/films/abc/merge", "Invalid canonical film id", "canonicalId"],
        [
          "post",
          "/admin/films/abc/consolidated/1/decouple",
          "Invalid canonical film id",
          "canonicalId"
        ],
        ["post", "/admin/films/1/consolidated/0/decouple", "Invalid film id", "filmId"],
        [
          "get",
          "/admin/films/by-tmdb/abc",
          "tmdbId must be a positive integer",
          "tmdbId"
        ],
        [
          "patch",
          "/admin/content/dynamic/home_main/drafts/abc",
          "Invalid draft id",
          "id"
        ],
        [
          "post",
          "/admin/content/dynamic/home_main/drafts/abc/publish",
          "Invalid draft id",
          "id"
        ],
        [
          "delete",
          "/admin/content/dynamic/home_main/entries/abc",
          "Invalid entry id",
          "id"
        ],
        [
          "post",
          "/admin/content/dynamic/home_main/entries/abc/unpublish",
          "Invalid entry id",
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
        "Invalid year",
        ["year"]
      );
      expectValidation(
        await create({ code: "ok", name: "x", year: "soon" }),
        "Invalid year",
        ["year"]
      );
      expectValidation(
        await create({ code: "ok", name: "x", starts_at: "not a date" }),
        "Invalid starts_at timestamp",
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
        "Invalid starts_at timestamp",
        ["starts_at"]
      );
      expectValidation(
        await update({ draft_warning_hours: 400 }),
        "Invalid draft_warning_hours",
        ["draft_warning_hours"]
      );
      expectValidation(
        await update({ draft_warning_hours: 1.5 }),
        "Invalid draft_warning_hours",
        ["draft_warning_hours"]
      );
      expectValidation(
        await update({ draft_warning_hours: "soon" }),
        "Invalid draft_warning_hours",
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
          "Invalid ceremony id",
          ["ceremony_id"]
        );
      }
    });
  });

  describe("ceremony categories", () => {
    it("rejects invalid add payloads", async () => {
      const add = (body: unknown) => call("post", "/admin/ceremonies/1/categories", body);
      expectValidation(await add({}), "family_id is required", ["family_id"]);
      expectValidation(await add({ family_id: "x" }), "family_id is required", [
        "family_id"
      ]);
      expectValidation(await add({ family_id: 0 }), "family_id is required", [
        "family_id"
      ]);
      expectValidation(
        await add({ family_id: 1, unit_kind: "MOVIE" }),
        "Invalid unit_kind",
        ["unit_kind"]
      );
      expectValidation(
        await add({ family_id: 1, icon: "Bad Icon" }),
        "Icon must be lowercase letters/numbers/dashes only",
        ["icon"]
      );
      expectValidation(await add({ family_id: 1, icon_id: "x" }), "Invalid icon_id", [
        "icon_id"
      ]);
      expectValidation(
        await add({ family_id: 1, sort_index: -1 }),
        "Invalid sort_index",
        ["sort_index"]
      );
      expectValidation(
        await add({ family_id: 1, sort_index: 1.5 }),
        "Invalid sort_index",
        ["sort_index"]
      );
    });

    it("rejects invalid clone and reorder payloads", async () => {
      const clone = (id: number, body: unknown) =>
        call("post", `/admin/ceremonies/${id}/categories/clone`, body);
      expectValidation(await clone(1, {}), "Invalid from_ceremony_id", [
        "from_ceremony_id"
      ]);
      expectValidation(
        await clone(1, { from_ceremony_id: "x" }),
        "Invalid from_ceremony_id",
        ["from_ceremony_id"]
      );
      expectValidation(
        await clone(2, { from_ceremony_id: 2 }),
        "Cannot clone from the same ceremony",
        ["from_ceremony_id"]
      );

      const reorder = (body: unknown) =>
        call("put", "/admin/ceremonies/1/categories/reorder", body);
      const message = "category_ids must include at least one category id";
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
      expectValidation(await update({ unit_kind: "MOVIE" }), "Invalid unit_kind", [
        "unit_kind"
      ]);
      expectValidation(await update({ icon: "  " }), "Icon is required", ["icon"]);
      expectValidation(
        await update({ icon: "Bad Icon" }),
        "Icon must be lowercase letters/numbers/dashes only",
        ["icon"]
      );
      expectValidation(await update({ icon_id: "x" }), "Invalid icon_id", ["icon_id"]);
      expectValidation(await update({ icon_id: 0 }), "Invalid icon_id", ["icon_id"]);
      expectValidation(await update({ sort_index: -1 }), "Invalid sort_index", [
        "sort_index"
      ]);
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
        "Invalid default_unit_kind",
        ["default_unit_kind"]
      );
      expectValidation(
        await create({ ...base, default_unit_kind: undefined }),
        "Invalid default_unit_kind",
        ["default_unit_kind"]
      );
      expectValidation(
        await create({ ...base, icon_variant: "sepia" }),
        "Invalid icon_variant",
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
        "Invalid icon_id",
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
        "Invalid default_unit_kind",
        ["default_unit_kind"]
      );
      expectValidation(
        await update({ default_unit_kind: null }),
        "Invalid default_unit_kind",
        ["default_unit_kind"]
      );
      expectValidation(await update({ icon_variant: "sepia" }), "Invalid icon_variant", [
        "icon_variant"
      ]);
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
      expectValidation(await create({}), "category_edition_id is required", [
        "category_edition_id"
      ]);
      expectValidation(
        await create({ category_edition_id: "x" }),
        "category_edition_id is required",
        ["category_edition_id"]
      );
      expectValidation(
        await create({ category_edition_id: 0 }),
        "category_edition_id is required",
        ["category_edition_id"]
      );
    });

    it("rejects invalid reorder payloads", async () => {
      const reorder = (body: unknown) =>
        call("put", "/admin/ceremonies/1/nominations/reorder", body);
      expectValidation(await reorder({}), "category_edition_id is required", [
        "category_edition_id",
        "nomination_ids"
      ]);
      const message = "nomination_ids must include at least one nomination id";
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
      expectValidation(await change({ ...ok, action: undefined }), "Invalid action", [
        "action"
      ]);
      expectValidation(await change({ ...ok, action: "revoke" }), "Invalid action", [
        "action"
      ]);
      expectValidation(await change({ ...ok, origin: "OUTER" }), "Invalid origin", [
        "origin"
      ]);
      expectValidation(await change({ ...ok, impact: 3 }), "Invalid impact", ["impact"]);
      expectValidation(
        await change({ ...ok, reason: "no" }),
        "Reason required (min 5 chars)",
        ["reason"]
      );
      expectValidation(
        await change({ ...ok, reason: undefined }),
        "Reason required (min 5 chars)",
        ["reason"]
      );
      expectValidation(
        await change({ ...ok, action: "REPLACE" }),
        "replacement_nomination_id required",
        ["replacement_nomination_id"]
      );
      expectValidation(
        await change({ ...ok, action: "REPLACE", replacement_nomination_id: "x" }),
        "replacement_nomination_id required",
        ["replacement_nomination_id"]
      );
    });

    it("rejects invalid contributor payloads", async () => {
      const add = (body: unknown) =>
        call("post", "/admin/nominations/1/contributors", body);
      expectValidation(await add({}), "person_id or name is required", [
        "person_id",
        "name"
      ]);
      expectValidation(await add({ name: "  " }), "person_id or name is required", [
        "person_id",
        "name"
      ]);
      expectValidation(
        await add({ name: "A", tmdb_id: "abc" }),
        "tmdb_id must be a positive integer",
        ["tmdb_id"]
      );
      expectValidation(
        await add({ name: "A", tmdb_id: -4 }),
        "tmdb_id must be a positive integer",
        ["tmdb_id"]
      );
      expectValidation(
        await call("patch", "/admin/nominations/1/contributors/1", {
          avatar_person_id_override: "x"
        }),
        "avatar_person_id_override must be a positive integer or null",
        ["avatar_person_id_override"]
      );
    });
  });

  describe("winners", () => {
    it("rejects invalid payloads", async () => {
      const upsert = (body: unknown) => call("post", "/admin/winners", body);
      expectValidation(await upsert({}), "Invalid category_edition_id", [
        "category_edition_id"
      ]);
      expectValidation(
        await upsert({ category_edition_id: "x", nomination_ids: [1] }),
        "Invalid category_edition_id",
        ["category_edition_id"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1 }),
        "nomination_ids is required",
        ["nomination_ids"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1, nomination_ids: [] }),
        "nomination_ids is required",
        ["nomination_ids"]
      );
      expectValidation(
        await upsert({ category_edition_id: 1, nomination_ids: ["x", 0] }),
        "nomination_ids is required",
        ["nomination_ids"]
      );
    });
  });

  describe("people and films", () => {
    it("rejects invalid tmdb ids", async () => {
      const message = "tmdb_id must be a positive integer";
      for (const path of ["/admin/people/1", "/admin/films/1"]) {
        for (const tmdb_id of ["abc", 0, -1, 1.5, true]) {
          expectValidation(await call("patch", path, { tmdb_id }), message, ["tmdb_id"]);
        }
      }
    });

    it("rejects invalid merge payloads", async () => {
      const merge = (body: unknown) => call("post", "/admin/films/5/merge", body);
      const empty = "duplicate_ids must be a non-empty array";
      expectValidation(await merge({}), empty, ["duplicate_ids"]);
      expectValidation(await merge({ duplicate_ids: [] }), empty, ["duplicate_ids"]);
      expectValidation(await merge({ duplicate_ids: "5" }), empty, ["duplicate_ids"]);
      expectValidation(
        await merge({ duplicate_ids: ["x", 0] }),
        "No valid duplicate_ids provided",
        ["duplicate_ids"]
      );
      expectValidation(
        await merge({ duplicate_ids: [5, "5"] }),
        "No valid duplicate_ids provided",
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
      const message = "admin_role must be NONE, OPERATOR, or SUPER_ADMIN";
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
