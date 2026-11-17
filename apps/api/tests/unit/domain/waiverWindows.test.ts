import { describe, expect, it } from "vitest";
import {
  leagueWaiverWindows,
  waiverWindowAt,
  waiverWindows
} from "../../../src/domain/waiverWindows.js";

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

// A 2025–26 calendar (nominations, then ceremony, per ceremony).
const SEASON_2025_26 = [
  "2025-12-05", // Critics Choice nominations
  "2026-01-04", // Critics Choice ceremony
  "2025-12-08", // Golden Globes nominations
  "2026-01-11", // Golden Globes ceremony
  "2026-01-07", // Actor Awards nominations
  "2026-03-01", // Actor Awards ceremony
  "2026-01-08", // DGA nominations
  "2026-02-07", // DGA ceremony
  "2026-01-09", // PGA nominations
  "2026-02-28", // PGA ceremony
  "2026-01-27", // WGA nominations
  "2026-03-08", // WGA ceremony
  "2026-01-27", // BAFTA nominations (same day as WGA)
  "2026-02-22", // BAFTA ceremony
  "2026-01-22", // Academy Awards nominations
  "2026-03-15" // Academy Awards ceremony (final occasion)
];

describe("waiverWindows, 2025–26", () => {
  it("derives eleven windows", () => {
    expect(waiverWindows(SEASON_2025_26).map(span)).toEqual([
      ["2025-12-05", "2025-12-07", "2025-12-08"],
      ["2025-12-08", "2025-12-10", "2025-12-11"],
      ["2026-01-04", "2026-01-06", "2026-01-07"],
      // Block Jan 7–9 covers through the day after its last day.
      ["2026-01-07", "2026-01-10", "2026-01-11"],
      // The Globes ceremony lands the day the block's window resolves.
      ["2026-01-11", "2026-01-13", "2026-01-14"],
      ["2026-01-22", "2026-01-24", "2026-01-25"],
      ["2026-01-27", "2026-01-29", "2026-01-30"],
      ["2026-02-07", "2026-02-09", "2026-02-10"],
      ["2026-02-22", "2026-02-24", "2026-02-25"],
      // Feb 28 and Mar 1 are consecutive in a non-leap year.
      ["2026-02-28", "2026-03-02", "2026-03-03"],
      ["2026-03-08", "2026-03-10", "2026-03-11"]
    ]);
  });
});

// The 2026–27 occasions keyed by event, as a league sees them.
const EVENTS = { cc: 1, gg: 2, guild: 3, bafta: 4, oscars: 5 } as const;
const OCCASIONS_2026_27 = [
  { circuit_event_id: EVENTS.cc, date: "2026-12-04" },
  { circuit_event_id: EVENTS.cc, date: "2027-01-03" },
  { circuit_event_id: EVENTS.gg, date: "2026-12-07" },
  { circuit_event_id: EVENTS.gg, date: "2027-01-10" },
  { circuit_event_id: EVENTS.guild, date: "2027-01-06" },
  { circuit_event_id: EVENTS.guild, date: "2027-02-28" },
  { circuit_event_id: EVENTS.guild, date: "2027-01-07" },
  { circuit_event_id: EVENTS.guild, date: "2027-01-30" },
  { circuit_event_id: EVENTS.guild, date: "2027-01-08" },
  { circuit_event_id: EVENTS.guild, date: "2027-02-27" },
  { circuit_event_id: EVENTS.guild, date: "2027-01-08" },
  { circuit_event_id: EVENTS.guild, date: "2027-02-13" },
  { circuit_event_id: EVENTS.bafta, date: "2027-01-19" },
  { circuit_event_id: EVENTS.bafta, date: "2027-02-21" },
  { circuit_event_id: EVENTS.oscars, date: "2027-01-21" },
  { circuit_event_id: EVENTS.oscars, date: "2027-03-14" }
];

