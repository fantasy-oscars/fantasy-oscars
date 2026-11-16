import crypto from "crypto";
import request from "supertest";
import type { Express } from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { createServer } from "../../../src/server.js";
import type { Mailer } from "../../../src/services/mail/mailer.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { authTokenFromResponse } from "../../support/session.js";

const authSecret = "test-secret";
const MINUTE_MS = 60_000;

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let app: Express;

// Records messages without logging them, so the log checks below see only
// what the app itself writes.
const outbox: Array<{ to: string; link: string }> = [];
const recordingMailer: Mailer = {
  async sendPasswordReset(to, link) {
    outbox.push({ to, link });
  }
};

function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error("link carries no token");
  return token;
}

async function register(username: string, password = "secret123") {
  const res = await request(app)
    .post("/auth/register")
    .send({ username, email: `${username}@example.com`, password });
  expect(res.status).toBe(201);
  return res.body.user as { id: number; username: string; email: string };
}

async function login(username: string, password = "secret123") {
  const res = await request(app).post("/auth/login").send({ username, password });
  return {
    status: res.status,
    token: res.status === 200 ? authTokenFromResponse(res.headers) : ""
  };
}

async function me(token: string) {
  return request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
}

async function requestReset(email: string, ip = "198.51.100.1") {
  return request(app)
    .post("/auth/password-reset/request")
    .set("X-Forwarded-For", ip)
    .send({ email });
}

async function confirmReset(token: string, password: string, ip = "198.51.100.1") {
  return request(app)
    .post("/auth/password-reset/confirm")
    .set("X-Forwarded-For", ip)
    .send({ token, password });
}

/** Requests a reset for a known address and returns the emailed token. */
async function issueToken(email: string) {
  const before = outbox.length;
  const res = await requestReset(email);
  expect(res.status).toBe(200);
  expect(outbox).toHaveLength(before + 1);
  return tokenFromLink(outbox[outbox.length - 1]!.link);
}

