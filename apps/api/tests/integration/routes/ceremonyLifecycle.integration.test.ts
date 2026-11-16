import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../../src/server.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import {
  insertCategoryEdition,
  insertCeremony,
  insertCeremonyWinner,
  insertLeague,
  insertNomination,
  insertSeason,
  insertUser
} from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;
let token: string;

const AUTH_SECRET = "test-secret";
const OTHER_STATUSES = ["DRAFT", "PUBLISHED", "LOCKED", "ARCHIVED"] as const;

type ErrorBody = { error: { code: string; details?: { status?: string } } };

async function send<T>(
  method: "post" | "patch" | "delete",
  path: string,
  body: Record<string, unknown> = {}
): Promise<{ status: number; json: T }> {
  const res = await api[method](path)
    .set({ "content-type": "application/json", Authorization: `Bearer ${token}` })
    .send(body);
  return { status: res.status, json: res.body as T };
}

async function ceremonyWithStatus(status: string) {
  const ceremony = await insertCeremony(db.pool, {}, false);
  await db.pool.query(`UPDATE ceremony SET status = $2 WHERE id = $1`, [
    ceremony.id,
    status
  ]);
  return ceremony;
}

// LOCKED and ARCHIVED keep their more specific refusal from before the lifecycle change.
function expectedLeagueRefusal(status: string, route: "season" | "draft") {
  if (status === "LOCKED") return "CEREMONY_LOCKED";
  if (status === "ARCHIVED" && route === "draft") return "CEREMONY_LOCKED";
  return "CEREMONY_NOT_ACTIVE";
}

