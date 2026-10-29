import crypto from "crypto";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { io as createClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { signToken } from "../../../src/auth/token.js";
import {
  DRAFT_NAMESPACE,
  registerDraftNamespace
} from "../../../src/realtime/draftNamespace.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  ListenPermissionError,
  startSocketTestServer,
  type SocketTestServer
} from "../../support/socket.js";
import request from "supertest";
import type { Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "../../..");
const authSecret = "test-secret";
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Awaited<ReturnType<typeof startTestDatabase>>;
// Plain (cookie-less) requests: each call sends only the credentials it sets.
let app: Express;
let socketServer: SocketTestServer | undefined;

type SessionRow = {
  id: string;
  user_id: string;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};

function decodeClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
}

function setCookieHeader(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  return Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
}

async function register(username: string, password = "secret123") {
  const res = await request(app)
    .post("/auth/register")
    .send({ username, email: `${username}@example.com`, password });
  expect(res.status).toBe(201);
  return res.body.user as { id: number; username: string };
}

async function login(username: string, password = "secret123") {
  const res = await request(app).post("/auth/login").send({ username, password });
  return { status: res.status, token: res.body.token as string, headers: res.headers };
}

async function me(token: string) {
  return request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
}

async function sessionRows(userId: number) {
  const { rows } = await db.pool.query<SessionRow>(
    `SELECT id, user_id, last_seen_at, expires_at, revoked_at
     FROM auth_session WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return rows;
}

async function sessionRow(id: string) {
  const { rows } = await db.pool.query<SessionRow>(
    `SELECT id, user_id, last_seen_at, expires_at, revoked_at
     FROM auth_session WHERE id = $1`,
    [id]
  );
  return rows[0];
}

/** Resolves with the handshake error message, or "connected". */
async function socketHandshake(token: string): Promise<string> {
  if (!socketServer) throw new Error("socket server not started");
  const socket: Socket = createClient(`${socketServer.url}${DRAFT_NAMESPACE}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    query: { draftId: "424242" },
    extraHeaders: { Authorization: `Bearer ${token}` }
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("handshake timeout")), 5000);
      socket.on("connect", () => {
        clearTimeout(timer);
        resolve("connected");
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
    });
  } finally {
    socket.disconnect();
  }
}

function runResetScript(opts: {
  args: string[];
  env?: Record<string, string>;
  stdin?: string;
}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: db.connectionString };
    delete env.RESET_PASSWORD;
    Object.assign(env, opts.env ?? {});
    const child = spawn(process.execPath, ["scripts/reset-password.mjs", ...opts.args], {
      cwd: apiRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(opts.stdin ?? "");
  });
}

