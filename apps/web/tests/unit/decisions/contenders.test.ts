import { describe, expect, it } from "vitest";
import {
  contenderErrorMessage,
  contenderFilmLabel,
  contenderPeople,
  contenderPickerStep,
  contenderSearchTerm,
  filterContenderPeople
} from "@/decisions/contenders";

const picture = { id: 1, name: "Best Picture", kind: "FILM" as const };
const actor = { id: 2, name: "Best Actor", kind: "ACTING" as const };
const film = {
  tmdb_id: 238,
  title: "The Godfather",
  release_year: 1972,
  poster_url: null
};
const person = { tmdb_id: 3084, name: "Marlon Brando", role: "Vito", profile_url: null };

describe("contenderPickerStep", () => {
  it("goes category, film, then confirm for a film category", () => {
    expect(contenderPickerStep({ category: null, film: null, person: null })).toBe(
      "category"
    );
    expect(contenderPickerStep({ category: picture, film: null, person: null })).toBe(
      "film"
    );
    expect(contenderPickerStep({ category: picture, film, person: null })).toBe(
      "confirm"
    );
  });

  it("asks for a person in an acting category", () => {
    expect(contenderPickerStep({ category: actor, film, person: null })).toBe("person");
    expect(contenderPickerStep({ category: actor, film, person })).toBe("confirm");
  });
});

describe("contenderSearchTerm", () => {
  it("normalises like the server and enforces 2 to 100 characters", () => {
    expect(contenderSearchTerm("  The  GODFATHER ")).toEqual({
      term: "the godfather",
      hint: null
    });
    expect(contenderSearchTerm("   ")).toEqual({ term: null, hint: null });
    expect(contenderSearchTerm(" a ")).toEqual({
      term: null,
      hint: "Type at least 2 characters to search"
    });
    expect(contenderSearchTerm("x".repeat(101))).toEqual({
      term: null,
      hint: "Search must be 100 characters or fewer"
    });
  });
});

describe("contenderPeople", () => {
  it("lists cast before crew and each person once", () => {
    const people = contenderPeople({
      cast: [
        { tmdb_id: 1, name: "A", character: "Lead", profile_url: null },
        { tmdb_id: 2, name: "B", character: "", profile_url: null }
      ],
      crew: [
        { tmdb_id: 3, name: "C", job: "Director", profile_url: null },
        { tmdb_id: 1, name: "A", job: "Producer", profile_url: null }
      ]
    });
    expect(people.map((p) => [p.tmdb_id, p.role])).toEqual([
      [1, "Lead"],
      [2, null],
      [3, "Director"]
    ]);
  });
});

describe("filterContenderPeople", () => {
  const people = [
    person,
    { tmdb_id: 1, name: "Zoë Saldaña", role: "Rita", profile_url: null },
    { tmdb_id: 2, name: "Someone", role: "Director", profile_url: null }
  ];

  it("matches name or role, ignoring case and accents", () => {
    expect(filterContenderPeople(people, "zoe").map((p) => p.tmdb_id)).toEqual([1]);
    expect(filterContenderPeople(people, "DIRECT").map((p) => p.tmdb_id)).toEqual([2]);
    expect(filterContenderPeople(people, "  ")).toHaveLength(3);
  });
});

describe("contenderFilmLabel", () => {
  it("adds the year when known", () => {
    expect(contenderFilmLabel(film)).toBe("The Godfather (1972)");
    expect(contenderFilmLabel({ title: "Untitled", release_year: null })).toBe(
      "Untitled"
    );
  });
});

describe("contenderErrorMessage", () => {
  it("explains limits, outages and refusals without upstream detail", () => {
    expect(contenderErrorMessage({ status: 429, errorCode: "RATE_LIMITED" })).toMatch(
      /Too many searches/
    );
    expect(contenderErrorMessage({ status: 503, errorCode: "TMDB_UNAVAILABLE" })).toMatch(
      /unavailable/
    );
    expect(
      contenderErrorMessage({ status: 502, errorCode: "TMDB_UPSTREAM_ERROR" })
    ).toMatch(/ran into a problem/);
    expect(contenderErrorMessage({ status: 403, errorCode: "FORBIDDEN" })).toBe(
      "Join a league to pick contenders."
    );
    expect(
      contenderErrorMessage({
        status: 422,
        errorCode: "PERSON_NOT_IN_CREDITS",
        error: "That person isn't in this film's credits"
      })
    ).toBe("That person isn't in this film's credits");
    expect(contenderErrorMessage({ status: 404, errorCode: "NOT_FOUND" })).toBe(
      "That category is not open for picks."
    );
  });
});
