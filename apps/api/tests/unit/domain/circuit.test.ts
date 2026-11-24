import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/errors.js";
import {
  assertCircuitLive,
  circuitCategoryKindForUnitKind,
  circuitStatuses,
  codeFromLabel,
  findCeremoniesMissingDates,
  instantOfDay,
  isCircuitLive,
  isCircuitOpenForSeasons,
  isFullOrdering,
  listScoringOccasions,
  moveToIndex,
  resultsDateOf,
  suggestCircuitCategoryId,
  uniqueCode,
  withResultsDate,
  type CircuitCeremonyDates
} from "../../../src/domain/circuit.js";

/** 17:00 Pacific on a winter day, as an instant (UTC is eight hours ahead). */
function evening(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 25));
}

function ceremony(
  id: number,
  eventSort: number,
  dates: { nominations_on?: string | null; results_on?: string | null } = {},
  sortIndex = 0
): CircuitCeremonyDates {
  return {
    ceremony_id: id,
    ceremony_code: `c-${id}`,
    ceremony_name: `Ceremony ${id}`,
    circuit_event_id: 100 + eventSort,
    event_code: `event-${eventSort}`,
    event_sort_index: eventSort,
    sort_index: sortIndex,
    nominations_on: dates.nominations_on ?? null,
    starts_at: dates.results_on ? evening(dates.results_on) : null
  };
}

describe("circuit status", () => {
  it("lists the lifecycle statuses in order", () => {
    expect(circuitStatuses).toEqual(["DRAFT", "PUBLISHED", "ACTIVE", "ARCHIVED"]);
  });

  it.each([
    ["DRAFT", false, false],
    ["PUBLISHED", true, false],
    ["ACTIVE", true, true],
    ["ARCHIVED", false, false],
    ["UNKNOWN", false, false]
  ])("%s: open for seasons %s, live %s", (status, openForSeasons, live) => {
    expect(isCircuitOpenForSeasons(status)).toBe(openForSeasons);
    expect(isCircuitLive(status)).toBe(live);
  });

  it("refuses a draft start until the Circuit is live", () => {
    expect(() => assertCircuitLive("ACTIVE")).not.toThrow();
    for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
      expect(() => assertCircuitLive(status)).toThrow(AppError);
      expect(() => assertCircuitLive(status)).toThrow(
        expect.objectContaining({
          code: "CIRCUIT_NOT_LIVE",
          status: 409,
          details: { status }
        })
      );
    }
  });
});

describe("resultsDateOf", () => {
  it("is the ceremony datetime's date in America/Los_Angeles", () => {
    // 17:00 Pacific is already the next day in UTC.
    expect(resultsDateOf(new Date("2027-03-15T01:00:00Z"))).toBe("2027-03-14");
    expect(resultsDateOf("2027-03-15T06:59:59Z")).toBe("2027-03-14");
    expect(resultsDateOf("2027-03-15T07:00:00Z")).toBe("2027-03-15");
  });

  it("follows daylight saving time", () => {
    // PST (UTC-8) in January, PDT (UTC-7) in July.
    expect(resultsDateOf("2027-01-11T07:59:00Z")).toBe("2027-01-10");
    expect(resultsDateOf("2027-07-11T06:59:00Z")).toBe("2027-07-10");
    expect(resultsDateOf("2027-07-11T07:00:00Z")).toBe("2027-07-11");
  });

  it("is null without a datetime", () => {
    expect(resultsDateOf(null)).toBeNull();
    expect(resultsDateOf("not a date")).toBeNull();
  });

  it("is added to a ceremony for responses", () => {
    expect(withResultsDate(ceremony(1, 0, { results_on: "2027-01-10" }))).toMatchObject({
      ceremony_id: 1,
      results_on: "2027-01-10"
    });
    expect(withResultsDate(ceremony(2, 0)).results_on).toBeNull();
  });
});

describe("moveToIndex", () => {
  it("moves an id to a position, keeping the others in order", () => {
    expect(moveToIndex([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
    expect(moveToIndex([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(moveToIndex([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("inserts a new id, and clamps the position to the list", () => {
    expect(moveToIndex([1, 2], 9, 1)).toEqual([1, 9, 2]);
    expect(moveToIndex([1, 2], 9, 50)).toEqual([1, 2, 9]);
    expect(moveToIndex([1, 2], 1, -3)).toEqual([1, 2]);
    expect(moveToIndex([], 5, 0)).toEqual([5]);
  });
});

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

  it("derives the win date from the ceremony datetime", () => {
    const [nomination, win] = listScoringOccasions([
      {
        ...ceremony(1, 0, { nominations_on: "2027-01-21" }),
        starts_at: new Date("2027-03-15T01:00:00Z")
      }
    ]);
    expect(nomination).toMatchObject({ kind: "NOMINATION", date: "2027-01-21" });
    expect(win).toMatchObject({ kind: "WIN", date: "2027-03-14" });
  });

  it("orders ceremonies inside one event by their own order", () => {
    const occasions = listScoringOccasions([
      ceremony(1, 2, {}, 1),
      ceremony(7, 2, {}, 0),
      ceremony(3, 0)
    ]);
    expect(
      occasions.filter((o) => o.kind === "NOMINATION").map((o) => o.ceremony_id)
    ).toEqual([3, 7, 1]);
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

describe("instantOfDay", () => {
  const iso = (day: string) => instantOfDay(day).toISOString();

  it("is 00:00 Pacific: UTC-8 in winter and UTC-7 in summer", () => {
    expect(iso("2027-01-21")).toBe("2027-01-21T08:00:00.000Z");
    expect(iso("2026-07-04")).toBe("2026-07-04T07:00:00.000Z");
  });

  it("follows the spring change (2027-03-14, 02:00 PST to 03:00 PDT)", () => {
    expect(iso("2027-03-13")).toBe("2027-03-13T08:00:00.000Z");
    // Midnight on the change day is still standard time.
    expect(iso("2027-03-14")).toBe("2027-03-14T08:00:00.000Z");
    expect(iso("2027-03-15")).toBe("2027-03-15T07:00:00.000Z");
    // The change day is 23 hours long.
    expect(
      instantOfDay("2027-03-15").getTime() - instantOfDay("2027-03-14").getTime()
    ).toBe(23 * 3600 * 1000);
  });

  it("follows the autumn change (2026-11-01, 02:00 PDT to 01:00 PST)", () => {
    expect(iso("2026-10-31")).toBe("2026-10-31T07:00:00.000Z");
    expect(iso("2026-11-01")).toBe("2026-11-01T07:00:00.000Z");
    expect(iso("2026-11-02")).toBe("2026-11-02T08:00:00.000Z");
    expect(
      instantOfDay("2026-11-02").getTime() - instantOfDay("2026-11-01").getTime()
    ).toBe(25 * 3600 * 1000);
  });

  it("round-trips with the Pacific results date", () => {
    for (const day of ["2026-11-01", "2027-03-14", "2027-12-31", "2028-02-29"]) {
      expect(resultsDateOf(instantOfDay(day))).toBe(day);
      expect(resultsDateOf(new Date(instantOfDay(day).getTime() - 1))).not.toBe(day);
    }
  });

  it("rejects a malformed day", () => {
    expect(() => instantOfDay("2027-1-5")).toThrow();
  });
});
