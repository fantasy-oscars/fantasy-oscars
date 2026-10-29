import { describe, expect, it } from "vitest";
import {
  buildFilmDisplayRows,
  findInitialMergeConflict,
  groupFilmsByNormTitle,
  isRowChecked,
  isRowIndeterminate,
  pageGroupFilms,
  parseTmdbIdInput,
  planConflictResolution,
  resolveMergeConflictFromError,
  toggleRowSelection
} from "@/decisions/films/filmGroups";
import {
  matchFilmByTitle,
  pickPreferredFilmMatch
} from "@/decisions/admin/nomineeFilmMatch";
import {
  buildCategoryLabelById,
  formatCandidateImportMessage,
  reorderNominationsLocally
} from "@/decisions/admin/nomineeLists";

type Film = {
  id: number;
  title: string;
  release_year: number | null;
  tmdb_id: number | null;
  is_nominated: boolean;
  norm_title: string;
};

function film(id: number, over: Partial<Film> = {}): Film {
  return {
    id,
    title: `Film ${id}`,
    release_year: 2000,
    tmdb_id: null,
    is_nominated: false,
    norm_title: `film${id}`,
    ...over
  };
}

describe("film groups", () => {
  const films = [
    film(1, { norm_title: "a", tmdb_id: 10 }),
    film(2, { norm_title: "a" }),
    film(3, { norm_title: "b" })
  ];

  it("groups duplicates and honours decoupled films", () => {
    const grouped = groupFilmsByNormTitle(films);
    const rows = buildFilmDisplayRows(grouped, {});
    expect(rows.map((r) => r.type)).toEqual(["group", "film"]);
    const first = rows[0];
    expect(first.type === "group" && first.representative.id).toBe(1);

    const decoupled = buildFilmDisplayRows(grouped, { 2: true });
    expect(decoupled.map((r) => (r.type === "film" ? r.film.id : "g"))).toEqual([
      2, 1, 3
    ]);
  });

  it("tracks group selection state", () => {
    const rows = buildFilmDisplayRows(groupFilmsByNormTitle(films), {});
    const group = rows[0];
    let selected = toggleRowSelection({}, group, true);
    expect(isRowChecked(group, selected)).toBe(true);
    delete selected[2];
    expect(isRowChecked(group, selected)).toBe(false);
    expect(isRowIndeterminate(group, selected)).toBe(true);
    selected = toggleRowSelection(selected, group, false);
    expect(Object.keys(selected)).toEqual([]);
  });

  it("pages group films with clamping", () => {
    const many = Array.from({ length: 10 }, (_, i) => i);
    expect(pageGroupFilms(many, 99)).toMatchObject({ clampedPage: 2, pageCount: 2 });
    expect(pageGroupFilms(many, 0).pageFilms).toHaveLength(8);
  });

  it("plans merge conflicts", () => {
    const linked = [film(1, { tmdb_id: 5 }), film(2, { tmdb_id: 6 }), film(3)];
    expect(findInitialMergeConflict([film(1), film(2)])).toBeNull();
    const conflict = findInitialMergeConflict(linked);
    expect(conflict?.keepLinkedId).toBe("1");
    const plan = planConflictResolution(conflict!);
    expect(plan.toUnlink.map((f) => f.id)).toEqual([2]);
    expect(plan.nextSelected.find((f) => f.id === 2)?.tmdb_id).toBeNull();
    expect(plan.nextSelected.find((f) => f.id === 1)?.tmdb_id).toBe(5);

    const fromError = resolveMergeConflictFromError(linked, [{ id: 2 }, { id: 1 }]);
    expect(fromError?.keepLinkedId).toBe("2");
    expect(resolveMergeConflictFromError([film(1), film(2)], [{ id: 1 }])).toBeNull();
  });

  it("validates tmdb id input", () => {
    expect(parseTmdbIdInput("  ")).toEqual({ valid: true, tmdbId: null });
    expect(parseTmdbIdInput("42")).toEqual({ valid: true, tmdbId: 42 });
    expect(parseTmdbIdInput("-1")).toEqual({ valid: false });
    expect(parseTmdbIdInput("abc")).toEqual({ valid: false });
  });
});

describe("nominee film matching", () => {
  const candidates = [
    { id: 1, title: "Dune", release_year: 1984, tmdb_id: null },
    { id: 2, title: "Dune", release_year: 2021, tmdb_id: 438631 },
    { id: 3, title: "Dune", release_year: 2021, tmdb_id: null }
  ];

  it("prefers linked, then newest, then lowest id", () => {
    expect(pickPreferredFilmMatch(candidates)?.id).toBe(2);
    expect(pickPreferredFilmMatch([])).toBeNull();
  });

  it("flags ambiguity unless a year disambiguates", () => {
    expect(matchFilmByTitle(candidates, { title: "dune" }).ambiguous).toBe(true);
    const withYear = matchFilmByTitle(candidates, { title: "Dune", releaseYear: 1984 });
    expect(withYear.exact?.id).toBe(1);
    expect(withYear.ambiguous).toBe(false);
    const single = matchFilmByTitle([candidates[0]], { title: "DUNE" });
    expect(single.exact?.id).toBe(1);
    expect(matchFilmByTitle(candidates, { title: "Other" })).toMatchObject({
      exact: null,
      ambiguous: false
    });
  });
});

describe("nominee list helpers", () => {
  it("reorders only the targeted category", () => {
    const noms = [
      { id: 1, category_edition_id: 1, sort_order: 0 },
      { id: 2, category_edition_id: 1, sort_order: 1 },
      { id: 3, category_edition_id: 2, sort_order: 0 }
    ];
    expect(reorderNominationsLocally(noms, 1, [2, 1]).map((n) => n.id)).toEqual([
      2, 1, 3
    ]);
  });

  it("labels categories with fallbacks", () => {
    expect(
      buildCategoryLabelById([
        { id: 1, family_name: "Best Picture" },
        { id: 2, family_code: "DIR" },
        { id: 3 }
      ])
    ).toEqual({ 1: "Best Picture", 2: "DIR", 3: "Category 3" });
  });

  it("formats the candidate import message", () => {
    expect(
      formatCandidateImportMessage({ upserted: 3, hydrated: 2, tmdb_errors: [1] })
    ).toBe("Loaded candidates (upserted: 3, hydrated from TMDB: 2). TMDB errors: 1.");
    expect(formatCandidateImportMessage({ hydrated: 2 })).toBe(
      "Loaded candidates (hydrated from TMDB: 2)."
    );
    expect(formatCandidateImportMessage(undefined)).toBe("Loaded candidates.");
  });
});