describe("account recovery", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3122";
    process.env.AUTH_SECRET = authSecret;
    // Honour X-Forwarded-For so tests can act from distinct client IPs.
    process.env.TRUST_PROXY = "1";
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    app = createServer({ db: db.pool, mailer: recordingMailer });
  }, 120_000);

  afterAll(async () => {
    delete process.env.TRUST_PROXY;
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
    outbox.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAllRateLimiters();
  });

  describe("reset request", () => {
    it("answers an unknown and a known address identically", async () => {
      await register("known1");

      const unknown = await requestReset("nobody@example.com");
      const known = await requestReset("KNOWN1@example.com");

      expect(unknown.status).toBe(200);
      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
      expect(known.headers["content-type"]).toBe(unknown.headers["content-type"]);
      expect(known.headers["cache-control"]).toBe("no-store");

      // Only the known address gets an email, with a link to the web reset screen.
      expect(outbox).toHaveLength(1);
      expect(outbox[0]!.to).toBe("known1@example.com");
      expect(outbox[0]!.link).toMatch(/^http:\/\/localhost:5173\/reset-password\?token=/);
    });

    it("stores only the SHA-256 of the token, expiring 60 minutes later", async () => {
      const user = await register("hash1");
      const token = await issueToken("hash1@example.com");

      const { rows } = await db.pool.query<{
        token_hash: string;
        created_at: Date;
        expires_at: Date;
        used_at: Date | null;
      }>(
        `SELECT token_hash, created_at, expires_at, used_at FROM password_reset_token WHERE user_id = $1`,
        [user.id]
      );
      expect(rows).toHaveLength(1);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(rows[0]!.token_hash).toBe(
        crypto.createHash("sha256").update(token).digest("hex")
      );
      expect(rows[0]!.token_hash).not.toContain(token);
      expect(rows[0]!.used_at).toBeNull();
      expect(
        new Date(rows[0]!.expires_at).getTime() - new Date(rows[0]!.created_at).getTime()
      ).toBe(60 * MINUTE_MS);
    });

    it("rejects a malformed address without revealing anything", async () => {
      const res = await requestReset("not-an-email");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(outbox).toHaveLength(0);
    });
  });

  describe("reset confirm", () => {
    it("works once, sets the password and does not sign the user in", async () => {
      await register("once1");
      const token = await issueToken("once1@example.com");

      const ok = await confirmReset(token, "brand-new-pass");
      expect(ok.status).toBe(204);
      expect(ok.headers["set-cookie"]).toBeUndefined();

      expect((await login("once1", "secret123")).status).toBe(401);
      expect((await login("once1", "brand-new-pass")).status).toBe(200);

      const again = await confirmReset(token, "another-pass-1");
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe("INVALID_RESET_TOKEN");
      expect((await login("once1", "brand-new-pass")).status).toBe(200);
    });

    it("fails 60 minutes after the request", async () => {
      await register("exp1");
      const t0 = new Date();
      vi.useFakeTimers({ toFake: ["Date"], now: t0 });

      const early = await issueToken("exp1@example.com");
      vi.setSystemTime(new Date(t0.getTime() + 59 * MINUTE_MS));
      expect((await confirmReset(early, "brand-new-pass")).status).toBe(204);

      const t1 = new Date(t0.getTime() + 60 * MINUTE_MS);
      vi.setSystemTime(t1);
      const late = await issueToken("exp1@example.com");
      vi.setSystemTime(new Date(t1.getTime() + 60 * MINUTE_MS));
      const expired = await confirmReset(late, "another-pass-1");
      expect(expired.status).toBe(400);
      expect(expired.body.error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("fails once a newer link has been requested", async () => {
      await register("newer1");
      const first = await issueToken("newer1@example.com");
      const second = await issueToken("newer1@example.com");

      const stale = await confirmReset(first, "brand-new-pass");
      expect(stale.status).toBe(400);
      expect(stale.body.error.code).toBe("INVALID_RESET_TOKEN");
      expect((await confirmReset(second, "brand-new-pass")).status).toBe(204);
    });

    it("gives an unknown token the same error as a used one", async () => {
      const res = await confirmReset("x".repeat(43), "brand-new-pass");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: "INVALID_RESET_TOKEN",
        message: "This reset link is invalid or has expired. Ask for a new one."
      });
    });

    it("validates the new password with the shared rules", async () => {
      await register("weak1");
      const token = await issueToken("weak1@example.com");
      const res = await confirmReset(token, "short");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      // The token survives a rejected password.
      expect((await confirmReset(token, "long-enough-1")).status).toBe(204);
    });

    it("revokes every session of the user", async () => {
      await register("revoke1");
      const a = await login("revoke1");
      const b = await login("revoke1");
      expect((await me(a.token)).status).toBe(200);

      const token = await issueToken("revoke1@example.com");
      expect((await confirmReset(token, "brand-new-pass")).status).toBe(204);

      expect((await me(a.token)).status).toBe(401);
      expect((await me(b.token)).status).toBe(401);
    });
  });

  describe("change password", () => {
    it("requires the current password, keeps this session and revokes the others", async () => {
      await register("chpw1");
      const current = await login("chpw1");
      const other = await login("chpw1");

      const wrong = await request(app)
        .post("/auth/password")
        .set("Authorization", `Bearer ${current.token}`)
        .send({ currentPassword: "not-it-at-all", newPassword: "brand-new-pass" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
      expect((await me(other.token)).status).toBe(200);

      const ok = await request(app)
        .post("/auth/password")
        .set("Authorization", `Bearer ${current.token}`)
        .send({ currentPassword: "secret123", newPassword: "brand-new-pass" });
      expect(ok.status).toBe(204);

      expect((await me(current.token)).status).toBe(200);
      expect((await me(other.token)).status).toBe(401);
      expect((await login("chpw1", "secret123")).status).toBe(401);
      expect((await login("chpw1", "brand-new-pass")).status).toBe(200);
    });

    it("voids outstanding reset links", async () => {
      await register("chpw2");
      const session = await login("chpw2");
      const token = await issueToken("chpw2@example.com");
      const ok = await request(app)
        .post("/auth/password")
        .set("Authorization", `Bearer ${session.token}`)
        .send({ currentPassword: "secret123", newPassword: "brand-new-pass" });
      expect(ok.status).toBe(204);
      expect((await confirmReset(token, "another-pass-1")).status).toBe(400);
    });

    it("requires a session", async () => {
      const res = await request(app)
        .post("/auth/password")
        .send({ currentPassword: "secret123", newPassword: "brand-new-pass" });
      expect(res.status).toBe(401);
    });
  });

  describe("change email", () => {
    it("requires the current password", async () => {
      const user = await register("chem1");
      const session = await login("chem1");
      const res = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${session.token}`)
        .send({ currentPassword: "wrong-password", email: "new@example.com" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
      const { rows } = await db.pool.query(`SELECT email FROM app_user WHERE id = $1`, [
        user.id
      ]);
      expect(rows[0].email).toBe("chem1@example.com");
    });

    it("rejects an address another account uses, ignoring case", async () => {
      await register("chem2");
      await register("taken2");
      const session = await login("chem2");
      const res = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${session.token}`)
        .send({ currentPassword: "secret123", email: "TAKEN2@Example.com" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: "USER_EXISTS",
        message: "User with username/email already exists"
      });
    });

    it("changes the address and moves recovery to it", async () => {
      await register("chem3");
      const session = await login("chem3");
      const oldLink = await issueToken("chem3@example.com");

      const res = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${session.token}`)
        .send({ currentPassword: "secret123", email: " New3@Example.com " });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: { email: "new3@example.com" } });
      expect((await me(session.token)).body.user.email).toBe("new3@example.com");

      // Links sent to the old address stop working; the old address no longer
      // receives anything; the new one does.
      expect((await confirmReset(oldLink, "brand-new-pass")).status).toBe(400);
      outbox.length = 0;
      await requestReset("chem3@example.com");
      expect(outbox).toHaveLength(0);
      await requestReset("new3@example.com");
      expect(outbox).toHaveLength(1);
    });
  });

  it("refuses password and email changes from a disallowed Origin", async () => {
    await register("origin1");
    const session = await login("origin1");

    const evilPassword = await request(app)
      .post("/auth/password")
      .set("Origin", "https://evil.example")
      .set("Cookie", `auth_token=${session.token}`)
      .send({ currentPassword: "secret123", newPassword: "brand-new-pass" });
    expect(evilPassword.status).toBe(403);

    const evilEmail = await request(app)
      .patch("/auth/email")
      .set("Origin", "https://evil.example")
      .set("Cookie", `auth_token=${session.token}`)
      .send({ currentPassword: "secret123", email: "evil@example.com" });
    expect(evilEmail.status).toBe(403);

    expect((await login("origin1", "secret123")).status).toBe(200);
    expect((await me(session.token)).body.user.email).toBe("origin1@example.com");

    const ok = await request(app)
      .post("/auth/password")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `auth_token=${session.token}`)
      .send({ currentPassword: "secret123", newPassword: "brand-new-pass" });
    expect(ok.status).toBe(204);
  });

  describe("rate limits", () => {
    it("limits reset requests per address across IPs", async () => {
      await register("rl1");
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (await requestReset("rl1@example.com", `203.0.113.${i + 1}`)).status
        );
      }
      expect(statuses).toEqual([200, 200, 200, 429]);
      // Unknown addresses are limited the same way.
      const unknown: number[] = [];
      for (let i = 0; i < 4; i++) {
        unknown.push(
          (await requestReset("ghost@example.com", `203.0.113.${i + 10}`)).status
        );
      }
      expect(unknown).toEqual([200, 200, 200, 429]);
    });

    it("limits reset requests per IP", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await requestReset(`user${i}@example.com`, "203.0.113.50")).status
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it("limits reset confirmations per IP", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await confirmReset(`bad-token-${i}`, "brand-new-pass", "203.0.113.60")).status
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  it("keeps tokens, passwords and full addresses out of logs and the audit log", async () => {
    const prevLevel = process.env.LOG_LEVEL;
    const prevFormat = process.env.LOG_FORMAT;
    process.env.LOG_LEVEL = "info";
    process.env.LOG_FORMAT = "json";
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const secrets: string[] = [
      "logs1@example.com",
      "logs1-new@example.com",
      "brand-new-pass",
      "newer-pass-22",
      "secret123"
    ];
    try {
      await register("logs1");
      const session = await login("logs1");
      await requestReset("nobody-logs@example.com");
      secrets.push("nobody-logs@example.com");
      const token = await issueToken("logs1@example.com");
      secrets.push(token);
      await confirmReset(token, "brand-new-pass");
      await confirmReset(token, "brand-new-pass");
      const fresh = await login("logs1", "brand-new-pass");
      await request(app)
        .post("/auth/password")
        .set("Authorization", `Bearer ${fresh.token}`)
        .send({ currentPassword: "wrong-password", newPassword: "newer-pass-22" });
      await request(app)
        .post("/auth/password")
        .set("Authorization", `Bearer ${fresh.token}`)
        .send({ currentPassword: "brand-new-pass", newPassword: "newer-pass-22" });
      await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${fresh.token}`)
        .send({ currentPassword: "newer-pass-22", email: "logs1-new@example.com" });
      expect(session.status).toBe(200);
    } finally {
      spy.mockRestore();
      process.env.LOG_LEVEL = prevLevel;
      process.env.LOG_FORMAT = prevFormat;
    }

    const joined = lines.join("\n");
    expect(joined).toContain("password_reset_requested");
    expect(joined).toContain("password_reset_completed");
    expect(joined).toContain("password_changed");
    expect(joined).toContain("email_changed");
    for (const secret of secrets) expect(joined).not.toContain(secret);

    const { rows } = await db.pool.query(
      `SELECT row_to_json(a)::text AS row FROM admin_audit_log a`
    );
    const audit = rows.map((r) => String(r.row)).join("\n");
    for (const secret of secrets) expect(audit).not.toContain(secret);
  });
});
