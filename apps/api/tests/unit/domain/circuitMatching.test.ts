import { describe, expect, it } from "vitest";
import {
  canonicalFilmTmdbId,
  matchOccasion,
  type MatchFilm,
  type MatchNomination,
  type MatchOccasionInput,
  type MatchSelection
} from "../../../src/domain/circuitMatching.js";

// Circuit categories
const BEST_PICTURE = 1;
const BEST_ACTOR = 2;

// Category editions of one Globes ceremony
const DRAMA = 101;
const COMEDY = 102;
const ACTOR_DRAMA = 103;
const ACTOR_COMEDY = 104;
const SCREENPLAY = 105; // not mapped

const films: MatchFilm[] = [
  { id: 10, tmdb_id: 500, consolidated_into_film_id: null },
  { id: 11, tmdb_id: 501, consolidated_into_film_id: null },
  // A duplicate row merged into film 10, and a duplicate of the duplicate.
  { id: 12, tmdb_id: 999, consolidated_into_film_id: 10 },
  { id: 13, tmdb_id: null, consolidated_into_film_id: 12 }
];

function nomination(
  id: number,
  category_edition_id: number,
  film_id: number | null,
  extra: Partial<MatchNomination> = {}
): MatchNomination {
  return {
    id,
    category_edition_id,
    film_id,
    status: "ACTIVE",
    person_tmdb_ids: [],
    ...extra
  };
}

function filmSelection(
  id: number,
  film_tmdb_id: number,
  circuit_category_id = BEST_PICTURE
) {
  return {
    id,
    circuit_category_id,
    kind: "FILM",
    film_tmdb_id,
    person_tmdb_id: null
  } satisfies MatchSelection;
}

function actingSelection(
  id: number,
  film_tmdb_id: number,
  person_tmdb_id: number | null
) {
  return {
    id,
    circuit_category_id: BEST_ACTOR,
    kind: "ACTING",
    film_tmdb_id,
    person_tmdb_id
  } satisfies MatchSelection;
}

const mappings = [
  { category_edition_id: DRAMA, circuit_category_id: BEST_PICTURE },
  { category_edition_id: COMEDY, circuit_category_id: BEST_PICTURE },
  { category_edition_id: ACTOR_DRAMA, circuit_category_id: BEST_ACTOR },
  { category_edition_id: ACTOR_COMEDY, circuit_category_id: BEST_ACTOR }
];

function occasion(overrides: Partial<MatchOccasionInput>): MatchOccasionInput {
  return {
    kind: "NOMINATION",
    mappings,
    nominations: [],
    films,
    selections: [],
    ...overrides
  };
}

describe("canonicalFilmTmdbId", () => {
  const byId = new Map(films.map((f) => [f.id, f]));

  it("returns the film's own TMDB id when it is not consolidated", () => {
    expect(canonicalFilmTmdbId(11, byId)).toBe(501);
  });

  it("follows consolidation to the surviving film", () => {
    expect(canonicalFilmTmdbId(12, byId)).toBe(500);
    expect(canonicalFilmTmdbId(13, byId)).toBe(500);
  });

  it("returns null for an unknown film or a consolidation loop", () => {
    expect(canonicalFilmTmdbId(404, byId)).toBeNull();
    const loop = new Map<number, MatchFilm>([
      [1, { id: 1, tmdb_id: 1, consolidated_into_film_id: 2 }],
      [2, { id: 2, tmdb_id: 2, consolidated_into_film_id: 1 }]
    ]);
    expect(canonicalFilmTmdbId(1, loop)).toBeNull();
  });
});

describe("matchOccasion", () => {
  it("matches a nomination in a mapped edition", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, DRAMA, 10)],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([{ selection_id: 7, nomination_ids: [1] }]);
  });

  it("ignores nominations in unmapped editions", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, SCREENPLAY, 10)],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([]);
  });

  it("ignores a mapping to another Circuit category", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, DRAMA, 10)],
        selections: [filmSelection(7, 500, BEST_ACTOR)]
      })
    );
    expect(result).toEqual([]);
  });

  it("scores a film once when Drama and Comedy both map to Best Picture", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(2, COMEDY, 10), nomination(1, DRAMA, 10)],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([{ selection_id: 7, nomination_ids: [1, 2] }]);
  });

  it("gives each mapped category's winner its own win", () => {
    const result = matchOccasion(
      occasion({
        kind: "WIN",
        nominations: [
          nomination(1, DRAMA, 10),
          nomination(2, COMEDY, 11),
          nomination(3, DRAMA, 11)
        ],
        winner_nomination_ids: [1, 2],
        selections: [filmSelection(7, 500), filmSelection(8, 501)]
      })
    );
    expect(result).toEqual([
      { selection_id: 7, nomination_ids: [1] },
      { selection_id: 8, nomination_ids: [2] }
    ]);
  });

  it("only counts winning nominations for a win", () => {
    const result = matchOccasion(
      occasion({
        kind: "WIN",
        nominations: [nomination(1, DRAMA, 10)],
        winner_nomination_ids: [],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([]);
  });

  it("matches a nomination of a consolidated film by the surviving film's TMDB id", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, DRAMA, 13)],
        selections: [filmSelection(7, 500), filmSelection(8, 999)]
      })
    );
    expect(result).toEqual([{ selection_id: 7, nomination_ids: [1] }]);
  });

  it("ignores revoked and replaced nominations", () => {
    const result = matchOccasion(
      occasion({
        kind: "WIN",
        nominations: [
          nomination(1, DRAMA, 10, { status: "REVOKED" }),
          nomination(2, COMEDY, 10, { status: "REPLACED" })
        ],
        winner_nomination_ids: [1, 2],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([]);
  });

  it("needs both the film and the person for an acting selection", () => {
    const result = matchOccasion(
      occasion({
        nominations: [
          nomination(1, ACTOR_DRAMA, 10, { person_tmdb_ids: [3084] }),
          nomination(2, ACTOR_COMEDY, 11, { person_tmdb_ids: [1158] })
        ],
        selections: [
          actingSelection(7, 500, 3084), // film and person match
          actingSelection(8, 500, 1158), // person nominated, but for another film
          actingSelection(9, 501, 3084), // film nominated, but not this person
          actingSelection(10, 500, null) // no person: never matches
        ]
      })
    );
    expect(result).toEqual([{ selection_id: 7, nomination_ids: [1] }]);
  });

  it("does not match a film-only selection through an acting category", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, ACTOR_DRAMA, 10, { person_tmdb_ids: [3084] })],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([]);
  });

  it("ignores nominations without a film", () => {
    const result = matchOccasion(
      occasion({
        nominations: [nomination(1, DRAMA, null)],
        selections: [filmSelection(7, 500)]
      })
    );
    expect(result).toEqual([]);
  });
});