describe("auth sessions", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3121";
    process.env.AUTH_SECRET = authSecret;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    app = createServer({ db: db.pool });
    try {
      socketServer = await startSocketTestServer((io) => {
        registerDraftNamespace(io, { db: db.pool, authSecret });
      });
    } catch (err) {
      if (!(err instanceof ListenPermissionError)) throw err;
    }
  }, 120_000);

  afterAll(async () => {
    if (socketServer) await socketServer.close();
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
  });

  afterEach(() => {
    resetAllRateLimiters();
  });

  it("creates a 30-day session on login and binds the token to it", async () => {
    const user = await register("sess1");
    const res = await login("sess1");
    expect(res.status).toBe(200);

    const rows = await sessionRows(user.id);
    expect(rows).toHaveLength(1);
    const claims = decodeClaims(res.token);
    expect(claims.sid).toBe(rows[0]!.id);
    expect(rows[0]!.revoked_at).toBeNull();

    const ttl = new Date(rows[0]!.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29.9 * DAY_MS);
    expect(ttl).toBeLessThanOrEqual(30 * DAY_MS);
    // JWT exp is aligned with the session expiry.
    expect(
      Math.abs(Number(claims.exp) * 1000 - new Date(rows[0]!.expires_at).getTime())
    ).toBeLessThan(2000);
    expect(setCookieHeader(res.headers)).toMatch(/auth_token=.+Max-Age=259\d{4}/);
  });

  it("revokes only the current session on logout (HTTP and socket)", async () => {
    await register("sess2");
    const first = await login("sess2");
    const second = await login("sess2");

    expect((await me(first.token)).status).toBe(200);
    if (socketServer) {
      // Valid session: auth passes and the (missing) draft is the next failure.
      expect(await socketHandshake(first.token)).toMatch(/Draft not found/i);
    }

    const logout = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${first.token}`);
    expect(logout.status).toBe(204);
    expect(setCookieHeader(logout.headers)).toMatch(/auth_token=;/);

    const sid = String(decodeClaims(first.token).sid);
    expect((await sessionRow(sid))!.revoked_at).not.toBeNull();

    const after = await me(first.token);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("UNAUTHORIZED");
    const cookieAfter = await request(app)
      .get("/auth/me")
      .set("Cookie", `auth_token=${first.token}`);
    expect(cookieAfter.status).toBe(401);
    if (socketServer) {
      expect(await socketHandshake(first.token)).toMatch(/session has expired/i);
    }

    // The other device stays signed in.
    expect((await me(second.token)).status).toBe(200);
    if (socketServer) {
      expect(await socketHandshake(second.token)).toMatch(/Draft not found/i);
    }
  });

  it("rejects tokens whose session expired and tokens without a session id", async () => {
    const user = await register("sess3");
    const res = await login("sess3");
    const sid = String(decodeClaims(res.token).sid);
    await db.pool.query(
      `UPDATE auth_session SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [sid]
    );
    const expired = await me(res.token);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("UNAUTHORIZED");

    // Shape of a token issued before server-side sessions existed.
    const legacy = signToken(
      { sub: String(user.id), username: user.username },
      authSecret
    );
    const noSid = await me(legacy);
    expect(noSid.status).toBe(401);
    expect(noSid.body.error.code).toBe("UNAUTHORIZED");
    if (socketServer) {
      expect(await socketHandshake(legacy)).toMatch(/session has expired/i);
    }

    // A sid that does not belong to the token's user is rejected too.
    const other = await register("sess3other");
    const forged = signToken(
      { sub: String(other.id), username: other.username, sid },
      authSecret
    );
    expect((await me(forged)).status).toBe(401);
  });

  it("slides the session expiry at most once per 24 hours", async () => {
    await register("sess4");
    const res = await login("sess4");
    const sid = String(decodeClaims(res.token).sid);

    // Fresh session: a request does not write.
    const before = (await sessionRow(sid))!;
    const fresh = await me(res.token);
    expect(fresh.status).toBe(200);
    expect(setCookieHeader(fresh.headers)).not.toMatch(/auth_token=/);
    const unchanged = (await sessionRow(sid))!;
    expect(new Date(unchanged.last_seen_at).getTime()).toBe(
      new Date(before.last_seen_at).getTime()
    );
    expect(new Date(unchanged.expires_at).getTime()).toBe(
      new Date(before.expires_at).getTime()
    );

    // Last seen more than 24 h ago: the session is extended and the cookie re-issued.
    await db.pool.query(
      `UPDATE auth_session
       SET last_seen_at = now() - interval '25 hours',
           expires_at = now() + interval '5 days'
       WHERE id = $1`,
      [sid]
    );
    const renewed = await me(res.token);
    expect(renewed.status).toBe(200);
    expect(setCookieHeader(renewed.headers)).toMatch(/auth_token=.+Max-Age=259\d{4}/);
    const row = (await sessionRow(sid))!;
    expect(new Date(row.expires_at).getTime() - Date.now()).toBeGreaterThan(
      29.9 * DAY_MS
    );
    expect(Date.now() - new Date(row.last_seen_at).getTime()).toBeLessThan(60_000);
    // The body token (Bearer fallback) carries the same session and the new expiry.
    const refreshed = decodeClaims(renewed.body.token as string);
    expect(refreshed.sid).toBe(sid);
    expect(
      Math.abs(Number(refreshed.exp) * 1000 - new Date(row.expires_at).getTime())
    ).toBeLessThan(2000);

    // Immediately afterwards nothing is written again.
    const again = await me(res.token);
    expect(again.status).toBe(200);
    expect(setCookieHeader(again.headers)).not.toMatch(/auth_token=/);
    const still = (await sessionRow(sid))!;
    expect(new Date(still.expires_at).getTime()).toBe(new Date(row.expires_at).getTime());
  });

  it("revokes all sessions when a user deletes their account", async () => {
    const user = await register("sess5");
    const a = await login("sess5");
    await login("sess5");

    const res = await request(app)
      .delete("/auth/me")
      .set("Authorization", `Bearer ${a.token}`);
    expect(res.status).toBe(204);

    const rows = await sessionRows(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revoked_at !== null)).toBe(true);
    expect((await me(a.token)).status).toBe(401);
  });

  it("revokes all sessions when an admin deletes a user", async () => {
    const admin = await register("sessadmin");
    await db.pool.query(
      `UPDATE app_user SET is_admin = TRUE, admin_role = 'SUPER_ADMIN' WHERE id = $1`,
      [admin.id]
    );
    const adminLogin = await login("sessadmin");
    const target = await register("sess6");
    const t1 = await login("sess6");
    await login("sess6");

    const res = await request(app)
      .delete(`/admin/users/${target.id}`)
      .set("Authorization", `Bearer ${adminLogin.token}`);
    expect(res.status).toBe(204);

    const rows = await sessionRows(target.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revoked_at !== null)).toBe(true);
    expect((await me(t1.token)).status).toBe(401);
  });

  it("upgrades a legacy sha256 password hash on login", async () => {
    const user = await register("sess7");
    const legacy = crypto.createHash("sha256").update("legacy-pass").digest("hex");
    await db.pool.query(
      `UPDATE auth_password SET password_hash = $2, password_algo = 'sha256' WHERE user_id = $1`,
      [user.id, legacy]
    );

    const res = await login("sess7", "legacy-pass");
    expect(res.status).toBe(200);
    const { rows } = await db.pool.query(
      `SELECT password_hash, password_algo FROM auth_password WHERE user_id = $1`,
      [user.id]
    );
    expect(rows[0].password_algo).toBe("scrypt");
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);

    // The upgraded hash keeps working; the wrong password still fails.
    expect((await login("sess7", "legacy-pass")).status).toBe(200);
    expect((await login("sess7", "not-the-pass")).status).toBe(401);
  });

  it("resets a password via the admin script and revokes all sessions", async () => {
    const user = await register("sess8");
    const a = await login("sess8");
    const b = await login("sess8");

    const viaEnv = await runResetScript({
      args: ["--username", "SESS8"],
      env: { RESET_PASSWORD: "brand-new-pass" }
    });
    expect(viaEnv.stderr).toBe("");
    expect(viaEnv.code).toBe(0);
    expect(JSON.parse(viaEnv.stdout)).toMatchObject({ ok: true, sessions_revoked: 2 });

    expect((await me(a.token)).status).toBe(401);
    expect((await me(b.token)).status).toBe(401);
    expect((await login("sess8", "secret123")).status).toBe(401);
    const fresh = await login("sess8", "brand-new-pass");
    expect(fresh.status).toBe(200);
    expect((await me(fresh.token)).status).toBe(200);

    // Stdin works too and revokes the session created above.
    const viaStdin = await runResetScript({
      args: ["--username", "sess8"],
      stdin: "from-stdin-pass\n"
    });
    expect(viaStdin.code).toBe(0);
    expect((await me(fresh.token)).status).toBe(401);
    expect((await login("sess8", "from-stdin-pass")).status).toBe(200);

    // The password is never accepted on the command line.
    const viaArgv = await runResetScript({
      args: ["--username", "sess8", "--password", "argv-pass-123"]
    });
    expect(viaArgv.code).not.toBe(0);
    expect(viaArgv.stderr).toMatch(/Do not pass the password as an argument/);
    expect((await login("sess8", "argv-pass-123")).status).toBe(401);
    const viaArgvEq = await runResetScript({
      args: ["--username", "sess8", "--password=argv-pass-456"]
    });
    expect(viaArgvEq.code).not.toBe(0);
    expect(viaArgvEq.stderr).toMatch(/shell history/);
    expect((await login("sess8", "argv-pass-456")).status).toBe(401);

    const rows = await sessionRows(user.id);
    expect(rows.filter((r) => r.revoked_at === null)).toHaveLength(1);
  });

  it("caps a session at 180 days from creation despite sliding renewal", async () => {
    await register("sess9");
    const res = await login("sess9");
    const sid = String(decodeClaims(res.token).sid);

    // 179 days old and due for renewal: the new expiry stops at the cap.
    await db.pool.query(
      `UPDATE auth_session
       SET created_at = now() - interval '179 days',
           last_seen_at = now() - interval '25 hours',
           expires_at = now() + interval '1 hour'
       WHERE id = $1`,
      [sid]
    );
    const renewed = await me(res.token);
    expect(renewed.status).toBe(200);
    const row = (await sessionRow(sid))!;
    const remaining = new Date(row.expires_at).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(0.9 * DAY_MS);
    expect(remaining).toBeLessThan(1.1 * DAY_MS);
    const refreshed = decodeClaims(renewed.body.token as string);
    expect(Number(refreshed.exp) * 1000).toBeLessThanOrEqual(
      new Date(row.expires_at).getTime() + 1000
    );

    // Past the cap the session is rejected even if expires_at says otherwise.
    await db.pool.query(
      `UPDATE auth_session
       SET created_at = now() - interval '181 days',
           expires_at = now() + interval '10 days'
       WHERE id = $1`,
      [sid]
    );
    expect((await me(res.token)).status).toBe(401);
    if (socketServer) {
      expect(await socketHandshake(res.token)).toMatch(/session has expired/i);
    }
  });

  it("marks auth responses as not cacheable", async () => {
    await register("sess10");
    const res = await login("sess10");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((await me(res.token)).headers["cache-control"]).toBe("no-store");
    const logout = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${res.token}`);
    expect(logout.headers["cache-control"]).toBe("no-store");
  });

  it("clears the cookie only when the rejected credential was the cookie", async () => {
    await register("sess11");
    const res = await login("sess11");
    await request(app).post("/auth/logout").set("Authorization", `Bearer ${res.token}`);

    const viaBearer = await me(res.token);
    expect(viaBearer.status).toBe(401);
    expect(setCookieHeader(viaBearer.headers)).not.toMatch(/auth_token=/);

    const viaCookie = await request(app)
      .get("/auth/me")
      .set("Cookie", `auth_token=${res.token}`);
    expect(viaCookie.status).toBe(401);
    expect(setCookieHeader(viaCookie.headers)).toMatch(/auth_token=;/);
  });

  it("revokes both the Bearer and the cookie session on logout", async () => {
    await register("sess12");
    const viaHeader = await login("sess12");
    const viaCookie = await login("sess12");
    const logout = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${viaHeader.token}`)
      .set("Cookie", `auth_token=${viaCookie.token}`);
    expect(logout.status).toBe(204);
    expect((await me(viaHeader.token)).status).toBe(401);
    expect((await me(viaCookie.token)).status).toBe(401);
  });

  it("refuses logout and self-delete from a disallowed Origin", async () => {
    const user = await register("sess13");
    const res = await login("sess13");
    const sid = String(decodeClaims(res.token).sid);

    const evilLogout = await request(app)
      .post("/auth/logout")
      .set("Origin", "https://evil.example")
      .set("Cookie", `auth_token=${res.token}`);
    expect(evilLogout.status).toBe(403);
    expect((await sessionRow(sid))!.revoked_at).toBeNull();

    const evilDelete = await request(app)
      .delete("/auth/me")
      .set("Origin", "https://evil.example")
      .set("Cookie", `auth_token=${res.token}`);
    expect(evilDelete.status).toBe(403);
    const { rows } = await db.pool.query(
      `SELECT deleted_at FROM app_user WHERE id = $1`,
      [user.id]
    );
    expect(rows[0].deleted_at).toBeNull();

    // An allowed browser origin (default dev allow-list) works.
    const okLogout = await request(app)
      .post("/auth/logout")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `auth_token=${res.token}`);
    expect(okLogout.status).toBe(204);
    expect((await sessionRow(sid))!.revoked_at).not.toBeNull();
  });

  it("refuses a login whose password is reset while it is in flight", async () => {
    const user = await register("sess14");
    const reset = await db.pool.connect();
    try {
      // A reset holds the password row: it has changed the hash but not committed.
      await reset.query("BEGIN");
      await reset.query(
        `UPDATE auth_password SET password_hash = 'scrypt$reset-in-progress' WHERE user_id = $1`,
        [user.id]
      );
      // The login verifies the old (committed) hash, then waits on the row lock.
      const pending = login("sess14");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await reset.query(`UPDATE auth_session SET revoked_at = now() WHERE user_id = $1`, [
        user.id
      ]);
      await reset.query("COMMIT");

      const res = await pending;
      expect(res.status).toBe(401);
      expect(await sessionRows(user.id)).toHaveLength(0);
    } finally {
      reset.release();
    }
  });
});
