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
import * as selectionRepository from "../../../src/data/repositories/circuitSelectionRepository.js";
import { startTestDatabase, truncateAllTables } from "../../db.js";
import { insertLeague, insertLeagueMember, insertUser } from "../../factories/db.js";
import { createApiAgent, type ApiAgent } from "../../support/supertest.js";
import { signTestToken } from "../../support/session.js";
import { resetAllRateLimiters } from "../../../src/utils/rateLimiter.js";
import { resetAllCaches } from "../../../src/utils/ttlCache.js";

let db: Awaited<ReturnType<typeof startTestDatabase>>;
let api: ApiAgent;

const AUTH_SECRET = "test-secret";
const UPSTREAM_TEXT = "upstream-diagnostic-text";

// TMDB people
const BRANDO = 3084;
const PACINO = 1158;
const COPPOLA = 1776; // crew only
const STRANGER = 4242; // in no credits

const movies: Record<number, object> = {
  238: {
    id: 238,
    title: "The Godfather",
    release_date: "1972-03-14",
    poster_path: "/godfather.jpg",
    credits: {
      cast: [
        {
          id: BRANDO,
          name: "Marlon Brando",
          character: "Vito",
          order: 0,
          credit_id: "c1"
        },
        { id: PACINO, name: "Al Pacino", character: "Michael", order: 1, credit_id: "c2" }
      ],
      crew: [
        {
          id: COPPOLA,
          name: "Francis Ford Coppola",
          department: "Directing",
          job: "Director",
          credit_id: "c3"
        }
      ]
    }
  },
  9999001: {
    id: 9999001,
    title: "Untitled Future Film",
    release_date: "",
    poster_path: null,
    credits: {
      cast: [
        { id: 5000, name: "Future Star", character: "Lead", order: 0, credit_id: "c4" }
      ],
      crew: []
    }
  }
};

const fetchMock = vi.fn<typeof fetch>();
let tmdbDown = false;

function upstreamCalls(pathname: string): number {
  return fetchMock.mock.calls.filter(
    ([url]) => new URL(String(url)).pathname === `/3${pathname}`
  ).length;
}

function tokenFor(user: { id: number; username: string }) {
  return signTestToken({ sub: String(user.id), username: user.username }, AUTH_SECRET);
}

async function memberToken() {
  const user = await insertUser(db.pool);
  const league = await insertLeague(db.pool, { created_by_user_id: user.id });
  await insertLeagueMember(db.pool, { league_id: league.id, user_id: user.id });
  return tokenFor(user);
}

async function insertCircuit(status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit (code, name, status, activated_at)
     VALUES ('c-' || floor(random() * 1e9)::text, 'Circuit', $1,
       CASE WHEN $1 = 'DRAFT' THEN NULL ELSE now() END)
     RETURNING id::int`,
    [status]
  );
  return rows[0]!.id;
}

async function insertCategory(circuitId: number, kind: "FILM" | "ACTING", code: string) {
  const { rows } = await db.pool.query<{ id: number }>(
    `INSERT INTO circuit_category (circuit_id, code, name, kind, sort_index)
     VALUES ($1, $2, $2, $3, 0) RETURNING id::int`,
    [circuitId, code, kind]
  );
  return rows[0]!.id;
}

function upsert(
  token: string | null,
  body: { circuit_category_id: number; film_tmdb_id: number; person_tmdb_id?: number }
) {
  const req = api.post("/contenders/selections").send(body);
  return token ? req.set({ Authorization: `Bearer ${token}` }) : req;
}

async function selectionCount() {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM circuit_selection`
  );
  return rows[0]!.n;
}

