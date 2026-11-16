import { describe, expect, it } from "vitest";
import {
  findCeremoniesMissingDates,
  initialSeriesCategories,
  initialSeriesEvents,
  listScoringOccasions,
  seriesCategoryKind,
  type SeriesCeremonyDates
} from "../../../src/domain/series.js";

function ceremony(
  id: number,
  eventSort: number,
  dates: { nominations_on?: string | null; results_on?: string | null } = {}
): SeriesCeremonyDates {
  return {
    ceremony_id: id,
    ceremony_code: `c-${id}`,
    ceremony_name: `Ceremony ${id}`,
    series_event_id: 100 + eventSort,
    event_code: ["CRITICS_CHOICE", "GOLDEN_GLOBES", "GUILDS", "BAFTA", "OSCARS"][
      eventSort
    ]!,
    event_sort_index: eventSort,
    nominations_on: dates.nominations_on ?? null,
    results_on: dates.results_on ?? null
  };
}

describe("series structure", () => {
  it("starts every Series with the five events in order", () => {
    expect(initialSeriesEvents().map((e) => [e.code, e.sort_index])).toEqual([
      ["CRITICS_CHOICE", 0],
      ["GOLDEN_GLOBES", 1],
      ["GUILDS", 2],
      ["BAFTA", 3],
      ["OSCARS", 4]
    ]);
  });

  it("starts every Series with eight categories, the four acting ones ACTING", () => {
    const categories = initialSeriesCategories();
    expect(categories).toHaveLength(8);
    expect(categories.filter((c) => c.kind === "ACTING").map((c) => c.code)).toEqual([
      "ACTOR",
      "ACTRESS",
      "SUPPORTING_ACTOR",
      "SUPPORTING_ACTRESS"
    ]);
    expect(categories.filter((c) => c.kind === "FILM").map((c) => c.code)).toEqual([
      "PICTURE",
      "DIRECTOR",
      "SCREENPLAY",
      "ANIMATED_FEATURE"
    ]);
  });

  it("derives kind from the code", () => {
    expect(seriesCategoryKind("SUPPORTING_ACTRESS")).toBe("ACTING");
    expect(seriesCategoryKind("DIRECTOR")).toBe("FILM");
    expect(seriesCategoryKind("DOCUMENTARY")).toBeNull();
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
      series_event_id: 101,
      event_code: "GOLDEN_GLOBES"
    });
  });
});
