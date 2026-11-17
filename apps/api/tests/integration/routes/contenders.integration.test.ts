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
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertLeague, insertLeagueMember, insertUser } from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { resetAllCaches } from "../../../src/utils/ttlCache.js";
import { CONTENDER_RATE_LIMITS } from "../../../src/routes/contenders.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";
const UPSTREAM_TEXT = "upstream-diagnostic-text";

type Handler = (url: URL) => Response | Promise<Response>;

// Stub TMDB: the image configuration always answers; everything else goes to `handler`.
const fetchMock = vi.fn<typeof fetch>();
let handler: Handler;

function upstreamCalls(pathname: string): number {
  return fetchMock.mock.calls.filter(
    ([url]) => new URL(String(url)).pathname === `/3${pathname}`
  ).length;
}

const searchResults = [
  {
    id: 238,
    title: "The Godfather",
    original_title: "The Godfather",
    release_date: "1972-03-14",
    poster_path: "/godfather.jpg",
    overview: "x"
  },
  { id: 9999001, title: "The Godfather Part IV", release_date: "", poster_path: null }
];

const movieWithCredits = {
  id: 238,
  title: "The Godfather",
  release_date: "1972-03-14",
  poster_path: "/godfather.jpg",
  credits: {
    cast: [{ id: 3084, name: "Marlon Brando", character: "Vito", order: 0 }],
    crew: [
      { id: 1776, name: "Francis Ford Coppola", department: "Directing", job: "Director" }
    ]
  }
};

function tokenFor(user: { id: number; username: string }, isAdmin = false) {
  return signTestToken(
    {
      sub: String(user.id),
      username: user.username,
      ...(isAdmin ? { is_admin: true } : {})
    },
    AUTH_SECRET
  );
}

async function memberToken() {
  const user = await insertUser(db.pool);
  const league = await insertLeague(db.pool, { created_by_user_id: user.id });
  await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
  return tokenFor(user);
}

function search(token: string | null, q: string) {
  const req = api.get("/contenders/films/search").query({ q });
  return token ? req.set({ Authorization: `Bearer ${token}` }) : req;
}

function credits(token: string, tmdbId: number | string) {
  return api
    .get(`/contenders/films/${tmdbId}/credits`)
    .set({ Authorization: `Bearer ${token}` });
}

