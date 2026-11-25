import { describe, expect, it } from "vitest";
import {
  circuitCeremonyDatesLabel,
  circuitCeremonyName,
  circuitPointsLabel,
  circuitScoreKindLabel,
  circuitStandingsViews,
  circuitStandingsVisible,
  parseCircuitStandingsView
} from "../../../src/decisions/circuitStandings";

const ceremony = {
  id: 1,
  code: "cc",
  name: "Critics Choice",
  event: { id: 2, name: "Critics" },
  nominations_on: "2026-12-05",
  results_on: "2027-01-03"
};

describe("circuit standings decisions", () => {
  it("shows standings once the season is under way", () => {
    expect(circuitStandingsVisible("SETUP")).toBe(false);
    expect(circuitStandingsVisible("DRAFTING")).toBe(false);
    expect(circuitStandingsVisible("IN_SEASON")).toBe(true);
    expect(circuitStandingsVisible("COMPLETE")).toBe(true);
  });

  it("labels points, singular for exactly one", () => {
    expect(circuitPointsLabel(0)).toBe("0 pts");
    expect(circuitPointsLabel(1)).toBe("1 pt");
    expect(circuitPointsLabel(4.5)).toBe("4.5 pts");
    expect(circuitPointsLabel(0.1 + 0.2)).toBe("0.3 pts");
  });

  it("labels kinds", () => {
    expect(circuitScoreKindLabel("NOMINATION")).toBe("Nomination");
    expect(circuitScoreKindLabel("WIN")).toBe("Win");
  });

  it("names a ceremony and its dates, leaving unset dates out", () => {
    expect(circuitCeremonyName(ceremony)).toBe("Critics Choice");
    expect(circuitCeremonyName({ ...ceremony, name: null })).toBe("cc");
    expect(circuitCeremonyDatesLabel(ceremony)).toBe(
      "Nominations Dec 5, 2026 · Winners Jan 3, 2027"
    );
    expect(circuitCeremonyDatesLabel({ ...ceremony, nominations_on: null })).toBe(
      "Winners Jan 3, 2027"
    );
    expect(
      circuitCeremonyDatesLabel({ ...ceremony, nominations_on: null, results_on: null })
    ).toBe("Dates to be announced");
  });

  it("offers Final results as a view only once the season is complete", () => {
    expect(circuitStandingsViews(false).map((v) => v.label)).toEqual([
      "Leaderboard",
      "By ceremony"
    ]);
    expect(circuitStandingsViews(true).map((v) => v.label)).toEqual([
      "Leaderboard",
      "Final results",
      "By ceremony"
    ]);
  });

  it("parses the standings view from the URL, falling back to the leaderboard", () => {
    expect(parseCircuitStandingsView(null, false)).toBe("leaderboard");
    expect(parseCircuitStandingsView("leaderboard", true)).toBe("leaderboard");
    expect(parseCircuitStandingsView("ceremonies", false)).toBe("ceremonies");
    expect(parseCircuitStandingsView("results", true)).toBe("results");
    expect(parseCircuitStandingsView("results", false)).toBe("leaderboard");
    expect(parseCircuitStandingsView("rosters", true)).toBe("leaderboard");
  });
});
