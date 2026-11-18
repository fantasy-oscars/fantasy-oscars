import { describe, expect, it } from "vitest";
import {
  circuitChipLabel,
  circuitChipStatusLabel,
  circuitClaimCapacityWarning,
  circuitClaimChipOptions,
  circuitClaimErrorMessage,
  circuitClaimOutcomeLabel,
  circuitClaimsNote,
  circuitPendingClaims,
  circuitPriorityEntries,
  circuitWaiversVisible,
  circuitWindowLabel
} from "@/decisions/circuitWaivers";
import type { CircuitClaims } from "@/lib/types";
import { circuitRoster, circuitSelection, OPEN_WINDOW } from "../circuitLeagues/fixtures";

const nightTrain = circuitSelection(1, "Night Train");
const paperMoon = circuitSelection(2, "Paper Moon", "Ada Lane");
const harbor = circuitSelection(3, "Harbor");
const quietSea = circuitSelection(4, "Quiet Sea", "Bea Moss");

describe("circuit waiver labels", () => {
  it("shows waivers once the draft has finished", () => {
    expect(circuitWaiversVisible("DRAFTING")).toBe(false);
    expect(circuitWaiversVisible("IN_SEASON")).toBe(true);
    expect(circuitWaiversVisible("COMPLETE")).toBe(true);
  });

  it("names windows, chips and outcomes", () => {
    expect(circuitWindowLabel(OPEN_WINDOW)).toBe("Jan 8, 2027 to Jan 10, 2027");
    expect(circuitChipLabel(4)).toBe("Pick 4 chip");
    expect(circuitChipStatusLabel("CONSUMED")).toBe("Used");
    expect(circuitChipStatusLabel("EXPIRED")).toBe("Expired");
    expect(circuitClaimOutcomeLabel({ status: "WON", failure_reason: null })).toBe("Won");
    expect(
      circuitClaimOutcomeLabel({ status: "LOST", failure_reason: "DROP_NOT_OWNED" })
    ).toBe("Lost: The drop was no longer on the roster");
    expect(
      circuitClaimOutcomeLabel({ status: "LOST", failure_reason: "SELECTION_OWNED" })
    ).toBe("Lost: Someone ahead of them got it");
  });

  it("explains the window: none, open, or being processed", () => {
    expect(circuitClaimsNote({ window: null, locked: false })).toMatch(
      /There is no waiver window open/
    );
    expect(circuitClaimsNote({ window: OPEN_WINDOW, locked: false })).toBe(
      "Claims for Jan 8, 2027 to Jan 10, 2027 run at midnight Pacific on Jan 11, 2027. You can change them until then. Nobody else sees them."
    );
    expect(circuitClaimsNote({ window: OPEN_WINDOW, locked: true })).toMatch(
      /being processed/
    );
  });

  it("maps claim errors and falls back to the roster messages", () => {
    expect(
      circuitClaimErrorMessage({ errorCode: "CIRCUIT_WAIVER_CLAIMS_LOCKED" }, "x")
    ).toBe("These claims are being processed and can no longer change.");
    expect(circuitClaimErrorMessage({ errorCode: "CIRCUIT_SELECTION_TAKEN" }, "x")).toBe(
      "Another player already has that pick."
    );
    expect(circuitClaimErrorMessage({}, "Could not claim")).toBe("Could not claim");
  });
});

describe("circuit claim capacity warning", () => {
  it("warns that a claim without a drop may fail even with room now", () => {
    const roster = circuitRoster();
    expect(circuitClaimCapacityWarning(roster, harbor, null)).toMatch(
      /Without a drop, this claim fails if your roster is full when claims run/
    );
    expect(circuitClaimCapacityWarning(roster, harbor, nightTrain.id)).toBeNull();
  });

  it("says a claim fails without a drop when the roster is full", () => {
    const roster = circuitRoster({ rosterSize: 2 });
    expect(circuitClaimCapacityWarning(roster, harbor, null)).toBe(
      "Your roster is full. Without a drop, this claim fails."
    );
    expect(circuitClaimCapacityWarning(roster, harbor, paperMoon.id)).toBeNull();
  });

  it("needs a drop from the same category at its limit", () => {
    const roster = circuitRoster({ maxActing: 1 });
    expect(circuitClaimCapacityWarning(roster, quietSea, nightTrain.id)).toBe(
      "You hold the most Best Actress picks allowed. Without dropping one of them, this claim fails."
    );
    expect(circuitClaimCapacityWarning(roster, quietSea, paperMoon.id)).toBeNull();
  });
});

describe("circuit claims and priority", () => {
  const claims: CircuitClaims = {
    window: OPEN_WINDOW,
    locked: false,
    claims: [
      {
        id: 9,
        rank: 2,
        status: "PENDING",
        failure_reason: null,
        selection: harbor,
        drop: null,
        chip: null,
        created_at: "2027-01-08T10:00:00Z",
        updated_at: "2027-01-08T10:00:00Z"
      },
      {
        id: 8,
        rank: 1,
        status: "PENDING",
        failure_reason: null,
        selection: quietSea,
        drop: paperMoon,
        chip: { id: 31, original_pick_number: 3 },
        created_at: "2027-01-08T09:00:00Z",
        updated_at: "2027-01-08T09:00:00Z"
      }
    ],
    chips: [
      { id: 31, original_pick_number: 3, status: "AVAILABLE", claim_id: 8 },
      { id: 32, original_pick_number: 5, status: "AVAILABLE", claim_id: null },
      { id: 33, original_pick_number: 7, status: "CONSUMED", claim_id: null }
    ]
  };

  it("orders pending claims by rank", () => {
    expect(circuitPendingClaims(claims).map((c) => c.id)).toEqual([8, 9]);
  });

  it("offers available chips not riding on another claim", () => {
    expect(circuitClaimChipOptions(claims.chips, null).map((c) => c.id)).toEqual([32]);
    expect(circuitClaimChipOptions(claims.chips, 8).map((c) => c.id)).toEqual([31, 32]);
  });

  it("lists members by rolling priority with their chips", () => {
    const entries = circuitPriorityEntries({
      window: null,
      priority: [
        { user_id: 5, username: "avery", waiver_priority: 2 },
        { user_id: 6, username: "blake", waiver_priority: 1 }
      ],
      chips: [
        {
          id: 41,
          member: { user_id: 6, username: "blake" },
          original_pick_number: 5,
          status: "AVAILABLE"
        },
        {
          id: 40,
          member: { user_id: 6, username: "blake" },
          original_pick_number: 3,
          status: "CONSUMED"
        }
      ]
    });
    expect(entries.map((e) => e.username)).toEqual(["blake", "avery"]);
    expect(entries[0]!.chips.map((c) => c.original_pick_number)).toEqual([3, 5]);
    expect(entries[1]!.chips).toEqual([]);
  });
});
