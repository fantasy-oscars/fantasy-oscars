import { describe, expect, it } from "vitest";
import { waiverWindows } from "../../../src/domain/waiverWindows.js";

// The 2026–27 scoring days (docs/planning/series/plan.md, section 4): each
// ceremony's nominations and ceremony day, all ceremonies enabled.
const SEASON_2026_27 = [
  "2026-12-04", // Critics Choice nominations
  "2027-01-03", // Critics Choice ceremony
  "2026-12-07", // Golden Globes nominations
  "2027-01-10", // Golden Globes ceremony
  "2027-01-06", // Actor Awards nominations
  "2027-02-28", // Actor Awards ceremony
  "2027-01-07", // DGA nominations
  "2027-01-30", // DGA ceremony
  "2027-01-08", // PGA nominations
  "2027-02-27", // PGA ceremony
  "2027-01-08", // WGA nominations (same day as PGA)
  "2027-02-13", // WGA ceremony
  "2027-01-19", // BAFTA nominations
  "2027-02-21", // BAFTA ceremony
  "2027-01-21", // Academy Awards nominations
  "2027-03-14" // Academy Awards ceremony (final occasion)
];

const span = (w: { starts_on: string; ends_on: string; resolves_on: string }) => [
  w.starts_on,
  w.ends_on,
  w.resolves_on
];

describe("waiverWindows", () => {
  it("reproduces the ten 2026–27 windows of the plan", () => {
    expect(waiverWindows(SEASON_2026_27).map(span)).toEqual([
      ["2026-12-04", "2026-12-06", "2026-12-07"],
      ["2026-12-07", "2026-12-09", "2026-12-10"],
      ["2027-01-03", "2027-01-05", "2027-01-06"],
      ["2027-01-06", "2027-01-09", "2027-01-10"],
      ["2027-01-10", "2027-01-12", "2027-01-13"],
      ["2027-01-19", "2027-01-23", "2027-01-24"],
      ["2027-01-30", "2027-02-01", "2027-02-02"],
      ["2027-02-13", "2027-02-15", "2027-02-16"],
      ["2027-02-21", "2027-02-23", "2027-02-24"],
      ["2027-02-27", "2027-03-01", "2027-03-02"]
    ]);
  });

  it("opens a window on a lone scoring day covering it and the next two days", () => {
    expect(waiverWindows(["2027-01-03", "2027-02-01"])).toEqual([
      {
        starts_on: "2027-01-03",
        ends_on: "2027-01-05",
        resolves_on: "2027-01-06",
        scoring_days: ["2027-01-03"]
      }
    ]);
  });

  it("covers a block of consecutive days through the day after its last", () => {
    const [block] = waiverWindows([
      "2027-01-06",
      "2027-01-07",
      "2027-01-08",
      "2027-01-09",
      "2027-03-14"
    ]);
    expect(block).toEqual({
      starts_on: "2027-01-06",
      ends_on: "2027-01-10",
      resolves_on: "2027-01-11",
      scoring_days: ["2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09"]
    });
    // A two-day block still gets the two days after its first day.
    expect(waiverWindows(["2027-01-06", "2027-01-07", "2027-03-14"]).map(span)).toEqual([
      ["2027-01-06", "2027-01-08", "2027-01-09"]
    ]);
  });

  it("extends an open window when a scoring day falls inside it", () => {
    const [merged] = waiverWindows(["2027-01-19", "2027-01-21", "2027-03-14"]);
    expect(merged).toEqual({
      starts_on: "2027-01-19",
      ends_on: "2027-01-23",
      resolves_on: "2027-01-24",
      scoring_days: ["2027-01-19", "2027-01-21"]
    });
  });

  it("keeps windows that only abut separate", () => {
    expect(waiverWindows(["2026-12-04", "2026-12-07", "2027-03-14"]).map(span)).toEqual([
      ["2026-12-04", "2026-12-06", "2026-12-07"],
      ["2026-12-07", "2026-12-09", "2026-12-10"]
    ]);
  });

  it("opens no window after the final occasion", () => {
    expect(waiverWindows(["2027-03-14"])).toEqual([]);
    expect(waiverWindows([])).toEqual([]);
    const windows = waiverWindows(["2027-02-27", "2027-02-28", "2027-03-14"]);
    expect(windows.map(span)).toEqual([["2027-02-27", "2027-03-01", "2027-03-02"]]);
    expect(windows.flatMap((w) => w.scoring_days)).not.toContain("2027-03-14");
  });

  it("ignores input order and repeated days", () => {
    const shuffled = [...SEASON_2026_27].reverse();
    expect(waiverWindows(shuffled)).toEqual(waiverWindows(SEASON_2026_27));
    expect(waiverWindows(["2027-01-03", "2027-01-03", "2027-02-01"])).toHaveLength(1);
  });

  it("crosses month and year ends", () => {
    expect(waiverWindows(["2026-12-31", "2027-02-01"]).map(span)).toEqual([
      ["2026-12-31", "2027-01-02", "2027-01-03"]
    ]);
  });
});