describe("leagueWaiverWindows", () => {
  it("matches the plan with every event enabled", () => {
    expect(leagueWaiverWindows(OCCASIONS_2026_27, Object.values(EVENTS))).toEqual(
      waiverWindows(SEASON_2026_27)
    );
  });

  it("uses only the enabled events' occasions", () => {
    // No Guild Awards and no BAFTA: windows 4, 7, 8, 9 and 10 disappear, and
    // the Oscar nominations open their own window.
    expect(
      leagueWaiverWindows(OCCASIONS_2026_27, [EVENTS.cc, EVENTS.gg, EVENTS.oscars]).map(
        span
      )
    ).toEqual([
      ["2026-12-04", "2026-12-06", "2026-12-07"],
      ["2026-12-07", "2026-12-09", "2026-12-10"],
      ["2027-01-03", "2027-01-05", "2027-01-06"],
      ["2027-01-10", "2027-01-12", "2027-01-13"],
      ["2027-01-21", "2027-01-23", "2027-01-24"]
    ]);
  });

  it("ends at the league's own final occasion", () => {
    // Without the Oscars, BAFTA nominations no longer merge, and the Actor
    // Awards ceremony (Feb 28) is final, so the PGA ceremony opens the last window.
    const windows = leagueWaiverWindows(OCCASIONS_2026_27, [
      EVENTS.cc,
      EVENTS.gg,
      EVENTS.guild,
      EVENTS.bafta
    ]);
    expect(windows.map(span)).toContainEqual(["2027-01-19", "2027-01-21", "2027-01-22"]);
    expect(windows.at(-1)).toEqual({
      starts_on: "2027-02-27",
      ends_on: "2027-03-01",
      resolves_on: "2027-03-02",
      scoring_days: ["2027-02-27"]
    });
  });

  it("ignores undated occasions and opens nothing with no events", () => {
    expect(
      leagueWaiverWindows(
        [
          { circuit_event_id: 1, date: "2027-01-03" },
          { circuit_event_id: 1, date: null },
          { circuit_event_id: 1, date: "2027-02-01" }
        ],
        [1]
      ).map(span)
    ).toEqual([["2027-01-03", "2027-01-05", "2027-01-06"]]);
    expect(leagueWaiverWindows(OCCASIONS_2026_27, [])).toEqual([]);
  });
});

describe("waiverWindowAt", () => {
  const windows = waiverWindows(SEASON_2026_27);

  it("opens at 00:00 Pacific on the first day and closes at 00:00 on the resolution day", () => {
    // Window 3: Jan 3–5, resolves Jan 6 (PST, UTC-8).
    expect(waiverWindowAt(windows, new Date("2027-01-03T07:59:59.999Z"))).toBeNull();
    expect(waiverWindowAt(windows, new Date("2027-01-03T08:00:00Z"))?.starts_on).toBe(
      "2027-01-03"
    );
    expect(waiverWindowAt(windows, new Date("2027-01-06T07:59:59.999Z"))?.starts_on).toBe(
      "2027-01-03"
    );
    // Window 4 opens the instant window 3 resolves.
    expect(waiverWindowAt(windows, new Date("2027-01-06T08:00:00Z"))?.starts_on).toBe(
      "2027-01-06"
    );
  });

  it("is closed between windows and after the last", () => {
    expect(waiverWindowAt(windows, new Date("2026-12-20T20:00:00Z"))).toBeNull();
    expect(waiverWindowAt(windows, new Date("2027-03-02T08:00:00Z"))).toBeNull();
    expect(waiverWindowAt(windows, new Date("2027-03-14T20:00:00Z"))).toBeNull();
    expect(waiverWindowAt([], new Date())).toBeNull();
  });

  it("uses the daylight-time offset after the spring change", () => {
    const [w] = waiverWindows(["2027-03-20", "2027-04-30"]);
    // Opens 00:00 PDT (UTC-7) on Mar 20.
    expect(waiverWindowAt([w!], new Date("2027-03-20T06:59:59Z"))).toBeNull();
    expect(waiverWindowAt([w!], new Date("2027-03-20T07:00:00Z"))).not.toBeNull();
  });
});
