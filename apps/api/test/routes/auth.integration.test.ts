import crypto from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";

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
  });

  it("registers a user and stores hashed password", async () => {
    const payload = {
      handle: "user1",
      email: "user1@example.com",
      display_name: "User One",
      password: "secret123"
    };

    const res = await post<{ user: { handle: string } }>("/auth/register", payload);
    expect(res.status).toBe(201);
    expect(res.json.user.handle).toBe("user1");

    const { rows } = await db.pool.query(
      `SELECT password_hash, password_algo
       FROM auth_password ap
       JOIN app_user u ON u.id = ap.user_id
       WHERE u.handle = $1`,
      ["user1"]
    );
    expect(rows[0].password_algo).toBe("scrypt");
    expect(rows[0].password_hash).toMatch(/^scrypt\$.+/);
  });

  it("rejects duplicate registrations", async () => {
    const payload = {
      handle: "dupe",
      email: "dupe@example.com",
      display_name: "Dupe",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/register", payload);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("USER_EXISTS");
  });

  it("rejects case-insensitive duplicates for handle and email", async () => {
    await post("/auth/register", {
      handle: "Alex",
      email: "user@example.com",
      display_name: "Alex",
      password: "pw123456"
    });

    const handleDupe = await post<{ error: { code: string } }>("/auth/register", {
      handle: "alex",
      email: "user2@example.com",
      display_name: "Alex 2",
      password: "pw123456"
    });
    expect(handleDupe.status).toBe(409);
    expect(handleDupe.json.error.code).toBe("USER_EXISTS");

    const emailDupe = await post<{ error: { code: string } }>("/auth/register", {
      handle: "alex3",
      email: "User@example.com",
      display_name: "Alex 3",
      password: "pw123456"
    });
    expect(emailDupe.status).toBe(409);
    expect(emailDupe.json.error.code).toBe("USER_EXISTS");
  });

  it("logs in with valid credentials", async () => {
    const payload = {
      handle: "loginuser",
      email: "login@example.com",
      display_name: "Login User",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ user: { handle: string }; token: string }>("/auth/login", {
      handle: payload.handle,
      password: payload.password
    });
    expect(res.status).toBe(200);
    expect(res.json.user.handle).toBe(payload.handle);
    expect(res.json.token).toBeDefined();

    const me = await getJson<{ user: { sub: string; handle: string } }>("/auth/me", {
      Authorization: `Bearer ${res.json.token}`
    });
    expect(me.status).toBe(200);
    expect(me.json.user.handle).toBe(payload.handle);
  });

  it("logs in with handle case-insensitively and returns normalized handle/email", async () => {
    const payload = {
      handle: "CaseUser",
      email: "CaseEmail@example.com",
      display_name: "Case User",
      password: "pw123456"
    };
    await post("/auth/register", payload);

    const res = await post<{ user: { handle: string; email: string }; token: string }>(
      "/auth/login",
      {
        handle: "CASEUSER",
        password: payload.password
      }
    );
    expect(res.status).toBe(200);
    expect(res.json.user.handle).toBe("caseuser");
    expect(res.json.user.email).toBe("caseemail@example.com");
  });

  it("rejects invalid credentials", async () => {
    const payload = {
      handle: "badpw",
      email: "badpw@example.com",
      display_name: "Bad Pw",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/login", {
      handle: payload.handle,
      password: "wrongpass"
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("sets auth cookie on login and accepts cookie for /auth/me", async () => {
    const payload = {
      handle: "cookieuser",
      email: "cookie@example.com",
      display_name: "Cookie User",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ user: { handle: string }; token: string }>("/auth/login", {
      handle: payload.handle,
      password: payload.password
    });
    const setCookie = Array.isArray(res.headers["set-cookie"])
      ? res.headers["set-cookie"].join(",")
      : String(res.headers["set-cookie"] ?? "");
    expect(setCookie).toMatch(/auth_token=/);

    // Agent should include cookie automatically.
    const me = await getJson<{ user: { handle: string } }>("/auth/me");
    expect(me.status).toBe(200);
    expect(me.json.user.handle).toBe(payload.handle);
  });

  it("clears auth cookie on logout and rejects missing token", async () => {
    const payload = {
      handle: "logoutuser",
      email: "logout@example.com",
      display_name: "Logout User",
      password: "pw123456"
    };
    await post("/auth/register", payload);
    const res = await post<{ token: string }>("/auth/login", {
      handle: payload.handle,
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

  describe("password reset", () => {
    it("returns inline token in non-prod and creates reset record", async () => {
      const payload = {
        handle: "reset1",
        email: "reset1@example.com",
        display_name: "Reset One",
        password: "oldpw123"
      };
      await post("/auth/register", payload);

      const res = await post<{ token: string; delivery: string }>("/auth/reset-request", {
        email: payload.email
      });
      expect(res.status).toBe(200);
      expect(res.json.delivery).toBe("inline");
      expect(res.json.token).toBeDefined();

      const { rows } = await db.pool.query(
        `SELECT token_hash FROM auth_password_reset WHERE user_id = (SELECT id FROM app_user WHERE email = $1)`,
        [payload.email]
      );
      expect(rows.length).toBe(1);
    });

    it("resets password with token and allows login", async () => {
      const payload = {
        handle: "reset2",
        email: "reset2@example.com",
        display_name: "Reset Two",
        password: "oldpw123"
      };
      await post("/auth/register", payload);
      const request = await post<{ token: string }>("/auth/reset-request", {
        email: payload.email
      });
      const token = request.json.token;
      expect(token).toBeDefined();

      const confirm = await post("/auth/reset-confirm", {
        token,
        password: "newpw123"
      });
      expect(confirm.status).toBe(200);

      const login = await post<{ token: string }>("/auth/login", {
        handle: payload.handle,
        password: "newpw123"
      });
      expect(login.status).toBe(200);
      expect(login.json.token).toBeDefined();
    });

    it("rejects expired tokens", async () => {
      const { json } = await post<{ user: { id: number } }>("/auth/register", {
        handle: "expired",
        email: "expired@example.com",
        display_name: "Expired",
        password: "pw123456"
      });
      const rawToken = "expired-token";
      const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.pool.query(
        `INSERT INTO auth_password_reset (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [json.user.id, hash, new Date(Date.now() - 3600_000)]
      );

      const res = await post<{ error: { code: string } }>("/auth/reset-confirm", {
        token: rawToken,
        password: "newpw123"
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("RESET_TOKEN_EXPIRED");
    });

    it("rejects reused tokens", async () => {
      const { json } = await post<{ user: { id: number } }>("/auth/register", {
        handle: "used",
        email: "used@example.com",
        display_name: "Used",
        password: "pw123456"
      });
      const rawToken = "used-token";
      const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.pool.query(
        `INSERT INTO auth_password_reset (user_id, token_hash, expires_at, consumed_at)
         VALUES ($1, $2, now() + interval '1 hour', now())`,
        [json.user.id, hash]
      );

      const res = await post<{ error: { code: string } }>("/auth/reset-confirm", {
        token: rawToken,
        password: "newpw123"
      });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("RESET_TOKEN_USED");
    });
  });
});
