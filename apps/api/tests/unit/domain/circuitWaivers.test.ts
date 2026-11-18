import { describe, expect, it } from "vitest";
import { instantOfDay } from "../../../src/domain/circuit.js";
import {
  dueWaiverWindows,
  editableClaimWindow,
  initialWaiverPriorities,
  orderWaiverClaims,
  rotateWaiverPriorities,
  waiverClaimFailure,
  waiverRunExpiresChips
} from "../../../src/domain/circuitWaivers.js";
import type { WaiverWindow } from "../../../src/domain/waiverWindows.js";

const window: WaiverWindow = {
  starts_on: "2026-12-04",
  ends_on: "2026-12-06",
  resolves_on: "2026-12-07",
  scoring_days: ["2026-12-04"]
};

function codeOf(fn: () => unknown) {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe("initialWaiverPriorities", () => {
  it("puts the last seat first and seat 1 last, whatever the input order", () => {
    expect(
      initialWaiverPriorities([
        { seat_number: 2, member_id: 20 },
        { seat_number: 1, member_id: 10 },
        { seat_number: 4, member_id: 40 },
        { seat_number: 3, member_id: 30 }
      ])
    ).toEqual([
      { member_id: 40, waiver_priority: 1 },
      { member_id: 30, waiver_priority: 2 },
      { member_id: 20, waiver_priority: 3 },
      { member_id: 10, waiver_priority: 4 }
    ]);
  });

  it("returns nothing for no seats", () => {
    expect(initialWaiverPriorities([])).toEqual([]);
  });
});

describe("editableClaimWindow", () => {
  it("sends a new claim to the open window", () => {
    expect(
      editableClaimWindow({
        openWindow: window,
        claimWindowStartsOn: null,
        runStarted: false
      })
    ).toBe(window);
  });

  it("refuses a new claim when no window is open", () => {
    expect(
      codeOf(() =>
        editableClaimWindow({
          openWindow: null,
          claimWindowStartsOn: null,
          runStarted: false
        })
      )
    ).toBe("CIRCUIT_WAIVER_WINDOW_CLOSED");
  });

  it("lets a claim change while its own window is open and unlocked", () => {
    expect(
      editableClaimWindow({
        openWindow: window,
        claimWindowStartsOn: "2026-12-04",
        runStarted: false
      })
    ).toBe(window);
  });

  it("locks claims once the processor has started their window", () => {
    expect(
      codeOf(() =>
        editableClaimWindow({
          openWindow: window,
          claimWindowStartsOn: "2026-12-04",
          runStarted: true
        })
      )
    ).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
    expect(
      codeOf(() =>
        editableClaimWindow({
          openWindow: window,
          claimWindowStartsOn: null,
          runStarted: true
        })
      )
    ).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
  });

  it("locks a claim whose window has resolved or is not the open one", () => {
    expect(
      codeOf(() =>
        editableClaimWindow({
          openWindow: null,
          claimWindowStartsOn: "2026-12-04",
          runStarted: false
        })
      )
    ).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
    expect(
      codeOf(() =>
        editableClaimWindow({
          openWindow: { ...window, starts_on: "2027-01-06" },
          claimWindowStartsOn: "2026-12-04",
          runStarted: false
        })
      )
    ).toBe("CIRCUIT_WAIVER_CLAIMS_LOCKED");
  });
});

describe("orderWaiverClaims", () => {
  const priorities = [
    { member_id: 10, waiver_priority: 2 },
    { member_id: 20, waiver_priority: 1 },
    { member_id: 30, waiver_priority: 3 }
  ];

  it("runs chipped claims first by pick number, then priority, then rank", () => {
    const claims = [
      { id: 1, member_id: 10, rank: 1, chip_pick_number: null },
      { id: 2, member_id: 10, rank: 2, chip_pick_number: 9 },
      { id: 3, member_id: 20, rank: 2, chip_pick_number: null },
      { id: 4, member_id: 20, rank: 1, chip_pick_number: null },
      { id: 5, member_id: 30, rank: 1, chip_pick_number: 4 },
      { id: 6, member_id: 30, rank: 2, chip_pick_number: null }
    ];
    expect(orderWaiverClaims(claims, priorities).map((c) => c.id)).toEqual([
      5, 2, 4, 3, 1, 6
    ]);
  });

  it("puts a member without a priority last", () => {
    const claims = [
      { id: 1, member_id: 99, rank: 1, chip_pick_number: null },
      { id: 2, member_id: 30, rank: 1, chip_pick_number: null }
    ];
    expect(orderWaiverClaims(claims, priorities).map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("waiverClaimFailure", () => {
  const held = [
    { selection_id: 1, category_id: 100 },
    { selection_id: 2, category_id: 200 }
  ];
  const base = {
    selectionOwner: null,
    held,
    add: { selection_id: 9, category_id: 100 },
    dropSelectionId: null,
    rosterSize: 3,
    maxOwned: null
  };

  it("wins with space and no limit in the way", () => {
    expect(waiverClaimFailure(base)).toBeNull();
  });

  it("fails when someone, the claimant included, owns the selection", () => {
    expect(waiverClaimFailure({ ...base, selectionOwner: 7 })).toBe("SELECTION_OWNED");
  });

  it("fails when the drop is no longer on the roster", () => {
    expect(waiverClaimFailure({ ...base, dropSelectionId: 5 })).toBe("DROP_NOT_OWNED");
  });

  it("fails at capacity without a drop and wins with one", () => {
    const full = { ...base, rosterSize: 2 };
    expect(waiverClaimFailure(full)).toBe("ROSTER_FULL");
    expect(waiverClaimFailure({ ...full, dropSelectionId: 2 })).toBeNull();
  });

  it("fails past a category limit unless the drop is in that category", () => {
    const limited = { ...base, maxOwned: 1 };
    expect(waiverClaimFailure(limited)).toBe("CATEGORY_LIMIT");
    expect(waiverClaimFailure({ ...limited, dropSelectionId: 1 })).toBeNull();
  });
});

describe("rotateWaiverPriorities", () => {
  const priorities = [
    { member_id: 10, waiver_priority: 1 },
    { member_id: 20, waiver_priority: 2 },
    { member_id: 30, waiver_priority: 3 },
    { member_id: 40, waiver_priority: 4 }
  ];

  it("moves winners to the bottom once, keeping both groups in order", () => {
    expect(rotateWaiverPriorities(priorities, new Set([30, 10]))).toEqual([
      { member_id: 20, waiver_priority: 1 },
      { member_id: 40, waiver_priority: 2 },
      { member_id: 10, waiver_priority: 3 },
      { member_id: 30, waiver_priority: 4 }
    ]);
  });

  it("changes nothing without winners", () => {
    expect(rotateWaiverPriorities(priorities, new Set())).toEqual(priorities);
  });
});

describe("dueWaiverWindows", () => {
  const windows: WaiverWindow[] = [
    window,
    {
      starts_on: "2026-12-10",
      ends_on: "2026-12-12",
      resolves_on: "2026-12-13",
      scoring_days: ["2026-12-10"]
    }
  ];
  const base = {
    windows,
    draftCompletedAt: new Date("2026-12-01T12:00:00Z"),
    runStarts: new Set<string>(),
    pendingClaimStarts: [] as string[]
  };

  it("is empty before the first resolution instant", () => {
    const justBefore = new Date(instantOfDay("2026-12-07").getTime() - 1);
    expect(dueWaiverWindows({ ...base, now: justBefore })).toEqual([]);
  });

  it("returns a window from its resolution instant until it has a run", () => {
    const now = instantOfDay("2026-12-07");
    expect(dueWaiverWindows({ ...base, now }).map((w) => w.starts_on)).toEqual([
      "2026-12-04"
    ]);
    expect(
      dueWaiverWindows({ ...base, now, runStarts: new Set(["2026-12-04"]) })
    ).toEqual([]);
  });

  it("catches up on every missed window, oldest first", () => {
    const now = new Date("2026-12-20T00:00:00Z");
    expect(dueWaiverWindows({ ...base, now })).toEqual([
      { starts_on: "2026-12-04", ends_on: "2026-12-06", resolves_on: "2026-12-07" },
      { starts_on: "2026-12-10", ends_on: "2026-12-12", resolves_on: "2026-12-13" }
    ]);
  });

  it("skips windows that resolved before the draft completed", () => {
    const now = new Date("2026-12-20T00:00:00Z");
    const draftCompletedAt = new Date("2026-12-08T00:00:00Z");
    expect(
      dueWaiverWindows({ ...base, draftCompletedAt, now }).map((w) => w.starts_on)
    ).toEqual(["2026-12-10"]);
  });

  it("keeps a moved window's claims, resolving with the window that covers them", () => {
    const now = instantOfDay("2026-12-13");
    expect(
      dueWaiverWindows({
        ...base,
        runStarts: new Set(["2026-12-04"]),
        pendingClaimStarts: ["2026-12-11"],
        now
      })
    ).toEqual([
      { starts_on: "2026-12-10", ends_on: "2026-12-12", resolves_on: "2026-12-13" },
      { starts_on: "2026-12-11", ends_on: "2026-12-12", resolves_on: "2026-12-13" }
    ]);
  });

  it("resolves a cancelled window's claims three days after its start", () => {
    const pending = { ...base, windows: [], pendingClaimStarts: ["2026-12-04"] };
    expect(dueWaiverWindows({ ...pending, now: instantOfDay("2026-12-06") })).toEqual([]);
    expect(dueWaiverWindows({ ...pending, now: instantOfDay("2026-12-07") })).toEqual([
      { starts_on: "2026-12-04", ends_on: "2026-12-06", resolves_on: "2026-12-07" }
    ]);
  });
});

describe("waiverRunExpiresChips", () => {
  it("expires chips with the first window to open after the draft", () => {
    expect(waiverRunExpiresChips("2026-12-04", new Date("2026-12-01T12:00:00Z"))).toBe(
      true
    );
    expect(waiverRunExpiresChips("2026-12-04", instantOfDay("2026-12-04"))).toBe(true);
  });

  it("does not expire them with a window already open at completion", () => {
    expect(waiverRunExpiresChips("2026-12-04", new Date("2026-12-05T12:00:00Z"))).toBe(
      false
    );
  });
});
