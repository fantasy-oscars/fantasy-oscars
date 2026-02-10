import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import { resetAllRateLimiters } from "../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function post<T>(
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  json: T;
  headers: Record<string, string | string[] | undefined>;
}> {
  const res = await api
    .post(path)
    .set({ "content-type": "application/json", ...headers })
    .send(body ?? {});
  return { status: res.status, json: res.body as T, headers: res.headers };
}

async function getJson<T>(
  path: string,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  json: T;
  headers: Record<string, string | string[] | undefined>;
}> {
  const res = await api.get(path).set(headers);
  return { status: res.status, json: res.body as T, headers: res.headers };
}

describe("auth integration", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3101";
    process.env.AUTH_SECRET = "test-secret";
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    const app = createServer({ db: db.pool });
    api = createApiAgent(app);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
  });

  it("registers a user and stores hashed password", async () => {
    const payload = {
      username: "user1",
      email: "user1@example.com",
      password: "secret123"
    };

    const res = await post<{ user: { username: string } }>("/auth/register", payload);
    expect(res.status).toBe(201);
    expect(res.json.user.username).toBe("user1");

    const { rows } = await db.pool.query(
      `SELECT password_hash, password_algo
       FROM auth_password ap
       JOIN app_user u ON u.id = ap.user_id
       WHERE u.username = $1`,
      ["user1"]
    );
    expect(rows[0].password_algo).toBe("scrypt");
    expect(rows[0].password_hash).toMatch(/^scrypt\$.+/);
  });

  it("rejects duplicate registrations", async () => {
    const payload = {
      username: "dupe",
      email: "dupe@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/register", payload);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("USER_EXISTS");
  });

  it("rejects case-insensitive duplicates for username and email", async () => {
    await post("/auth/register", {
      username: "Alex",
      email: "user@example.com",
      password: "pw123456"
    });

    const handleDupe = await post<{ error: { code: string } }>("/auth/register", {
      username: "alex",
      email: "user2@example.com",
      password: "pw123456"
    });
    expect(handleDupe.status).toBe(409);
    expect(handleDupe.json.error.code).toBe("USER_EXISTS");

    const emailDupe = await post<{ error: { code: string } }>("/auth/register", {
      username: "alex3",
      email: "User@example.com",
      password: "pw123456"
    });
    expect(emailDupe.status).toBe(409);
    expect(emailDupe.json.error.code).toBe("USER_EXISTS");
  });

  it("logs in with valid credentials", async () => {
    const payload = {
      username: "loginuser",
      email: "login@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ user: { username: string }; token: string }>("/auth/login", {
      username: payload.username,
      password: payload.password
    });
    expect(res.status).toBe(200);
    expect(res.json.user.username).toBe(payload.username);
    expect(res.json.token).toBeDefined();

    const me = await getJson<{ user: { sub: string; username: string } }>("/auth/me", {
      Authorization: `Bearer ${res.json.token}`
    });
    expect(me.status).toBe(200);
    expect(me.json.user.username).toBe(payload.username);
  });

  it("logs in with username case-insensitively and returns stored username casing", async () => {
    const payload = {
      username: "CaseUser",
      email: "CaseEmail@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);

    const res = await post<{ user: { username: string; email: string }; token: string }>(
      "/auth/login",
      {
        username: "CASEUSER",
        password: payload.password
      }
    );
    expect(res.status).toBe(200);
    expect(res.json.user.username).toBe("CaseUser");
    expect(res.json.user.email).toBe("caseemail@example.com");
  });

  it("rejects invalid credentials", async () => {
    const payload = {
      username: "badpw",
      email: "badpw@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/login", {
      username: payload.username,
      password: "wrongpass"
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("sets auth cookie on login and accepts cookie for /auth/me", async () => {
    const payload = {
      username: "cookieuser",
      email: "cookie@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ user: { username: string }; token: string }>("/auth/login", {
      username: payload.username,
      password: payload.password
    });
    const setCookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join(",")
      : String(res.headers["set-cookie"] ?? "");
    expect(setCookie).toMatch(/auth_token=/);

    // Agent should include cookie automatically.
    const me = await getJson<{ user: { username: string } }>("/auth/me");
    expect(me.status).toBe(200);
    expect(me.json.user.username).toBe(payload.username);
  });

  it("rate limits login attempts", async () => {
    const payload = {
      username: "ratelimit",
      email: "ratelimit@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);

    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await post<{ error?: { code: string } }>("/auth/login", {
        username: payload.username,
        password: "wrong-pass"
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("clears auth cookie on logout and rejects missing token", async () => {
    const payload = {
      username: "logoutuser",
      email: "logout@example.com",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ token: string }>("/auth/login", {
      username: payload.username,
      password: payload.password
    });
    const setCookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join(",")
      : String(res.headers["set-cookie"] ?? "");
    expect(setCookie).toMatch(/auth_token=/);

    const logout = await post("/auth/logout", undefined);
    expect(logout.status).toBe(204);
    const cleared = Array.isArray(logout.headers["set-cookie"])
      ? logout.headers["set-cookie"].join(",")
      : String(logout.headers["set-cookie"] ?? "");
    expect(cleared).toMatch(/auth_token=;/);

    const me = await getJson<{ error: { code: string } }>("/auth/me");
    expect(me.status).toBe(401);
    expect(me.json.error.code).toBe("UNAUTHORIZED");
  });
});
