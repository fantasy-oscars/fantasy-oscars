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

describe("admin routes", () => {
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

  it("rejects non-admin users", async () => {
    const ceremony = await db.pool.query(
      `INSERT INTO ceremony (code, name, year) VALUES ('oscars-2026', 'Oscars 2026', 2026) RETURNING id`
    );
    const ceremonyId = ceremony.rows[0].id as number;

    await post("/auth/register", {
      handle: "user1",
      email: "user1@example.com",
      display_name: "User One",
      password: "secret123"
    });
    const login = await post<{ token: string }>("/auth/login", {
      handle: "user1",
      password: "secret123"
    });

    const res = await post<{ error: { code: string } }>(
      `/admin/ceremonies/${ceremonyId}/name`,
      { name: "New Name" },
      { Authorization: `Bearer ${login.json.token}` }
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("FORBIDDEN");
  });

  it("allows admin users to update ceremony names", async () => {
    const ceremony = await db.pool.query(
      `INSERT INTO ceremony (code, name, year) VALUES ('oscars-2027', 'Oscars 2027', 2027) RETURNING id`
    );
    const ceremonyId = ceremony.rows[0].id as number;

    const { json: reg } = await post<{ user: { id: number } }>("/auth/register", {
      handle: "admin1",
      email: "admin1@example.com",
      display_name: "Admin One",
      password: "secret123"
    });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [
      reg.user.id
    ]);

    const login = await post<{ token: string }>("/auth/login", {
      handle: "admin1",
      password: "secret123"
    });

    const res = await post<{ ceremony: { id: number; name: string } }>(
      `/admin/ceremonies/${ceremonyId}/name`,
      { name: "Updated Oscars" },
      { Authorization: `Bearer ${login.json.token}` }
    );

    expect(res.status).toBe(200);
    expect(res.json.ceremony.name).toBe("Updated Oscars");
  });
});
