import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../db.js";
import { createApiAgent, type ApiAgent } from "../support/supertest.js";
import {
  insertCeremony,
  insertUser,
  insertCategoryEdition,
  insertNomination
} from "../factories/db.js";
import crypto from "crypto";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
const authSecret = "test-secret";

async function post<T>(
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: T }> {
  const req = api.post(path).set({ "content-type": "application/json", ...headers });
  const res = await req.send(body ?? {});
  return { status: res.status, json: res.body as T };
}

async function getJson<T>(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; json: T }> {
  const req = api.get(path).set(headers);
  const res = await req;
  return { status: res.status, json: res.body as T };
}

async function adminToken(): Promise<string> {
  const user = await insertUser(db.pool);
  await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [user.id]);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: String(user.id), handle: user.handle, is_admin: true };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? authSecret)
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

  it("exposes lock state and winners for active ceremony", async () => {
    const ceremony = await insertCeremony(db.pool);
    const category = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
    const nomination = await insertNomination(db.pool, {
      category_edition_id: category.id
    });

    // No winners yet
    const lockBefore = await getJson<{
      draft_locked: boolean;
      draft_locked_at: string | null;
    }>("/ceremony/active/lock");
    expect(lockBefore.status).toBe(200);
    expect(lockBefore.json.draft_locked).toBe(false);
    const winnersBefore = await getJson<{
      winners: Array<{ category_edition_id: number }>;
    }>("/ceremony/active/winners");
    expect(winnersBefore.status).toBe(200);
    expect(winnersBefore.json.winners).toHaveLength(0);

    // Upsert winner via admin endpoint
    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      handle: "admin-w",
      email: "admin-w@example.com",
      display_name: "Admin W",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);
    const login = await post<{ token: string }>("/auth/login", {
      handle: "admin-w",
      password: "secret123"
    });

    const upsert = await post<{ winner: { nomination_id: number } }>(
      "/admin/winners",
      { category_edition_id: category.id, nomination_id: nomination.id },
      { Authorization: `Bearer ${login.json.token}` }
    );
    expect(upsert.status).toBe(200);

    const lockAfter = await getJson<{
      draft_locked: boolean;
      draft_locked_at: string | null;
    }>("/ceremony/active/lock");
    expect(lockAfter.status).toBe(200);
    expect(lockAfter.json.draft_locked).toBe(true);
    expect(lockAfter.json.draft_locked_at).toBeTruthy();

    const winnersAfter = await getJson<{
      winners: Array<{ category_edition_id: number; nomination_id: number }>;
    }>("/ceremony/active/winners");
    expect(winnersAfter.status).toBe(200);
    expect(winnersAfter.json.winners).toEqual([
      { category_edition_id: category.id, nomination_id: nomination.id }
    ]);
  });
});
