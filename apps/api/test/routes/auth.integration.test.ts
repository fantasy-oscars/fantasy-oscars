import { AddressInfo } from "net";
import type { Server } from "http";
import crypto from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";

let db: Awaited<ReturnType<typeof startTestDatabase>> | null = null;
let server: Server | null = null;
let baseUrl: string | null = null;
let skip = false;

async function requestJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; json: T; headers: Headers }> {
  if (!baseUrl) throw new Error("Test server not started");
  const res = await fetch(`${baseUrl}${path}`, init);
  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    // Allow endpoints like logout (204/no body) to be exercised without JSON.
    json = {} as T;
  }
  return { status: res.status, json, headers: res.headers };
}

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: T; headers: Headers }> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function getJson<T>(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: T; headers: Headers }> {
  return requestJson<T>(path, { method: "GET", headers });
}

describe("auth integration", () => {
  beforeAll(async () => {
    try {
      process.env.PORT = process.env.PORT ?? "3101";
      process.env.AUTH_SECRET = "test-secret";
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      const app = createServer({ db: db.pool });
      server = app.listen(0);
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("container runtime")) {
        skip = true;
        return;
      }
      throw err;
    }
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (db) await db.stop();
  });

  beforeEach(async () => {
    if (skip || !db) return;
    await truncateAllTables(db.pool);
  });

  it("registers a user and stores hashed password", async () => {
    if (skip) return;
    const payload = {
      handle: "user1",
      email: "user1@example.com",
      display_name: "User One",
      password: "secret123"
    };

    const res = await post<{ user: { handle: string } }>("/auth/register", payload);
    expect(res.status).toBe(201);
    expect(res.json.user.handle).toBe("user1");

    if (!db) throw new Error("DB not started");
    const { rows } = await db.pool.query(
      `SELECT password_hash FROM auth_password ap JOIN app_user u ON u.id = ap.user_id WHERE u.handle = $1`,
      ["user1"]
    );
    const expectedHash = crypto
      .createHash("sha256")
      .update(payload.password)
      .digest("hex");
    expect(rows[0].password_hash).toBe(expectedHash);
  });

  it("rejects duplicate registrations", async () => {
    if (skip) return;
    const payload = {
      handle: "dupe",
      email: "dupe@example.com",
      display_name: "Dupe",
      password: "pw"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/register", payload);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("USER_EXISTS");
  });

  it("logs in with valid credentials", async () => {
    if (skip) return;
    const payload = {
      handle: "loginuser",
      email: "login@example.com",
      display_name: "Login User",
      password: "pw123"
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

  it("rejects invalid credentials", async () => {
    if (skip) return;
    const payload = {
      handle: "badpw",
      email: "badpw@example.com",
      display_name: "Bad Pw",
      password: "pw123"
    };
    await post("/auth/register", payload);
    const res = await post<{ error: { code: string } }>("/auth/login", {
      handle: payload.handle,
      password: "wrong"
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("sets auth cookie on login and accepts cookie for /auth/me", async () => {
    if (skip) return;
    const payload = {
      handle: "cookieuser",
      email: "cookie@example.com",
      display_name: "Cookie User",
      password: "pw123"
    };
    await post("/auth/register", payload);
    const res = await post<{ user: { handle: string }; token: string }>("/auth/login", {
      handle: payload.handle,
      password: payload.password
    });
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/auth_token=/);
    const cookieHeader = setCookie?.split(";")[0] ?? "";
    const me = await getJson<{ user: { handle: string } }>("/auth/me", {
      Cookie: cookieHeader
    });
    expect(me.status).toBe(200);
    expect(me.json.user.handle).toBe(payload.handle);
  });

  it("clears auth cookie on logout and rejects missing token", async () => {
    if (skip) return;
    const payload = {
      handle: "logoutuser",
      email: "logout@example.com",
      display_name: "Logout User",
      password: "pw123"
    };
    await post("/auth/register", payload);
    const res = await post<{ token: string }>("/auth/login", {
      handle: payload.handle,
      password: payload.password
    });
    const setCookie = res.headers.get("set-cookie");
    const cookieHeader = setCookie?.split(";")[0] ?? "";

    const logout = await post("/auth/logout", undefined, { Cookie: cookieHeader });
    expect(logout.status).toBe(204);
    const cleared = logout.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/auth_token=;/);

    const me = await getJson<{ error: { code: string } }>("/auth/me");
    expect(me.status).toBe(401);
    expect(me.json.error.code).toBe("UNAUTHORIZED");
  });
});
