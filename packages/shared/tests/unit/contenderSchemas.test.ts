import { describe, expect, it } from "vitest";
import {
  contenderFilmParam,
  contenderSearchQuery,
  contenderSelectionBody,
  normalizeContenderQuery
} from "../../src/schemas/index.js";

describe("contender schemas", () => {
  it("normalises case and whitespace", () => {
    expect(normalizeContenderQuery("  The   GODFATHER\t")).toBe("the godfather");
    expect(normalizeContenderQuery("Amélie")).toBe("amélie");
  });

  it("search query is normalised and must be 2 to 100 characters", () => {
    expect(contenderSearchQuery.parse({ q: "  Dune  Part " })).toEqual({
      q: "dune part"
    });
    expect(contenderSearchQuery.parse({ q: "up" })).toEqual({ q: "up" });
    expect(contenderSearchQuery.parse({ q: "x".repeat(100) }).q).toHaveLength(100);

    const message = (q: unknown) =>
      contenderSearchQuery.safeParse({ q }).error?.issues[0]?.message;
    expect(message(" a ")).toBe("Type at least 2 characters to search");
    expect(message(undefined)).toBe("Type at least 2 characters to search");
    expect(message(["ab", "cd"])).toBe("Type at least 2 characters to search");
    expect(message("x".repeat(101))).toBe("Search must be 100 characters or fewer");
  });

  it("film param takes a positive TMDB id", () => {
    expect(contenderFilmParam.parse({ tmdbId: "603" })).toEqual({ tmdbId: 603 });
    expect(contenderFilmParam.safeParse({ tmdbId: "0" }).success).toBe(false);
    expect(contenderFilmParam.safeParse({ tmdbId: "abc" }).success).toBe(false);
  });

  it("selection body takes ids as numbers or strings; the person is optional", () => {
    expect(
      contenderSelectionBody.parse({ circuit_category_id: "4", film_tmdb_id: 238 })
    ).toEqual({ circuit_category_id: 4, film_tmdb_id: 238, person_tmdb_id: null });
    expect(
      contenderSelectionBody.parse({
        circuit_category_id: 4,
        film_tmdb_id: 238,
        person_tmdb_id: "3084"
      })
    ).toEqual({ circuit_category_id: 4, film_tmdb_id: 238, person_tmdb_id: 3084 });
    expect(
      contenderSelectionBody.parse({
        circuit_category_id: 4,
        film_tmdb_id: 238,
        person_tmdb_id: null
      }).person_tmdb_id
    ).toBeNull();
    const message = (body: unknown) =>
      contenderSelectionBody.safeParse(body).error?.issues[0]?.message;
    expect(message({ film_tmdb_id: 238 })).toBe("Choose a category");
    expect(message({ circuit_category_id: 4, film_tmdb_id: 0 })).toBe("Choose a film");
    expect(
      message({ circuit_category_id: 4, film_tmdb_id: 238, person_tmdb_id: -1 })
    ).toBe("Choose a person");
  });

  it("selection body takes an optional season to report the owner in", () => {
    expect(
      contenderSelectionBody.parse({
        circuit_category_id: 4,
        film_tmdb_id: 238,
        circuit_league_id: "12"
      })
    ).toEqual({
      circuit_category_id: 4,
      film_tmdb_id: 238,
      person_tmdb_id: null,
      circuit_league_id: 12
    });
    expect(
      contenderSelectionBody.safeParse({
        circuit_category_id: 4,
        film_tmdb_id: 238,
        circuit_league_id: 0
      }).error?.issues[0]?.message
    ).toBe("Choose a season");
  });
});
