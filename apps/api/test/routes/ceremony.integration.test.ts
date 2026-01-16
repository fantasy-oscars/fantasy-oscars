import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import { insertCeremony, insertUser } from "../factories/db.js";
import crypto from "crypto";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

async function adminToken(): Promise<string> {
  const user = await insertUser(db.pool);
  await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [user.id]);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: String(user.id), handle: user.handle, is_admin: true };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? "test-secret")
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

describe("ceremony routes", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3110";
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

  it("returns 404 when active ceremony is not set", async () => {
    const res = await api.get("/ceremony/active");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACTIVE_CEREMONY_NOT_SET");
  });

  it("returns the active ceremony after admin sets it", async () => {
    const ceremony = await insertCeremony(db.pool);
    const token = await adminToken();

    const setRes = await api
      .post("/admin/ceremony/active")
      .set("Authorization", `Bearer ${token}`)
      .set("content-type", "application/json")
      .send({ ceremony_id: ceremony.id });
    expect(setRes.status).toBe(200);

    const res = await api.get("/ceremony/active");
    expect(res.status).toBe(200);
    expect(res.body.ceremony.id).toBe(ceremony.id);
  });
});
