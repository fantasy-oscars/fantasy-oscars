import { describe, expect, it } from "vitest";
import {
  circuitAvailablePassPicks,
  circuitPassTileNote,
  circuitSeasonTiles
} from "../../../src/decisions/circuitSeasonTiles";

const titles = (status: string, isMember = true) =>
  circuitSeasonTiles({ status, isMember, passPicks: [] }).map((t) => t.title);

describe("circuitSeasonTiles", () => {
  it("offers the draft lobby and the rules before the draft", () => {
    expect(titles("SETUP")).toEqual(["Draft lobby", "Rules"]);
    expect(titles("INITIALIZED")).toEqual(["Draft lobby", "Rules"]);
    expect(
      circuitSeasonTiles({ status: "SETUP", isMember: true, passPicks: [] })[0]
    ).toMatchObject({ description: "Queue contenders before the draft starts." });
  });

  it("offers four tiles while drafting", () => {
    expect(titles("DRAFTING")).toEqual([
      "Draft room",
      "Your roster",
      "Transactions",
      "Rules"
    ]);
    expect(
      circuitSeasonTiles({ status: "DRAFTING", isMember: true, passPicks: [] })[0]
        ?.description
    ).toBe("The draft is on. Take your seat.");
  });

  it("offers six tiles in season, in order, with a line about each", () => {
    expect(
      circuitSeasonTiles({ status: "IN_SEASON", isMember: true, passPicks: [] }).map(
        (t) => [t.key, t.title, t.description]
      )
    ).toEqual([
      ["draft", "Draft board", "Every pick from the draft."],
      ["roster", "Your roster", "Your picks and what they have scored."],
      ["transactions", "Transactions", "Every add and drop, newest first."],
      ["waivers", "Waivers", "Claims, priority and results."],
      ["standings", "Standings", "The leaderboard and points by ceremony."],
      ["rules", "Rules", "How scoring, rosters and waivers work."]
    ]);
  });

  it("describes final standings once the season is complete", () => {
    const standings = circuitSeasonTiles({
      status: "COMPLETE",
      isMember: true,
      passPicks: []
    }).find((t) => t.key === "standings");
    expect(standings?.description).toBe("Final standings and results.");
  });

  it("names every roster for a non-member", () => {
    const roster = circuitSeasonTiles({
      status: "IN_SEASON",
      isMember: false,
      passPicks: [5]
    });
    expect(roster.find((t) => t.key === "roster")).toMatchObject({
      title: "Rosters",
      description: "Every player's picks and points."
    });
    expect(roster.find((t) => t.key === "waivers")?.note).toBeNull();
  });

  it("adds the pass line to the Waivers tile while the viewer holds one", () => {
    const waivers = circuitSeasonTiles({
      status: "IN_SEASON",
      isMember: true,
      passPicks: [5]
    }).find((t) => t.key === "waivers");
    expect(waivers?.note).toBe(
      "You have a priority pass for pick 5. Use it on a claim in the first waiver window."
    );
    expect(
      circuitSeasonTiles({ status: "IN_SEASON", isMember: true, passPicks: [] }).every(
        (t) => t.note === null
      )
    ).toBe(true);
  });
});

describe("circuitAvailablePassPicks", () => {
  it("keeps available passes on no claim, earliest pick first", () => {
    expect(
      circuitAvailablePassPicks([
        { id: 1, original_pick_number: 9, status: "AVAILABLE", claim_id: null },
        { id: 2, original_pick_number: 3, status: "AVAILABLE", claim_id: null },
        { id: 3, original_pick_number: 1, status: "AVAILABLE", claim_id: 40 },
        { id: 4, original_pick_number: 2, status: "CONSUMED", claim_id: null },
        { id: 5, original_pick_number: 4, status: "EXPIRED", claim_id: null }
      ])
    ).toEqual([3, 9]);
  });

  it("gives none without a claims read", () => {
    expect(circuitAvailablePassPicks(null)).toEqual([]);
    expect(circuitAvailablePassPicks(undefined)).toEqual([]);
  });
});

describe("circuitPassTileNote", () => {
  it("names several passes by pick", () => {
    expect(circuitPassTileNote([2, 5, 8])).toBe(
      "You have priority passes for picks 2, 5 and 8. Use them on claims in the first waiver window."
    );
    expect(circuitPassTileNote([])).toBeNull();
  });
});
