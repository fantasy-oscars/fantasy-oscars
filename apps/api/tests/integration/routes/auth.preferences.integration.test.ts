import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

type MeBody = { user: { brand_preference: string | null } };

async function registerAndLogin(username = "brandfan") {
  await api
    .post("/auth/register")
    .send({ username, email: `${username}@example.com`, password: "pw123456" });
  return api.post("/auth/login").send({ username, password: "pw123456" });
}

const patch = (body: unknown) =>
  api
    .patch("/auth/me/preferences")
    .set("content-type", "application/json")
    .send(body as object);

describe("brand preference", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3101";
    process.env.AUTH_SECRET = "test-secret";
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
  });

  it("is null by default in the login and /auth/me payloads", async () => {
    const login = await registerAndLogin();
    expect(login.body.user.brand_preference).toBeNull();
    expect(login.body.user.sub).toBe(String(login.body.user.id));
    const me = await api.get("/auth/me");
    expect((me.body as MeBody).user.brand_preference).toBeNull();
  });

  it("saves a preference and returns it from /auth/me and login", async () => {
    await registerAndLogin();
    for (const value of ["noir", "random", "rotate"]) {
      const res = await patch({ brand_preference: value });
      expect(res.status).toBe(200);
      expect(res.body.preferences.brand_preference).toBe(value);
      const me = await api.get("/auth/me");
      expect((me.body as MeBody).user.brand_preference).toBe(value);
    }
    await api.post("/auth/logout");
    const again = await api
      .post("/auth/login")
      .send({ username: "brandfan", password: "pw123456" });
    expect(again.body.user.brand_preference).toBe("rotate");
  });

  it("clears the preference with null", async () => {
    await registerAndLogin();
    await patch({ brand_preference: "ballot" });
    const res = await patch({ brand_preference: null });
    expect(res.status).toBe(200);
    expect(res.body.preferences.brand_preference).toBeNull();
    const { rows } = await db.pool.query(
      `SELECT brand_preference FROM app_user WHERE username = 'brandfan'`
    );
    expect(rows[0].brand_preference).toBeNull();
  });

  it("rejects invalid values and leaves the stored value alone", async () => {
    await registerAndLogin();
    await patch({ brand_preference: "lightbox" });
    for (const bad of ["gold", "", "NOIR", 3, true, undefined]) {
      const res = await patch({ brand_preference: bad });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.fields).toContain("brand_preference");
    }
    const empty = await patch({});
    expect(empty.status).toBe(400);
    const me = await api.get("/auth/me");
    expect((me.body as MeBody).user.brand_preference).toBe("lightbox");
  });

  it("requires authentication", async () => {
    const res = await patch({ brand_preference: "noir" });
    expect(res.status).toBe(401);
  });

  it("refuses a disallowed Origin", async () => {
    await registerAndLogin();
    const res = await api
      .patch("/auth/me/preferences")
      .set("Origin", "https://evil.example")
      .send({ brand_preference: "noir" });
    expect(res.status).toBe(403);
  });
});
