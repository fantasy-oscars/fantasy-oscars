import { describe, expect, it } from "vitest";
import {
  circuitCategoryKindForUnitKind,
  codeFromLabel,
  findCeremoniesMissingDates,
  isFullOrdering,
  listScoringOccasions,
  suggestCircuitCategoryId,
  uniqueCode,
  type CircuitCeremonyDates
} from "../../../src/domain/circuit.js";

function ceremony(
  id: number,
  eventSort: number,
  dates: { nominations_on?: string | null; results_on?: string | null } = {}
): CircuitCeremonyDates {
  return {
    ceremony_id: id,
    ceremony_code: `c-${id}`,
    ceremony_name: `Ceremony ${id}`,
    circuit_event_id: 100 + eventSort,
    event_code: `event-${eventSort}`,
    event_sort_index: eventSort,
    nominations_on: dates.nominations_on ?? null,
    results_on: dates.results_on ?? null
  };
}

describe("circuit category kind", () => {
  it("is FILM for a FILM template and ACTING for a PERFORMANCE template", () => {
    expect(circuitCategoryKindForUnitKind("FILM")).toBe("FILM");
    expect(circuitCategoryKindForUnitKind("PERFORMANCE")).toBe("ACTING");
  });

  it("has no kind for a SONG template", () => {
    expect(circuitCategoryKindForUnitKind("SONG")).toBeNull();
  });
});

describe("codes", () => {
  it("derives a lowercase dashed code from a label", () => {
    expect(codeFromLabel("Golden Globe Awards")).toBe("golden-globe-awards");
    expect(codeFromLabel("  Critics' Choice — 2027 ")).toBe("critics-choice-2027");
    expect(codeFromLabel("Césars")).toBe("cesars");
    expect(codeFromLabel("!!!")).toBe("");
  });

  it("suffixes a taken code, ignoring case, and falls back when empty", () => {
    expect(uniqueCode("guilds", [])).toBe("guilds");
    expect(uniqueCode("guilds", ["GUILDS", "guilds-2"])).toBe("guilds-3");
    expect(uniqueCode("", ["event"], "event")).toBe("event-2");
  });
});

describe("isFullOrdering", () => {
  it("accepts every current id once, in any order", () => {
    expect(isFullOrdering([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it("rejects missing, extra, foreign or repeated ids", () => {
    expect(isFullOrdering([1, 2], [1, 2, 3])).toBe(false);
    expect(isFullOrdering([1, 2, 3, 4], [1, 2, 3])).toBe(false);
    expect(isFullOrdering([1, 2, 9], [1, 2, 3])).toBe(false);
    expect(isFullOrdering([1, 1, 2], [1, 2, 3])).toBe(false);
  });
});

describe("suggestCircuitCategoryId", () => {
  const categories = [
    { id: 10, category_family_id: 1 },
    { id: 11, category_family_id: 2 },
    { id: 12, category_family_id: 2 },
    { id: 13, category_family_id: null }
  ];

  it("suggests the one Circuit category built from the same template", () => {
    expect(suggestCircuitCategoryId(1, categories)).toBe(10);
  });

  it("suggests nothing without a template, without a match, or when ambiguous", () => {
    expect(suggestCircuitCategoryId(null, categories)).toBeNull();
    expect(suggestCircuitCategoryId(7, categories)).toBeNull();
    expect(suggestCircuitCategoryId(2, categories)).toBeNull();
  });
});

describe("findCeremoniesMissingDates", () => {
  it("is empty when every ceremony has both dates, or none is associated", () => {
    expect(findCeremoniesMissingDates([])).toEqual([]);
    expect(
      findCeremoniesMissingDates([
        ceremony(1, 0, { nominations_on: "2026-12-05", results_on: "2027-01-04" })
      ])
    ).toEqual([]);
  });

  it("lists each ceremony lacking a date with the dates it lacks, in event order", () => {
    const missing = findCeremoniesMissingDates([
      ceremony(5, 4, { nominations_on: "2027-01-21" }),
      ceremony(1, 0, { nominations_on: "2026-12-05", results_on: "2027-01-04" }),
      ceremony(3, 2),
      ceremony(2, 1, { results_on: "2027-01-11" })
    ]);
    expect(missing.map((m) => [m.ceremony_id, m.missing])).toEqual([
      [2, ["nominations_on"]],
      [3, ["nominations_on", "results_on"]],
      [5, ["results_on"]]
    ]);
    expect(missing[0]).toMatchObject({
      ceremony_code: "c-2",
      ceremony_name: "Ceremony 2"
    });
  });
});

describe("listScoringOccasions", () => {
  it("gives every ceremony a nomination and a win occasion (sixteen for eight ceremonies)", () => {
    const ceremonies = [0, 1, 2, 2, 2, 2, 3, 4].map((sort, i) => ceremony(i + 1, sort));
    const occasions = listScoringOccasions(ceremonies);
    expect(occasions).toHaveLength(16);
    expect(occasions.filter((o) => o.kind === "NOMINATION")).toHaveLength(8);
    expect(occasions.filter((o) => o.kind === "WIN")).toHaveLength(8);
  });

  it("orders dated occasions by date, nomination before win on a shared day, undated last", () => {
    const occasions = listScoringOccasions([
      ceremony(5, 4, { nominations_on: "2027-01-21", results_on: "2027-03-14" }),
      ceremony(4, 3, { nominations_on: "2027-01-19" }),
      ceremony(1, 0, { nominations_on: "2026-12-05", results_on: "2026-12-05" })
    ]);
    expect(occasions.map((o) => [o.ceremony_id, o.kind, o.date])).toEqual([
      [1, "NOMINATION", "2026-12-05"],
      [1, "WIN", "2026-12-05"],
      [4, "NOMINATION", "2027-01-19"],
      [5, "NOMINATION", "2027-01-21"],
      [5, "WIN", "2027-03-14"],
      [4, "WIN", null]
    ]);
  });

  it("keeps undated occasions in event order", () => {
    const occasions = listScoringOccasions([ceremony(9, 4), ceremony(2, 1)]);
    expect(occasions.map((o) => [o.ceremony_id, o.kind])).toEqual([
      [2, "NOMINATION"],
      [2, "WIN"],
      [9, "NOMINATION"],
      [9, "WIN"]
    ]);
    expect(occasions[0]).toMatchObject({
      circuit_event_id: 101,
      event_code: "event-1"
    });
  });
});
