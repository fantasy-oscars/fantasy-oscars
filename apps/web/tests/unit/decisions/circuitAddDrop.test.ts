import { describe, expect, it } from "vitest";
import {
  CIRCUIT_ADD_DROP_PROCESSING_NOTE,
  circuitAddDropTarget,
  circuitAddDropVisible
} from "@/decisions/circuitAddDrop";

const WINDOW = {
  starts_on: "2027-01-08",
  ends_on: "2027-01-10",
  resolves_on: "2027-01-11"
};
const ROSTER_WINDOW = { ...WINDOW, scoring_days: [] };

describe("circuit add/drop", () => {
  it("shows to members while the season is in progress", () => {
    expect(circuitAddDropVisible({ status: "IN_SEASON", isMember: true })).toBe(true);
    expect(circuitAddDropVisible({ status: "IN_SEASON", isMember: false })).toBe(false);
    expect(circuitAddDropVisible({ status: "DRAFTING", isMember: true })).toBe(false);
    expect(circuitAddDropVisible({ status: "COMPLETE", isMember: true })).toBe(false);
  });

  it("goes to free agency outside a window", () => {
    expect(
      circuitAddDropTarget({
        freeAgency: { open: true, window: null },
        claims: { window: null, locked: false }
      })
    ).toEqual({ kind: "free-agency", page: "roster", hash: "add", note: null });
  });

  it("goes to claims while a window is open and its claims can change", () => {
    expect(
      circuitAddDropTarget({
        freeAgency: { open: false, window: ROSTER_WINDOW },
        claims: { window: WINDOW, locked: false }
      })
    ).toEqual({ kind: "claims", page: "waivers", hash: "claim", note: null });
  });

  it("goes to the waivers page with the processing note once claims are locked", () => {
    const processing = {
      kind: "processing",
      page: "waivers",
      hash: null,
      note: CIRCUIT_ADD_DROP_PROCESSING_NOTE
    };
    expect(
      circuitAddDropTarget({
        freeAgency: { open: false, window: ROSTER_WINDOW },
        claims: { window: WINDOW, locked: true }
      })
    ).toEqual(processing);
    // The window has resolved but its claims have not run: free agency stays closed.
    expect(
      circuitAddDropTarget({
        freeAgency: { open: false, window: null },
        claims: { window: null, locked: false }
      })
    ).toEqual(processing);
    expect(CIRCUIT_ADD_DROP_PROCESSING_NOTE).toBe(
      "Claims are being processed. Add/drop reopens once they have run."
    );
  });

  it("falls back to the roster's window when the claims read fails", () => {
    expect(
      circuitAddDropTarget({
        freeAgency: { open: false, window: ROSTER_WINDOW },
        claims: null
      }).kind
    ).toBe("claims");
    expect(
      circuitAddDropTarget({ freeAgency: { open: false, window: null }, claims: null })
        .kind
    ).toBe("processing");
  });
});