describe("contender search", () => {
  beforeAll(async () => {
    process.env.PORT = process.env.PORT ?? "3123";
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
    resetAllCaches();
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
    handler = (url) => {
      if (url.pathname === "/3/search/movie")
        return Response.json({ results: searchResults });
      if (url.pathname === "/3/movie/238") return Response.json(movieWithCredits);
      return new Response(UPSTREAM_TEXT, { status: 404 });
    };
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/3/configuration") {
        return Response.json({
          images: {
            secure_base_url: "https://image.tmdb.org/t/p/",
            poster_sizes: ["w185", "w500"],
            profile_sizes: ["w185"]
          }
        });
      }
      return handler(url);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("access", () => {
    it("requires sign-in", async () => {
      expect((await search(null, "godfather")).status).toBe(401);
    });

    it("refuses a signed-in user outside every league", async () => {
      const token = tokenFor(await insertUser(db.pool));
      const res = await search(token, "godfather");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(upstreamCalls("/search/movie")).toBe(0);
    });

    it("lets an operator search without a league", async () => {
      const user = await insertUser(db.pool);
      await db.pool.query(`UPDATE app_user SET is_admin = TRUE WHERE id = $1`, [user.id]);
      const token = tokenFor(user, true);
      expect((await search(token, "godfather")).status).toBe(200);
    });
  });

  describe("search", () => {
    it("returns films with no per-result enrichment, old and unreleased alike", async () => {
      const token = await memberToken();
      const res = await search(token, "  The  Godfather ");
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([
        {
          tmdb_id: 238,
          title: "The Godfather",
          original_title: "The Godfather",
          release_date: "1972-03-14",
          release_year: 1972,
          poster_url: "https://image.tmdb.org/t/p/w185/godfather.jpg"
        },
        {
          tmdb_id: 9999001,
          title: "The Godfather Part IV",
          original_title: null,
          release_date: null,
          release_year: null,
          poster_url: null
        }
      ]);
      const searchCall = fetchMock.mock.calls
        .map(([url]) => new URL(String(url)))
        .find((url) => url.pathname === "/3/search/movie");
      expect(searchCall?.searchParams.get("query")).toBe("the godfather");
      expect(searchCall?.searchParams.get("include_adult")).toBe("false");
      expect(upstreamCalls("/movie/238")).toBe(0);
    });

    it("makes one upstream call for repeated queries that normalise alike", async () => {
      const token = await memberToken();
      for (const q of ["godfather", "Godfather", "  GODFATHER  "]) {
        expect((await search(token, q)).status).toBe(200);
      }
      expect(upstreamCalls("/search/movie")).toBe(1);
      expect((await search(token, "alien")).status).toBe(200);
      expect(upstreamCalls("/search/movie")).toBe(2);
    });

    it("validates the query length after trimming", async () => {
      const token = await memberToken();
      for (const q of [" a ", "x".repeat(101)]) {
        const res = await search(token, q);
        expect(res.status).toBe(400);
        expect(res.body.error.details.fields).toEqual(["q"]);
      }
      expect(upstreamCalls("/search/movie")).toBe(0);
    });

    it("returns 429 once a user passes the per-user limit", async () => {
      const token = await memberToken();
      for (let i = 0; i < CONTENDER_RATE_LIMITS.perUser; i += 1) {
        expect((await search(token, "godfather")).status).toBe(200);
      }
      const res = await search(token, "godfather");
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe("RATE_LIMITED");
      // Another user from the same address still gets through.
      expect((await search(await memberToken(), "godfather")).status).toBe(200);
    });

    it("returns 429 once an address passes the per-IP limit", async () => {
      for (let i = 0; i < CONTENDER_RATE_LIMITS.perIp; i += 1) {
        expect((await search(null, "godfather")).status).toBe(401);
      }
      expect((await search(null, "godfather")).status).toBe(429);
    });

    it("maps a TMDB error to 502 without upstream text and does not cache it", async () => {
      const token = await memberToken();
      handler = () => new Response(UPSTREAM_TEXT, { status: 500 });
      const res = await search(token, "godfather");
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe("TMDB_UPSTREAM_ERROR");
      expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_TEXT);

      handler = () => Response.json({ results: searchResults });
      expect((await search(token, "godfather")).status).toBe(200);
    });

    it("maps a TMDB timeout or outage to 503 without upstream text", async () => {
      const token = await memberToken();
      handler = () => {
        throw new DOMException(UPSTREAM_TEXT, "TimeoutError");
      };
      const timedOut = await search(token, "godfather");
      expect(timedOut.status).toBe(503);
      expect(timedOut.body.error.code).toBe("TMDB_UNAVAILABLE");
      expect(JSON.stringify(timedOut.body)).not.toContain(UPSTREAM_TEXT);

      handler = () => new Response(UPSTREAM_TEXT, { status: 503 });
      const down = await search(token, "alien");
      expect(down.status).toBe(503);
      expect(JSON.stringify(down.body)).not.toContain(UPSTREAM_TEXT);
    });
  });

  describe("credits", () => {
    it("returns cast and crew and caches them", async () => {
      const token = await memberToken();
      const res = await credits(token, 238);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        film: {
          tmdb_id: 238,
          title: "The Godfather",
          release_date: "1972-03-14",
          release_year: 1972,
          poster_url: "https://image.tmdb.org/t/p/w185/godfather.jpg"
        },
        cast: [
          {
            tmdb_id: 3084,
            name: "Marlon Brando",
            character: "Vito",
            order: 0,
            profile_url: null
          }
        ],
        crew: [
          {
            tmdb_id: 1776,
            name: "Francis Ford Coppola",
            department: "Directing",
            job: "Director",
            profile_url: null
          }
        ]
      });
      expect((await credits(token, 238)).status).toBe(200);
      expect(upstreamCalls("/movie/238")).toBe(1);
    });

    it("rejects a bad id and reports an unknown film as not found", async () => {
      const token = await memberToken();
      expect((await credits(token, "abc")).status).toBe(400);
      const res = await credits(token, 404404);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_TEXT);
    });

    it("returns 429 once a user passes the per-user limit", async () => {
      const token = await memberToken();
      for (let i = 0; i < CONTENDER_RATE_LIMITS.perUser; i += 1) {
        expect((await credits(token, 238)).status).toBe(200);
      }
      expect((await credits(token, 238)).status).toBe(429);
    });

    it("maps a TMDB error to 502 without upstream text", async () => {
      const token = await memberToken();
      handler = () => new Response(UPSTREAM_TEXT, { status: 500 });
      const res = await credits(token, 238);
      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_TEXT);
    });
  });
});
