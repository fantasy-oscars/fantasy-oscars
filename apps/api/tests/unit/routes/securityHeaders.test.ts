import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { createServer } from "../../../src/server.js";

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

function makeApp() {
  process.env = {
    ...savedEnv,
    PORT: "4000",
    AUTH_SECRET: "test-secret",
    CORS_ALLOWED_ORIGINS: "http://localhost:5173"
  };
  return createServer({ db: {} as unknown as Pool });
}

describe("security headers", () => {
  it("sets helmet headers on API responses", async () => {
    const res = await request(makeApp()).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("keeps CORS credentials headers alongside helmet", async () => {
    const res = await request(makeApp())
      .options("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
