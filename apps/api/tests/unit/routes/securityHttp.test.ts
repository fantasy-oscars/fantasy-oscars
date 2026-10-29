import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createServer } from "../../../src/server.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { signToken } from "../../../src/auth/token.js";

const fakeDb = {} as unknown as Pool;
const savedEnv = { ...process.env };

function makeApp(env: Record<string, string> = {}) {
  process.env = {
    ...savedEnv,
    PORT: "4000",
    AUTH_SECRET: "test-secret",
    CORS_ALLOWED_ORIGINS: "http://localhost:5173/",
    ...env
  };
  return createServer({ db: fakeDb });
}

beforeEach(() => resetAllRateLimiters());
afterEach(() => {
  process.env = { ...savedEnv };
});

describe("CORS origin matching", () => {
  it("allows an exact origin with credentials", async () => {
    const res = await request(makeApp())
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow a lookalike origin that starts with an allowed one", async () => {
    const res = await request(makeApp())
      .get("/health")
      .set("Origin", "http://localhost:5173.evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("does not allow a different port", async () => {
    const res = await request(makeApp())
      .get("/health")
      .set("Origin", "http://localhost:51730");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("login rate limiting behind a proxy", () => {
  // A short password fails validation before any DB access, but the limiters run first.
  const login = (app: ReturnType<typeof makeApp>, ip: string, username: string) =>
    request(app)
      .post("/auth/login")
      .set("X-Forwarded-For", ip)
      .send({ username, password: "x" });

  it("limits clients independently by forwarded IP", async () => {
    const app = makeApp({ TRUST_PROXY: "1" });
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await login(app, "203.0.113.1", "alice")).status;
    expect(last).toBe(429);
    expect((await login(app, "203.0.113.2", "alice")).status).not.toBe(429);
  });

  it("limits per IP and username at 8/min, other usernames unaffected", async () => {
    const app = makeApp({ TRUST_PROXY: "1" });
    for (let i = 0; i < 8; i++) {
      expect((await login(app, "203.0.113.1", "alice")).status).not.toBe(429);
    }
    expect((await login(app, "203.0.113.1", "alice")).status).toBe(429);
    expect((await login(app, "203.0.113.1", "ALICE")).status).toBe(429);
    expect((await login(app, "203.0.113.1", "bob")).status).not.toBe(429);
  });

  it("limits a single IP overall at 30/min across usernames", async () => {
    const app = makeApp({ TRUST_PROXY: "1" });
    for (let i = 0; i < 30; i++) {
      expect((await login(app, "203.0.113.1", `user${i}`)).status).not.toBe(429);
    }
    expect((await login(app, "203.0.113.1", "another")).status).toBe(429);
    expect((await login(app, "203.0.113.9", "another")).status).not.toBe(429);
  }, 30_000);

  it("keys on the right-most X-Forwarded-For entry with one trusted proxy", async () => {
    const app = makeApp({ TRUST_PROXY: "1" });
    // The left-most entry is client-controlled; rotating it must not rotate identity.
    for (let i = 0; i < 8; i++) {
      const res = await login(app, `10.0.0.${i}, 198.51.100.7`, "alice");
      expect(res.status).not.toBe(429);
    }
    expect((await login(app, "10.9.9.9, 198.51.100.7", "alice")).status).toBe(429);
    // A different right-most entry is a different client.
    expect((await login(app, "10.9.9.9, 198.51.100.8", "alice")).status).not.toBe(429);
  });

  it("ignores X-Forwarded-For when trust proxy is off", async () => {
    const app = makeApp({ TRUST_PROXY: "false" });
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (await login(app, `203.0.113.${i}`, "alice")).status;
    }
    expect(last).toBe(429);
  });
});

describe("malformed tokens", () => {
  it("returns 401 INVALID_TOKEN (not 500) for a wrong-length signature", async () => {
    const good = signToken({ sub: "1", username: "u" }, "test-secret");
    const [h, p] = good.split(".");
    const res = await request(makeApp())
      .get("/admin/users")
      .set("Authorization", `Bearer ${h}.${p}.short`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
