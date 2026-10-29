import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertLeague, insertUser } from "../../factories/db.js";
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

type Method = "get" | "post" | "put";

async function call(method: Method, path: string, body?: unknown, auth = true) {
  const req = api[method](path);
  if (auth) req.set("Authorization", `Bearer ${token}`);
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

describe("request validation: drafts, draft plans, ceremonies, content", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3109";
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
    const user = await insertUser(db.pool);
    token = signTestToken({ sub: String(user.id), username: user.username }, secret);
  });

  describe("drafts", () => {
    it("rejects bad draft ids on every draft route", async () => {
      const routes: Array<[Method, string]> = [
        ["post", "/drafts/abc/start"],
        ["post", "/drafts/abc/pause"],
        ["post", "/drafts/abc/resume"],
        ["post", "/drafts/abc/tick"],
        ["post", "/drafts/abc/override-lock"],
        ["post", "/drafts/abc/results"],
        ["get", "/drafts/abc/snapshot"],
        ["get", "/drafts/abc/export"],
        ["get", "/drafts/abc/standings"],
        ["post", "/drafts/abc/picks"],
        ["get", "/drafts/abc/autodraft"],
        ["post", "/drafts/abc/autodraft"],
        ["post", "/drafts/0/start"],
        ["post", "/drafts/-3/start"],
        ["post", "/drafts/1.5/start"]
      ];
      for (const [method, path] of routes) {
        expectValidation(await call(method, path, {}), "Invalid draft id", ["id"]);
      }
    });

    it("rejects invalid create payloads", async () => {
      // The season is validated after the league lookup, so the league must exist.
      const league = await insertLeague(db.pool);
      const missingLeague = "Missing or invalid league_id";
      expectValidation(await call("post", "/drafts", {}), missingLeague, ["league_id"]);
      expectValidation(
        await call("post", "/drafts", { league_id: "x", season_id: 1 }),
        missingLeague,
        ["league_id"]
      );
      expectValidation(
        await call("post", "/drafts", { league_id: -2, season_id: 1 }),
        missingLeague,
        ["league_id"]
      );
      const orderMessage = "Invalid draft_order_type (MVP supports SNAKE only)";
      expectValidation(
        await call("post", "/drafts", {
          league_id: 1,
          season_id: 1,
          draft_order_type: "LINEAR"
        }),
        orderMessage,
        ["draft_order_type"]
      );
      expectValidation(
        await call("post", "/drafts", {
          league_id: 1,
          season_id: 1,
          draft_order_type: 7
        }),
        orderMessage,
        ["draft_order_type"]
      );
      expectValidation(
        await call("post", "/drafts", {
          league_id: 1,
          season_id: 1,
          pick_timer_seconds: -1
        }),
        "Invalid pick_timer_seconds",
        ["pick_timer_seconds"]
      );
      expectValidation(
        await call("post", "/drafts", { league_id: league.id, season_id: "abc" }),
        "Invalid season_id",
        ["season_id"]
      );
      expectValidation(
        await call("post", "/drafts", { league_id: league.id, season_id: 0 }),
        "Invalid season_id",
        ["season_id"]
      );
      expectValidation(
        await call("post", "/drafts", { league_id: league.id }),
        "Missing season_id",
        ["season_id"]
      );
    });

    it("rejects invalid pick payloads", async () => {
      const pick = (body: unknown) => call("post", "/drafts/1/picks", body);
      expectValidation(await pick({ request_id: "r" }), "Missing nomination_id", [
        "nomination_id"
      ]);
      expectValidation(
        await pick({ nomination_id: 0, request_id: "r" }),
        "Missing nomination_id",
        ["nomination_id"]
      );
      expectValidation(
        await pick({ nomination_id: "x", request_id: "r" }),
        "Invalid nomination_id",
        ["nomination_id"]
      );
      expectValidation(
        await pick({ nomination_id: 1.5, request_id: "r" }),
        "Invalid nomination_id",
        ["nomination_id"]
      );
      expectValidation(await pick({ nomination_id: 1 }), "Missing request_id", [
        "request_id"
      ]);
      expectValidation(
        await pick({ nomination_id: 1, request_id: "   " }),
        "Missing request_id",
        ["request_id"]
      );
      expectValidation(
        await pick({ nomination_id: 1, request_id: "x".repeat(129) }),
        "request_id too long",
        ["request_id"]
      );
    });

    it("rejects invalid override-lock payloads", async () => {
      expectValidation(
        await call("post", "/drafts/1/override-lock", {}),
        "Invalid override flag",
        ["allow"]
      );
      expectValidation(
        await call("post", "/drafts/1/override-lock", { allow: "yes" }),
        "Invalid override flag",
        ["allow"]
      );
    });

    it("rejects invalid results payloads", async () => {
      expectValidation(
        await call("post", "/drafts/1/results", {}),
        "Missing results array",
        ["results"]
      );
      expectValidation(
        await call("post", "/drafts/1/results", { results: "nope" }),
        "Missing results array",
        ["results"]
      );
      for (const entry of [
        null,
        { nomination_id: "x", won: true },
        { nomination_id: 1, won: "yes" },
        { nomination_id: 1, won: true, points: "lots" }
      ]) {
        expectValidation(
          await call("post", "/drafts/1/results", { results: [entry] }),
          "Invalid results payload",
          ["results"]
        );
      }
    });

    it("rejects invalid autodraft payloads", async () => {
      const autodraft = (body: unknown) => call("post", "/drafts/1/autodraft", body);
      expectValidation(await autodraft({ strategy: "bogus" }), "Invalid strategy", [
        "strategy"
      ]);
      for (const plan_id of ["abc", -4, 1.5]) {
        expectValidation(
          await autodraft({ strategy: "PLAN", plan_id }),
          "Invalid plan_id",
          ["plan_id"]
        );
      }
    });

    it("accepts the payloads the web client sends", async () => {
      // These pass validation, so they reach the lookup and report a missing draft.
      const unknownDraft = async (path: string, body: unknown) => {
        const res = await call("post", path, body);
        expect(res.status).toBe(404);
        expect(res.json.error.code).toBe("DRAFT_NOT_FOUND");
      };
      await unknownDraft("/drafts/999/picks", { nomination_id: 5, request_id: "abc" });
      await unknownDraft("/drafts/999/picks", { nomination_id: "5", request_id: "abc" });
      await unknownDraft("/drafts/999/autodraft", {
        enabled: false,
        strategy: "RANDOM",
        plan_id: null
      });
      await unknownDraft("/drafts/999/autodraft", {
        enabled: true,
        strategy: "PLAN",
        plan_id: 3
      });
      await unknownDraft("/drafts/999/autodraft", {});
      await unknownDraft("/drafts/999/override-lock", { allow: true });
      await unknownDraft("/drafts/999/results", {
        results: [{ nomination_id: 1, won: true }]
      });
    });
  });

  describe("draft plans", () => {
    it("rejects bad ceremony and plan ids", async () => {
      expectValidation(
        await call("get", "/draft-plans/ceremonies/abc"),
        "Invalid ceremony id",
        ["ceremonyId"]
      );
      expectValidation(
        await call("post", "/draft-plans/ceremonies/0", { name: "x" }),
        "Invalid ceremony id",
        ["ceremonyId"]
      );
      expectValidation(await call("get", "/draft-plans/abc"), "Invalid plan id", [
        "planId"
      ]);
      expectValidation(
        await call("put", "/draft-plans/-1/items", { nomination_ids: [] }),
        "Invalid plan id",
        ["planId"]
      );
    });

    it("rejects invalid plan names", async () => {
      expectValidation(
        await call("post", "/draft-plans/ceremonies/1", {}),
        "Plan name is required",
        ["name"]
      );
      expectValidation(
        await call("post", "/draft-plans/ceremonies/1", { name: "   " }),
        "Plan name is required",
        ["name"]
      );
      expectValidation(
        await call("post", "/draft-plans/ceremonies/1", { name: "n".repeat(81) }),
        "Plan name is too long",
        ["name"]
      );
    });

    it("rejects invalid item orderings", async () => {
      const items = (body: unknown) => call("put", "/draft-plans/1/items", body);
      expectValidation(await items({}), "nomination_ids must be an array", [
        "nomination_ids"
      ]);
      expectValidation(
        await items({ nomination_ids: "1,2" }),
        "nomination_ids must be an array",
        ["nomination_ids"]
      );
      expectValidation(
        await items({ nomination_ids: [1, "x"] }),
        "Invalid nomination_ids",
        ["nomination_ids"]
      );
      expectValidation(
        await items({ nomination_ids: [1, 0] }),
        "Invalid nomination_ids",
        ["nomination_ids"]
      );
      expectValidation(
        await items({ nomination_ids: [1, 2, 1] }),
        "Duplicate nomination_ids",
        ["nomination_ids"]
      );
    });

    it("accepts the web client's numeric id arrays", async () => {
      for (const nomination_ids of [[3, 1, 2], []]) {
        const res = await call("put", "/draft-plans/999/items", { nomination_ids });
        expect(res.status).toBe(404);
        expect(res.json.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("ceremonies and content", () => {
    it("rejects bad ceremony ids", async () => {
      expectValidation(await call("get", "/ceremonies/abc"), "Invalid ceremony id", [
        "id"
      ]);
      expectValidation(await call("get", "/ceremonies/0"), "Invalid ceremony id", ["id"]);
    });

    it("rejects the reserved banner key on dynamic content", async () => {
      expectValidation(
        await call("get", "/content/dynamic/banner", undefined, false),
        "Use /content/banners for banner content",
        ["key"]
      );
    });

    it("rejects blank content keys", async () => {
      expectValidation(
        await call("get", "/content/static/%20", undefined, false),
        "Key is required",
        ["key"]
      );
      expectValidation(
        await call("get", "/content/dynamic/%20", undefined, false),
        "Key is required",
        ["key"]
      );
    });
  });
});
