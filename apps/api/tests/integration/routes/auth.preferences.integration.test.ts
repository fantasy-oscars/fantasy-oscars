import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

type MeBody = { user: { brand_preference: string | null } };

const today = () => Math.floor(Date.now() / 86_400_000);
const draw = (day: number, brand = "refined-gold") => ({
  day,
  brand,
  rounds: { ceremony: [brand], cinema: [] }
});

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
      if (bad !== undefined) {
        expect(res.body.error.details.fields).toContain("brand_preference");
      }
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

  it("returns the appearance defaults in login and /auth/me", async () => {
    const login = await registerAndLogin();
    const expected = {
      mode_preference: null,
      random_excluded_brands: [],
      undiscovered_enabled: true,
      single_mode_policy: "own",
      discovered_brands: [],
      daily_draw: null
    };
    expect(login.body.user.appearance).toEqual(expected);
    const me = await api.get("/auth/me");
    expect(me.body.user.appearance).toEqual(expected);
  });

  it("updates only the fields sent", async () => {
    await registerAndLogin();
    await patch({ brand_preference: "noir" });
    const res = await patch({ mode_preference: "dark", single_mode_policy: "exclude" });
    expect(res.status).toBe(200);
    expect(res.body.preferences.brand_preference).toBe("noir");
    expect(res.body.preferences.appearance).toMatchObject({
      mode_preference: "dark",
      single_mode_policy: "exclude",
      undiscovered_enabled: true
    });
    const off = await patch({ undiscovered_enabled: false, mode_preference: null });
    expect(off.body.preferences.appearance).toMatchObject({
      mode_preference: null,
      single_mode_policy: "exclude",
      undiscovered_enabled: false
    });
    const me = await api.get("/auth/me");
    expect(me.body.user.brand_preference).toBe("noir");
    expect(me.body.user.appearance.undiscovered_enabled).toBe(false);
  });

  it("returns rotate and NULL brand preferences as stored", async () => {
    await registerAndLogin();
    const rotate = await patch({ brand_preference: "rotate", mode_preference: "light" });
    expect(rotate.body.preferences.brand_preference).toBe("rotate");
    await patch({ brand_preference: null });
    const me = await api.get("/auth/me");
    expect(me.body.user.brand_preference).toBeNull();
    expect(me.body.user.appearance.mode_preference).toBe("light");
  });

  it("unions discoveries and dedupes them", async () => {
    await registerAndLogin();
    await patch({ add_discovered_brands: ["noir", "ballot", "noir"] });
    const res = await patch({ add_discovered_brands: ["festival", "noir"] });
    expect(res.status).toBe(200);
    expect(res.body.preferences.appearance.discovered_brands).toEqual([
      "ballot",
      "festival",
      "noir"
    ]);
  });

  it("applies a draw when none is stored, then only for a newer day", async () => {
    await registerAndLogin();
    const day = today();
    const stored = (d: number) => draw(d, "refined-gold");
    const first = await patch({ daily_draw: stored(day - 1) });
    expect(first.body.preferences.appearance.daily_draw).toEqual(stored(day - 1));

    const older = await patch({ daily_draw: draw(day - 2, "ballot") });
    expect(older.status).toBe(200);
    expect(older.body.preferences.appearance.daily_draw).toEqual(stored(day - 1));

    const same = await patch({ daily_draw: draw(day - 1, "ballot") });
    expect(same.body.preferences.appearance.daily_draw).toEqual(stored(day - 1));

    const newer = await patch({ daily_draw: stored(day) });
    expect(newer.body.preferences.appearance.daily_draw).toEqual(stored(day));

    const stale = await patch({ daily_draw: draw(day - 1, "ballot") });
    expect(stale.body.preferences.appearance.daily_draw).toEqual(stored(day));
  });

  it("overwrites a stored draw whose theme is not a released brand", async () => {
    await registerAndLogin();
    const day = today();
    await patch({ daily_draw: draw(day, "refined-gold") });
    await db.pool.query(
      `UPDATE app_user
       SET daily_draw = jsonb_set(daily_draw, '{brand}', '"gold"')
       WHERE username = 'brandfan'`
    );
    const res = await patch({ daily_draw: draw(day, "refined-gold") });
    expect(res.body.preferences.appearance.daily_draw).toEqual(draw(day, "refined-gold"));
  });

  it("still applies the other fields when the draw is ignored", async () => {
    await registerAndLogin();
    const day = today();
    await patch({ daily_draw: draw(day) });
    const res = await patch({ daily_draw: draw(day - 1), mode_preference: "dark" });
    expect(res.body.preferences.appearance.mode_preference).toBe("dark");
    expect(res.body.preferences.appearance.daily_draw).toEqual(draw(day));
  });

  it("rejects a draw day more than two from the server day", async () => {
    await registerAndLogin();
    const day = today();
    for (const bad of [day - 3, day + 3, 1.5]) {
      const res = await patch({ daily_draw: draw(bad) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    for (const ok of [day - 2, day + 2]) {
      expect((await patch({ daily_draw: draw(ok) })).status).toBe(200);
    }
  });

  it("rejects a Random list that leaves nothing selected", async () => {
    await registerAndLogin();
    await patch({ undiscovered_enabled: false });
    const res = await patch({ random_excluded_brands: ["refined-gold"] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toContain("random_excluded_brands");
    const me = await api.get("/auth/me");
    expect(me.body.user.appearance.random_excluded_brands).toEqual([]);

    // With Undiscovered themes on, unseen themes still remain to draw from.
    const on = await patch({
      random_excluded_brands: ["refined-gold"],
      undiscovered_enabled: true
    });
    expect(on.status).toBe(200);
  });

  it("checks stored exclusions when only Undiscovered themes are turned off", async () => {
    await registerAndLogin();
    // Seeded directly: whether the API accepts this list depends on the released themes.
    await db.pool.query(
      `UPDATE app_user
       SET random_excluded_brands = ARRAY['refined-gold']
       WHERE username = 'brandfan'`
    );

    const res = await patch({ undiscovered_enabled: false });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toContain("undiscovered_enabled");
    const me = await api.get("/auth/me");
    expect(me.body.user.appearance.undiscovered_enabled).toBe(true);

    // With a theme left selected, turning Undiscovered off is fine.
    await patch({ random_excluded_brands: [] });
    expect((await patch({ undiscovered_enabled: false })).status).toBe(200);
  });

  it("counts discoveries in the same request toward the floor", async () => {
    await registerAndLogin();
    await patch({ undiscovered_enabled: false });
    const res = await patch({
      random_excluded_brands: ["refined-gold"],
      add_discovered_brands: ["noir"]
    });
    expect(res.status).toBe(200);
    expect(res.body.preferences.appearance.random_excluded_brands).toEqual([
      "refined-gold"
    ]);
  });

  it("rejects malformed appearance values", async () => {
    await registerAndLogin();
    const bad = [
      { mode_preference: "sepia" },
      { single_mode_policy: "both" },
      { undiscovered_enabled: "yes" },
      { random_excluded_brands: ["gold"] },
      { add_discovered_brands: "noir" },
      { daily_draw: { day: today(), brand: "noir", rounds: { ceremony: [] } } },
      {
        daily_draw: {
          day: today(),
          brand: "noir",
          rounds: { ceremony: [], cinema: [], extra: [] }
        }
      }
    ];
    for (const body of bad) {
      const res = await patch(body);
      expect(res.status).toBe(400);
    }
  });
});
