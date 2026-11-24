import { describe, expect, it } from "vitest";
import {
  CIRCUIT_NO_DROP_LABEL,
  circuitDropPlaceholder,
  circuitAddBlockedReason,
  circuitAddNeedsDrop,
  circuitCategoryCountLabel,
  circuitDayLabel,
  circuitDropOptions,
  circuitFreeAgencyNote,
  circuitRosterByCategory,
  circuitRosterCountLabel,
  circuitRosterErrorMessage,
  circuitRostersVisible,
  circuitRosterWritable,
  circuitSelectionLabel,
  circuitTransactionKindLabel
} from "@/decisions/circuitRoster";
import { circuitRoster, circuitSelection, OPEN_WINDOW } from "../circuitLeagues/fixtures";

describe("circuit roster labels", () => {
  it("names a film pick by film and an acting pick by person and film", () => {
    expect(circuitSelectionLabel(circuitSelection(1, "Night Train"))).toBe(
      "Night Train (2026)"
    );
    expect(circuitSelectionLabel(circuitSelection(2, "Paper Moon", "Ada Lane"))).toBe(
      "Ada Lane, Paper Moon (2026)"
    );
  });

  it("labels every transaction kind and counts against the limits", () => {
    expect(
      ["DRAFT", "SUPPLEMENTAL", "WAIVER", "FREE_AGENT", "DROP", "OTHER"].map(
        circuitTransactionKindLabel
      )
    ).toEqual([
      "Draft",
      "Supplemental draft",
      "Waiver claim",
      "Free agent",
      "Drop",
      "Transaction"
    ]);
    const roster = circuitRoster({ maxActing: 3 });
    expect(circuitRosterCountLabel(roster)).toBe("2 of 16");
    expect(roster.categories.map(circuitCategoryCountLabel)).toEqual(["1", "1 of 3"]);
  });

  it("groups entries under their categories in category order", () => {
    const groups = circuitRosterByCategory(circuitRoster());
    expect(
      groups.map((g) => [g.category.name, g.entries.map((e) => e.selection.id)])
    ).toEqual([
      ["Best Picture", [1]],
      ["Best Actress", [2]]
    ]);
  });

  it("shows rosters from the draft on and allows writes only in season", () => {
    expect(
      ["SETUP", "INITIALIZED", "DRAFTING", "IN_SEASON", "COMPLETE"].map(
        circuitRostersVisible
      )
    ).toEqual([false, false, true, true, true]);
    expect(["DRAFTING", "IN_SEASON", "COMPLETE"].map(circuitRosterWritable)).toEqual([
      false,
      true,
      false
    ]);
  });
});

describe("free agency", () => {
  it("says nothing while open and names the reopening day inside a window", () => {
    expect(circuitFreeAgencyNote({ open: true, window: null })).toBeNull();
    expect(circuitFreeAgencyNote({ open: false, window: null })).toBe(
      "Free agency is closed while waiver claims are processed. It reopens once they have run."
    );
    expect(circuitFreeAgencyNote({ open: false, window: OPEN_WINDOW })).toBe(
      "Free agency is closed while waiver claims are open. It reopens at midnight Pacific on Jan 11, 2027."
    );
  });

  it("formats a whole day without shifting it by time zone", () => {
    expect(circuitDayLabel("2027-03-14")).toBe("Mar 14, 2027");
    expect(circuitDayLabel("not-a-day")).toBe("not-a-day");
  });

  it("needs no drop with room, any drop at capacity and a same-category drop at a limit", () => {
    const film = circuitSelection(9, "New Film");
    const acting = circuitSelection(8, "Other Film", "Bea Moss");
    expect(circuitAddNeedsDrop(circuitRoster(), film)).toBe("none");
    expect(circuitAddNeedsDrop(circuitRoster({ rosterSize: 2 }), film)).toBe("any");
    expect(circuitAddNeedsDrop(circuitRoster({ maxActing: 1 }), acting)).toBe("category");
    expect(
      circuitDropOptions(circuitRoster({ maxActing: 1 }), acting).map(
        (e) => e.selection.id
      )
    ).toEqual([2]);
    expect(circuitDropOptions(circuitRoster(), null)).toHaveLength(2);
  });

  it("blocks an add at capacity until an allowed drop is chosen", () => {
    const full = circuitRoster({ rosterSize: 2 });
    const film = circuitSelection(9, "New Film");
    expect(circuitAddBlockedReason(full, film, null)).toBe(
      "Your roster is full. Choose a pick to drop."
    );
    expect(circuitAddBlockedReason(full, film, 1)).toBeNull();

    const limited = circuitRoster({ maxActing: 1 });
    const acting = circuitSelection(8, "Other Film", "Bea Moss");
    expect(circuitAddBlockedReason(limited, acting, 1)).toBe(
      "You hold the most Best Actress picks allowed. Choose one of them to drop."
    );
    expect(circuitAddBlockedReason(limited, acting, 2)).toBeNull();
    expect(
      circuitAddBlockedReason(circuitRoster(), circuitSelection(1, "Night Train"), null)
    ).toBe("Night Train (2026) is already on your roster.");
  });

  it("explains each refusal the server can give", () => {
    expect(
      circuitRosterErrorMessage({ errorCode: "CIRCUIT_WAIVER_WINDOW_OPEN" }, "x")
    ).toBe("Free agency is closed while waiver claims are open.");
    expect(circuitRosterErrorMessage({ errorCode: "CIRCUIT_SELECTION_TAKEN" }, "x")).toBe(
      "Another player already has that pick."
    );
    expect(circuitRosterErrorMessage({ message: "Server said no" }, "x")).toBe(
      "Server said no"
    );
    expect(circuitRosterErrorMessage({}, "Could not add")).toBe("Could not add");
  });
});

describe("circuit free agency drop placeholder", () => {
  it("asks for a drop when the roster is full", () => {
    expect(circuitDropPlaceholder(circuitRoster({ rosterSize: 2 }), null)).toBe(
      "Select a pick to drop"
    );
  });

  it("asks for a drop when the chosen category is at its limit", () => {
    const roster = circuitRoster({ maxActing: 1 });
    expect(circuitDropPlaceholder(roster, 21)).toBe("Select a pick to drop");
    expect(circuitDropPlaceholder(roster, 20)).toBe(CIRCUIT_NO_DROP_LABEL);
  });

  it("offers no drop while there is room", () => {
    expect(circuitDropPlaceholder(circuitRoster(), null)).toBe("Don't drop anyone");
  });
});
