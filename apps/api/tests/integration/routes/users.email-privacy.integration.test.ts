import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCeremony,
  insertLeague,
  insertLeagueMember,
  insertSeason,
  insertUser
} from "../../factories/db.js";
import { signTestToken } from "../../support/session.js";

const authSecret = "test-secret";
let db: Awaited<ReturnType<typeof startTestDatabase>>;
let app: Express;

/** Commissioner of an open season, one fellow member, and one outsider. */
async function bootstrap() {
  const ceremony = await insertCeremony(db.pool);
  const owner = await insertUser(db.pool, { email: "owner-private@example.com" });
  const member = await insertUser(db.pool, {
    username: "fellowmember",
    email: "member-private@example.com"
  });
  const outsider = await insertUser(db.pool, {
    username: "zed",
    email: "findme-private@example.com"
  });
  const league = await insertLeague(db.pool, {
    ceremony_id: ceremony.id,
    created_by_user_id: owner.id
  });
  const season = await insertSeason(db.pool, {
    league_id: league.id,
    ceremony_id: ceremony.id,
    status: "EXTANT"
  });
  for (const [user, role] of [
    [owner, "OWNER"],
    [member, "MEMBER"]
  ] as const) {
    const lm = await insertLeagueMember(db.pool, {
      league_id: league.id,
      user_id: user.id,
      role
    });
    await db.pool.query(
      `INSERT INTO season_member (season_id, user_id, league_member_id, role)
       VALUES ($1, $2, $3, $4)`,
      [season.id, user.id, lm.id, role]
    );
  }
  const token = signTestToken(
    { sub: String(owner.id), username: owner.username },
    authSecret
  );
  return { owner, member, outsider, league, season, token };
}

describe("user email privacy", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
    process.env.AUTH_SECRET = authSecret;
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    app = createServer({ db: db.pool });
  }, 120_000);

  afterAll(async () => {
    if (db) await db.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(db.pool);
    resetAllRateLimiters();
  });

  it("invitee search matches usernames only and returns no emails", async () => {
    const { season, outsider, token } = await bootstrap();
    const search = (q: string) =>
      request(app)
        .get(`/seasons/${season.id}/invitees`)
        .query({ q })
        .set("Authorization", `Bearer ${token}`);

    const byEmail = await search("findme-private");
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.users).toEqual([]);

    const byDomain = await search("@example.com");
    expect(byDomain.status).toBe(200);
    expect(byDomain.body.users).toEqual([]);

    const byUsername = await search("zed");
    expect(byUsername.status).toBe(200);
    expect(byUsername.body.users).toEqual([{ id: outsider.id, username: "zed" }]);
    expect(JSON.stringify(byUsername.body)).not.toContain("@");
  });

  it("member lists carry no other user's email", async () => {
    const { league, season, token } = await bootstrap();
    for (const path of [
      `/seasons/${season.id}/members`,
      `/leagues/${league.id}/members`
    ]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).toContain("fellowmember");
      expect(body).not.toContain("member-private@example.com");
      expect(body).not.toContain("owner-private@example.com");
    }
  });

  it("admin user search still matches on and returns emails", async () => {
    const { owner } = await bootstrap();
    await db.pool.query(
      `UPDATE app_user SET is_admin = TRUE, admin_role = 'SUPER_ADMIN' WHERE id = $1`,
      [owner.id]
    );
    const adminToken = signTestToken(
      { sub: String(owner.id), username: owner.username, is_admin: true },
      authSecret
    );
    const res = await request(app)
      .get("/admin/users")
      .query({ q: "findme-private" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([
      expect.objectContaining({ username: "zed", email: "findme-private@example.com" })
    ]);
  });
});
