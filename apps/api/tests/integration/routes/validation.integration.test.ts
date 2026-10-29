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
        "Please fill in all required fields",
        ["username", "email", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: 5, email: "a@b.co", password: "password1" },
          false
        ),
        "Please check your entries and try again",
        ["username", "email", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: "a b", email: "nope", password: "password1" },
          false
        ),
        "Some of the details you entered are not valid",
        ["username", "email"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/register",
          { username: "alice", email: "a@b.co", password: "short" },
          false
        ),
        "Some of the details you entered are not valid",
        ["password"]
      );
    });

    it("login: missing, mistyped and malformed credentials", async () => {
      expectValidation(
        await call("post", "/auth/login", { username: "alice" }, false),
        "Please fill in all required fields",
        ["username", "password"]
      );
      expectValidation(
        await call(
          "post",
          "/auth/login",
          { username: ["a"], password: "password1" },
          false
        ),
        "Please check your entries and try again",
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
      expectValidation(
        await call("post", "/leagues", {}),
        "Please fill in all required fields",
        ["name"]
      );
      expectValidation(
        await call("post", "/leagues", { name: "   " }),
        "League name is required",
        ["name"]
      );
    });

    it("rejects non-numeric league ids", async () => {
      expectValidation(
        await call("get", "/leagues/abc"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("get", "/leagues/abc/seasons"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("post", "/leagues/abc/join"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("delete", "/leagues/abc"),
        "That link doesn't look right",
        ["id"]
      );
    });

    it("rejects bad ids on member routes", async () => {
      expectValidation(
        await call("delete", "/leagues/1/members/zzz"),
        "That link doesn't look right",
        ["id", "userId"]
      );
      expectValidation(
        await call("post", "/leagues/1/transfer", { user_id: "nope" }),
        "Please check your entries and try again",
        ["id", "user_id"]
      );
      expectValidation(
        await call("post", "/leagues/1/transfer", {}),
        "Please check your entries and try again",
        ["id", "user_id"]
      );
    });

    it("rejects invalid season settings on create", async () => {
      expectValidation(
        await call("post", "/leagues/1/seasons", { scoring_strategy_name: "bogus" }),
        "Choose a valid scoring strategy",
        ["scoring_strategy_name"]
      );
      expectValidation(
        await call("post", "/leagues/1/seasons", { remainder_strategy: "x" }),
        "Choose a valid remainder strategy",
        ["remainder_strategy"]
      );
      expectValidation(
        await call("post", "/leagues/1/seasons", { pick_timer_seconds: -5 }),
        "Pick timer must be zero or a positive number of seconds",
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
      expectValidation(
        await call("get", "/seasons/abc/members"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("get", "/seasons/abc/invites"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("post", "/seasons/abc/leave"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("post", "/seasons/abc/cancel"),
        "That link doesn't look right",
        ["id"]
      );
      expectValidation(
        await call("post", "/seasons/invites/abc/accept"),
        "That link doesn't look right",
        ["inviteId"]
      );
      expectValidation(
        await call("post", "/seasons/1/invites/abc/revoke"),
        "That link doesn't look right",
        ["id", "inviteId"]
      );
    });

    it("rejects a non-string invite label", async () => {
      expectValidation(
        await call("post", "/seasons/1/invites", { label: 5 }),
        "Label must be text",
        ["label"]
      );
      expectValidation(
        await call("patch", "/seasons/1/invites/2", { label: 5 }),
        "Label must be text",
        ["label"]
      );
    });

    it("rejects invalid season settings", async () => {
      expectValidation(
        await call("post", "/seasons/1/scoring", { scoring_strategy_name: "bogus" }),
        "Choose a valid scoring strategy",
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
        "Choose a valid remainder strategy",
        ["remainder_strategy"]
      );
      expectValidation(
        await call("post", "/seasons/1/timer", { pick_timer_seconds: "abc" }),
        "Pick timer must be zero or a positive number of seconds",
        ["pick_timer_seconds"]
      );
    });

    it("rejects a bad ownership transfer payload", async () => {
      expectValidation(
        await call("post", "/seasons/1/transfer-ownership", {}),
        "Please check your entries and try again",
        ["id", "user_id"]
      );
    });
  });
});
