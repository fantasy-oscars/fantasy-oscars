import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertUser } from "../../factories/db.js";
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

type Method = "get" | "post" | "patch" | "delete";

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

describe("request validation", () => {
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

  describe("auth", () => {
    it("register: missing, mistyped and invalid values", async () => {
      expectValidation(
        await call("post", "/auth/register", { username: "alice" }, false),
        "Missing required fields",
        ["username", "email", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: 5, email: "a@b.co", password: "password1" },
          false
        ),
        "Invalid field types",
        ["username", "email", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: "a b", email: "nope", password: "password1" },
          false
        ),
        "Invalid field values",
        ["username", "email"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: "alice", email: "a@b.co", password: "short" },
          false
        ),
        "Invalid field values",
        ["password"]
      );
    });

    it("login: missing, mistyped and malformed credentials", async () => {
      expectValidation(
        await call("post", "/auth/login", { username: "alice" }, false),
        "Missing required fields",
        ["username", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/login",
          { username: ["a"], password: "password1" },
          false
        ),
        "Invalid field types",
        ["username", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/login",
          { username: "a", password: "password1" },
          false
        ),
        "Invalid credentials",
        ["username", "password"]
      );
    });
  });

  describe("leagues", () => {
    it("rejects blank and missing names", async () => {
      expectValidation(await call("post", "/leagues", {}), "Missing required fields", [
        "name"
      ]);
      expectValidation(await call("post", "/leagues", { name: "   " }), "Invalid name", [
        "name"
      ]);
    });

    it("rejects non-numeric league ids", async () => {
      expectValidation(await call("get", "/leagues/abc"), "Invalid league id", ["id"]);
      expectValidation(await call("get", "/leagues/abc/seasons"), "Invalid league id", [
        "id"
      ]);
      expectValidation(await call("post", "/leagues/abc/join"), "Invalid league id", [
        "id"
      ]);
      expectValidation(await call("delete", "/leagues/abc"), "Invalid ids", ["id"]);
    });

    it("rejects bad ids on member routes", async () => {
      expectValidation(await call("delete", "/leagues/1/members/zzz"), "Invalid ids", [
        "id",
        "userId"
      ]);
      expectValidation(
        await call("post", "/leagues/1/transfer", { user_id: "nope" }),
        "Invalid payload",
        ["id", "user_id"]
      );
      expectValidation(await call("post", "/leagues/1/transfer", {}), "Invalid payload", [
        "id",
        "user_id"
      ]);
    });

    it("rejects invalid season settings on create", async () => {
      expectValidation(
        await call("post", "/leagues/1/seasons", { scoring_strategy_name: "bogus" }),
        "Invalid scoring_strategy_name",
        ["scoring_strategy_name"]
      );
      expectValidation(
        await call("post", "/leagues/1/seasons", { remainder_strategy: "x" }),
        "Invalid remainder_strategy",
        ["remainder_strategy"]
      );
      expectValidation(
        await call("post", "/leagues/1/seasons", { pick_timer_seconds: -5 }),
        "Invalid pick_timer_seconds",
        ["pick_timer_seconds"]
      );
    });

    it("still reports a missing ceremony as a conflict", async () => {
      const res = await call("post", "/leagues/1/seasons", {});
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("CEREMONY_REQUIRED");
    });
  });

  describe("seasons", () => {
    it("rejects non-numeric season ids", async () => {
      expectValidation(await call("get", "/seasons/abc/members"), "Invalid season id", [
        "id"
      ]);
      expectValidation(await call("get", "/seasons/abc/invites"), "Invalid season id", [
        "id"
      ]);
      expectValidation(await call("post", "/seasons/abc/leave"), "Invalid season id", [
        "id"
      ]);
      expectValidation(await call("post", "/seasons/abc/cancel"), "Invalid season id", [
        "id"
      ]);
      expectValidation(
        await call("post", "/seasons/invites/abc/accept"),
        "Invalid invite id",
        ["inviteId"]
      );
      expectValidation(
        await call("post", "/seasons/1/invites/abc/revoke"),
        "Invalid ids",
        ["id", "inviteId"]
      );
    });

    it("rejects a non-string invite label", async () => {
      expectValidation(
        await call("post", "/seasons/1/invites", { label: 5 }),
        "Invalid label",
        ["label"]
      );
      expectValidation(
        await call("patch", "/seasons/1/invites/2", { label: 5 }),
        "Invalid label",
        ["label"]
      );
    });

    it("rejects invalid season settings", async () => {
      expectValidation(
        await call("post", "/seasons/1/scoring", { scoring_strategy_name: "bogus" }),
        "Invalid scoring_strategy_name",
        ["scoring_strategy_name"]
      );
      expectValidation(
        await call("post", "/seasons/1/scoring", {
          scoring_strategy_name: "category_weighted",
          category_weights: { "1": 500 }
        }),
        "Category weight must be an integer between -99 and 99",
        ["category_weights"]
      );
      expectValidation(
        await call("post", "/seasons/1/allocation", { remainder_strategy: "nope" }),
        "Invalid remainder_strategy",
        ["remainder_strategy"]
      );
      expectValidation(
        await call("post", "/seasons/1/timer", { pick_timer_seconds: "abc" }),
        "Invalid pick_timer_seconds",
        ["pick_timer_seconds"]
      );
    });

    it("rejects a bad ownership transfer payload", async () => {
      expectValidation(
        await call("post", "/seasons/1/transfer-ownership", {}),
        "Invalid ids",
        ["id", "user_id"]
      );
    });
  });
});
