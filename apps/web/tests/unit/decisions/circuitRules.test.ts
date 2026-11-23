import { describe, expect, it } from "vitest";
import { circuitRulesFrom } from "@/decisions/circuitRules";
import { circuitLeagueDetail } from "../circuitLeagues/fixtures";

function customised() {
  const detail = circuitLeagueDetail({ status: "INITIALIZED" });
  detail.circuit_league.roster_size = 10;
  detail.circuit_league.nomination_points = 3;
  detail.circuit_league.win_bonus_points = 5;
  detail.events[0].weight = 2;
  detail.events[1].enabled = false;
  detail.categories[0].weight = 1.5;
  detail.categories[1].max_owned = 2;
  return detail;
}

describe("circuit rules", () => {
  it("reads the league's own settings rather than the defaults", () => {
    const rules = circuitRulesFrom(customised());
    expect(rules.rosterLine).toBe("Each player holds up to 10 contenders.");
    expect(rules.scoring).toEqual({
      nomination: "3 pts for each nomination",
      win: "5 pts more for each win"
    });
    expect(rules.events.map((e) => [e.name, e.weight])).toEqual([["Golden Reel", "×2"]]);
    expect(rules.eventsOff).toEqual(["Guild Awards"]);
    expect(rules.categories).toEqual([
      { id: 20, name: "Best Picture", weight: "×1.5", limit: "No limit" },
      { id: 21, name: "Best Actress", weight: null, limit: "At most 2" }
    ]);
    expect(rules.categoriesNote).toBeNull();
  });

  it("lists each counted event's ceremonies with their dates", () => {
    const rules = circuitRulesFrom(circuitLeagueDetail());
    expect(rules.events[1].ceremonies).toEqual([
      {
        name: "Directors Guild",
        datesLabel: "Nominations Jan 7, 2027 · Winners Jan 30, 2027"
      },
      { name: "Actors Guild", datesLabel: "Dates to be announced" }
    ]);
    expect(rules.categoriesNote).toBe("Every category counts equally.");
  });

  it("singularises a roster of one", () => {
    const detail = circuitLeagueDetail();
    detail.circuit_league.roster_size = 1;
    expect(circuitRulesFrom(detail).rosterLine).toBe(
      "Each player holds up to 1 contender."
    );
  });
});