describe("circuit selections", () => {
  let token: string;
  let picture: number;
  let actor: number;
  let supporting: number;

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
    tmdbDown = false;
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/3/configuration") {
        return Response.json({
          images: {
            secure_base_url: "https://image.tmdb.org/t/p/",
            poster_sizes: ["w500"],
            profile_sizes: ["w185"]
          }
        });
      }
      if (tmdbDown) return new Response(UPSTREAM_TEXT, { status: 503 });
      const match = /^\/3\/movie\/(\d+)$/.exec(url.pathname);
      const movie = match ? movies[Number(match[1])] : undefined;
      return movie ? Response.json(movie) : new Response(UPSTREAM_TEXT, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    token = await memberToken();
    const circuitId = await insertCircuit();
    picture = await insertCategory(circuitId, "FILM", "picture");
    actor = await insertCategory(circuitId, "ACTING", "actor");
    supporting = await insertCategory(circuitId, "ACTING", "supporting");
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("access", () => {
    it("requires sign-in", async () => {
      const res = await upsert(null, { circuit_category_id: picture, film_tmdb_id: 238 });
      expect(res.status).toBe(401);
    });

    it("refuses a signed-in user outside every league", async () => {
      const outsider = tokenFor(await insertUser(db.pool));
      const res = await upsert(outsider, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      expect(res.status).toBe(403);
      expect(await selectionCount()).toBe(0);
    });
  });

  describe("identity", () => {
    it("creates a film-only selection with the synced film", async () => {
      const res = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      expect(res.status).toBe(201);
      expect(res.body.selection).toMatchObject({
        circuit_category_id: picture,
        film_tmdb_id: 238,
        person_tmdb_id: null,
        film: { title: "The Godfather", release_year: 1972 },
        person: null
      });
    });

    it("returns the same row when an identity is upserted again, without TMDB", async () => {
      const first = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: BRANDO
      });
      expect(first.status).toBe(201);
      const callsAfterFirst = upstreamCalls("/movie/238");

      const again = await upsert(await memberToken(), {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: BRANDO
      });
      expect(again.status).toBe(200);
      expect(again.body.selection.id).toBe(first.body.selection.id);
      expect(again.body.selection.person).toMatchObject({ name: "Marlon Brando" });
      expect(upstreamCalls("/movie/238")).toBe(callsAfterFirst);
      expect(await selectionCount()).toBe(1);
    });

    it("keeps film-only and acting selections of one film apart", async () => {
      const film = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      const acting = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: BRANDO
      });
      expect([film.status, acting.status]).toEqual([201, 201]);
      expect(film.body.selection.id).not.toBe(acting.body.selection.id);
    });

    it("keeps two people from one film in one acting category apart", async () => {
      const brando = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: BRANDO
      });
      const pacino = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: PACINO
      });
      expect([brando.status, pacino.status]).toEqual([201, 201]);
      expect(brando.body.selection.id).not.toBe(pacino.body.selection.id);
    });

    it("keeps one person-film pair in two acting categories apart", async () => {
      const lead = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: PACINO
      });
      const support = await upsert(token, {
        circuit_category_id: supporting,
        film_tmdb_id: 238,
        person_tmdb_id: PACINO
      });
      expect([lead.status, support.status]).toEqual([201, 201]);
      expect(lead.body.selection.id).not.toBe(support.body.selection.id);
      expect(await selectionCount()).toBe(2);
    });

    it("accepts an old film and an unreleased film", async () => {
      const old = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      const unreleased = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 9999001
      });
      expect([old.status, unreleased.status]).toEqual([201, 201]);
      expect(unreleased.body.selection.film).toMatchObject({
        title: "Untitled Future Film",
        release_year: null
      });
    });
  });

  describe("acting validation", () => {
    it("refuses a person outside the film's credits", async () => {
      const res = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: STRANGER
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("PERSON_NOT_IN_CREDITS");
      expect(await selectionCount()).toBe(0);
    });

    it("accepts a person credited as crew, not cast", async () => {
      const res = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238,
        person_tmdb_id: COPPOLA
      });
      expect(res.status).toBe(201);
      expect(res.body.selection.person).toMatchObject({ name: "Francis Ford Coppola" });
    });

    it("needs a person for an acting category and refuses one for a film category", async () => {
      const noPerson = await upsert(token, {
        circuit_category_id: actor,
        film_tmdb_id: 238
      });
      expect(noPerson.status).toBe(400);
      expect(noPerson.body.error.details.fields).toEqual(["person_tmdb_id"]);

      const withPerson = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238,
        person_tmdb_id: BRANDO
      });
      expect(withPerson.status).toBe(400);
      expect(await selectionCount()).toBe(0);
    });
  });

  describe("errors", () => {
    it("hides categories of a draft circuit and refuses an archived one", async () => {
      const draft = await insertCategory(await insertCircuit("DRAFT"), "FILM", "picture");
      const archived = await insertCategory(
        await insertCircuit("ARCHIVED"),
        "FILM",
        "picture"
      );
      expect(
        (await upsert(token, { circuit_category_id: draft, film_tmdb_id: 238 })).status
      ).toBe(404);
      expect(
        (await upsert(token, { circuit_category_id: archived, film_tmdb_id: 238 })).status
      ).toBe(409);
      expect(
        (await upsert(token, { circuit_category_id: 999999, film_tmdb_id: 238 })).status
      ).toBe(404);
    });

    it("maps a TMDB outage to 503 without upstream text or a row", async () => {
      tmdbDown = true;
      const res = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_TEXT);
      expect(await selectionCount()).toBe(0);
    });

    it("returns 404 for an unknown TMDB film", async () => {
      const res = await upsert(token, { circuit_category_id: picture, film_tmdb_id: 77 });
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(UPSTREAM_TEXT);
    });

    it("has no update route", async () => {
      const created = await upsert(token, {
        circuit_category_id: picture,
        film_tmdb_id: 238
      });
      const id = created.body.selection.id;
      for (const method of ["put", "patch"] as const) {
        const res = await api[method](`/contenders/selections/${id}`)
          .set({ Authorization: `Bearer ${token}` })
          .send({ film_tmdb_id: 9999001 });
        expect(res.status).toBe(404);
      }
    });
  });

  describe("repository", () => {
    it("exposes no update function", () => {
      expect(Object.keys(selectionRepository).filter((k) => /update/i.test(k))).toEqual(
        []
      );
    });

    it("rejects an UPDATE of a stored selection", async () => {
      await upsert(token, { circuit_category_id: picture, film_tmdb_id: 238 });
      await expect(
        db.pool.query(`UPDATE circuit_selection SET film_tmdb_id = 9999001`)
      ).rejects.toThrow(/immutable/);
    });

    it("enforces the category kind and the identity in the database", async () => {
      await upsert(token, { circuit_category_id: picture, film_tmdb_id: 238 });
      const { rows } = await db.pool.query<{ film_id: number; person_id: number }>(
        `SELECT f.id::int AS film_id, p.id::int AS person_id
         FROM film f, person p WHERE f.tmdb_id = 238 AND p.tmdb_id = $1`,
        [BRANDO]
      );
      const { film_id, person_id } = rows[0]!;
      const insert = (
        category: number,
        personTmdbId: number | null,
        personId: number | null
      ) =>
        db.pool.query(
          `INSERT INTO circuit_selection
             (circuit_category_id, film_tmdb_id, person_tmdb_id, film_id, person_id)
           VALUES ($1, 238, $2, $3, $4)`,
          [category, personTmdbId, film_id, personId]
        );
      await expect(insert(picture, BRANDO, person_id)).rejects.toThrow(/FILM category/);
      await expect(insert(actor, null, null)).rejects.toThrow(/ACTING category/);
      await expect(insert(picture, null, null)).rejects.toThrow(/identity_key/);
      const inserted = await selectionRepository.insertCircuitSelection(db.pool, {
        circuit_category_id: picture,
        film_tmdb_id: 238,
        person_tmdb_id: null,
        film_id,
        person_id: null
      });
      expect(inserted.inserted).toBe(false);
    });
  });
});