describe("ceremony lifecycle guards", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3121";
    process.env.AUTH_SECRET = AUTH_SECRET;
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
    const user = await insertUser(db.pool, { id: 1 });
    await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = 1`);
    token = signTestToken({ sub: "1", username: user.username }, AUTH_SECRET);
  });

  describe("season creation", () => {
    async function createLeague() {
      const res = await send<{ league: { id: number } }>("post", "/leagues", {
        name: "Lifecycle League"
      });
      expect(res.status).toBe(201);
      return res.json.league.id;
    }

    it.each([["/seasons/leagues/:id/seasons"], ["/leagues/:id/seasons"]])(
      "%s succeeds for an ACTIVE ceremony",
      async (route) => {
        const ceremony = await ceremonyWithStatus("ACTIVE");
        const leagueId = await createLeague();
        const res = await send<{ season: { ceremony_id: number } }>(
          "post",
          route.replace(":id", String(leagueId)),
          { ceremony_id: ceremony.id }
        );
        expect(res.status).toBe(201);
        expect(res.json.season.ceremony_id).toBe(ceremony.id);
      }
    );

    it.each(
      OTHER_STATUSES.flatMap((status) => [
        ["/seasons/leagues/:id/seasons", status],
        ["/leagues/:id/seasons", status]
      ])
    )("%s is refused for a %s ceremony", async (route, status) => {
      const ceremony = await ceremonyWithStatus(status);
      const leagueId = await createLeague();
      const res = await send<ErrorBody>("post", route.replace(":id", String(leagueId)), {
        ceremony_id: ceremony.id
      });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe(expectedLeagueRefusal(status, "season"));
    });
  });

  describe("draft creation", () => {
    async function seasonOn(status: string) {
      const ceremony = await ceremonyWithStatus(status);
      const league = await insertLeague(db.pool, {
        ceremony_id: ceremony.id,
        created_by_user_id: 1
      });
      return insertSeason(db.pool, { league_id: league.id, ceremony_id: ceremony.id });
    }

    it("succeeds for an ACTIVE ceremony", async () => {
      const season = await seasonOn("ACTIVE");
      const res = await send<{ draft: { status: string } }>("post", "/drafts", {
        league_id: season.league_id,
        season_id: season.id,
        draft_order_type: "SNAKE"
      });
      expect(res.status).toBe(201);
      expect(res.json.draft.status).toBe("PENDING");
    });

    it.each(OTHER_STATUSES)("is refused for a %s ceremony", async (status) => {
      const season = await seasonOn(status);
      const res = await send<ErrorBody>("post", "/drafts", {
        league_id: season.league_id,
        season_id: season.id,
        draft_order_type: "SNAKE"
      });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe(expectedLeagueRefusal(status, "draft"));
    });
  });

  describe("content edits", () => {
    const cases = [
      ["DRAFT", true],
      ["PUBLISHED", true],
      ["ACTIVE", false],
      ["LOCKED", false],
      ["ARCHIVED", false]
    ] as const;

    it.each(cases)("category edit in %s allowed: %s", async (status, allowed) => {
      const ceremony = await ceremonyWithStatus(status);
      const category = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      const res = await send<ErrorBody>(
        "patch",
        `/admin/category-editions/${category.id}`,
        {
          sort_index: 7
        }
      );
      if (allowed) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(409);
        expect(res.json.error.code).toBe("CEREMONY_CONTENT_LOCKED");
        expect(res.json.error.details?.status).toBe(status);
      }
    });

    it.each(cases)("nomination delete in %s allowed: %s", async (status, allowed) => {
      const ceremony = await ceremonyWithStatus(status);
      const category = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      const nomination = await insertNomination(db.pool, {
        category_edition_id: category.id,
        ceremony_id: ceremony.id
      });
      const res = await send<ErrorBody>("delete", `/admin/nominations/${nomination.id}`);
      if (allowed) {
        expect(res.status).toBe(200);
      } else {
        expect(res.status).toBe(409);
        expect(res.json.error.code).toBe("CEREMONY_CONTENT_LOCKED");
      }
    });
  });

  describe("publish and open for leagues", () => {
    type OpenRefusal = {
      error: {
        code: string;
        message: string;
        details?: { incomplete_categories?: Array<{ id: number; name: string }> };
      };
    };

    it("publishes a ceremony with dates and no categories or nominees", async () => {
      const ceremony = await insertCeremony(db.pool, {}, false);
      const res = await send<{ ceremony: { status: string; starts_at: string } }>(
        "post",
        `/admin/ceremonies/${ceremony.id}/publish`
      );
      expect(res.status).toBe(200);
      expect(res.json.ceremony.status).toBe("PUBLISHED");
      expect(res.json.ceremony.starts_at).toEqual(expect.any(String));
    });

    it("refuses to open with incomplete nominees and lists the categories", async () => {
      const ceremony = await ceremonyWithStatus("PUBLISHED");
      const filled = await insertCategoryEdition(db.pool, {
        ceremony_id: ceremony.id,
        name: "Best Picture"
      });
      await insertNomination(db.pool, {
        category_edition_id: filled.id,
        ceremony_id: ceremony.id
      });
      const empty = await insertCategoryEdition(db.pool, {
        ceremony_id: ceremony.id,
        name: "Best Sound"
      });

      const res = await send<OpenRefusal>(
        "post",
        `/admin/ceremonies/${ceremony.id}/open`
      );
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("CEREMONY_INCOMPLETE");
      expect(res.json.error.details?.incomplete_categories).toEqual([
        { id: empty.id, name: "Best Sound" }
      ]);
      expect(res.json.error.message).toContain("Best Sound");

      const { rows } = await db.pool.query(`SELECT status FROM ceremony WHERE id = $1`, [
        ceremony.id
      ]);
      expect(rows[0].status).toBe("PUBLISHED");
    });

    it("refuses to open a ceremony with no categories", async () => {
      const ceremony = await ceremonyWithStatus("PUBLISHED");
      const res = await send<OpenRefusal>(
        "post",
        `/admin/ceremonies/${ceremony.id}/open`
      );
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("CEREMONY_INCOMPLETE");
    });

    it("opens a populated published ceremony for leagues", async () => {
      const ceremony = await ceremonyWithStatus("PUBLISHED");
      const category = await insertCategoryEdition(db.pool, { ceremony_id: ceremony.id });
      await insertNomination(db.pool, {
        category_edition_id: category.id,
        ceremony_id: ceremony.id
      });

      const res = await send<{ ceremony: { status: string } }>(
        "post",
        `/admin/ceremonies/${ceremony.id}/open`
      );
      expect(res.status).toBe(200);
      expect(res.json.ceremony.status).toBe("ACTIVE");

      const { rows } = await db.pool.query(
        `SELECT action FROM admin_audit_log WHERE target_id = $1`,
        [ceremony.id]
      );
      expect(rows.map((r) => r.action)).toContain("open_ceremony");
    });

    it.each(["DRAFT", "ACTIVE", "LOCKED", "ARCHIVED"])(
      "refuses to open a %s ceremony",
      async (status) => {
        const ceremony = await ceremonyWithStatus(status);
        const res = await send<ErrorBody>(
          "post",
          `/admin/ceremonies/${ceremony.id}/open`
        );
        expect(res.status).toBe(409);
        expect(res.json.error.code).toBe("CEREMONY_NOT_PUBLISHED");
        expect(res.json.error.details?.status).toBe(status);
      }
    );
  });

  describe("finalize and archive", () => {
    it("finalizing keeps LOCKED and sets results_finalized_at once", async () => {
      const ceremony = await ceremonyWithStatus("LOCKED");
      await insertCeremonyWinner(db.pool, { ceremony_id: ceremony.id });

      const res = await send<{
        ceremony: { status: string; results_finalized_at: string | null };
      }>("post", `/admin/ceremonies/${ceremony.id}/finalize-winners`);
      expect(res.status).toBe(200);
      expect(res.json.ceremony.status).toBe("LOCKED");
      expect(res.json.ceremony.results_finalized_at).toEqual(expect.any(String));

      const { rows } = await db.pool.query(
        `SELECT status, results_finalized_at FROM ceremony WHERE id = $1`,
        [ceremony.id]
      );
      expect(rows[0].status).toBe("LOCKED");
      expect(rows[0].results_finalized_at).toBeInstanceOf(Date);

      const again = await send<ErrorBody>(
        "post",
        `/admin/ceremonies/${ceremony.id}/finalize-winners`
      );
      expect(again.status).toBe(409);
      expect(again.json.error.code).toBe("CEREMONY_RESULTS_FINALIZED");
    });

    it("refuses winner changes after finalizing", async () => {
      const ceremony = await ceremonyWithStatus("LOCKED");
      const winner = await insertCeremonyWinner(db.pool, { ceremony_id: ceremony.id });
      await db.pool.query(
        `UPDATE ceremony SET results_finalized_at = now() WHERE id = $1`,
        [ceremony.id]
      );
      const res = await send<ErrorBody>("post", "/admin/winners", {
        category_edition_id: winner.category_edition_id,
        nomination_ids: [winner.nomination_id]
      });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("CEREMONY_RESULTS_FINALIZED");
    });

    it("refuses to archive before results are finalized", async () => {
      const ceremony = await ceremonyWithStatus("LOCKED");
      const res = await send<ErrorBody>(
        "post",
        `/admin/ceremonies/${ceremony.id}/archive`
      );
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("CEREMONY_RESULTS_NOT_FINALIZED");
    });

    it("archives once results are finalized", async () => {
      const ceremony = await ceremonyWithStatus("LOCKED");
      await db.pool.query(
        `UPDATE ceremony SET results_finalized_at = now() WHERE id = $1`,
        [ceremony.id]
      );
      const res = await send<{ ceremony: { status: string } }>(
        "post",
        `/admin/ceremonies/${ceremony.id}/archive`
      );
      expect(res.status).toBe(200);
      expect(res.json.ceremony.status).toBe("ARCHIVED");
    });
  });
});
