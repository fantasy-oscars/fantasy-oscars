import { describe, expect, it } from "vitest";
import { instantOfDay } from "../../../src/domain/circuit.js";
import {
  assertAcquisitionFits,
  assertCircuitLeagueInSeason,
  assertHolds,
  assertTransactionShape,
  isHeldAt,
  openCountByCategory,
  openIntervals,
  openIntervalsByMember,
  ownerAt,
  type OwnershipInterval
} from "../../../src/domain/circuitOwnership.js";

const at = (iso: string) => new Date(iso);

// Selection 7 moves from member 1 to member 2 at the Oscar nominations
// instant, then member 2 drops it and member 1 takes it back.
const NOMINATIONS = instantOfDay("2027-01-21"); // 08:00Z
const HISTORY: Array<OwnershipInterval & { category_id: number }> = [
  {
    member_id: 1,
    selection_id: 7,
    category_id: 100,
    acquired_at: at("2026-12-01T03:00:00Z"),
    released_at: NOMINATIONS
  },
  {
    member_id: 2,
    selection_id: 7,
    category_id: 100,
    acquired_at: NOMINATIONS,
    released_at: at("2027-02-01T10:00:00Z")
  },
  {
    member_id: 1,
    selection_id: 7,
    category_id: 100,
    acquired_at: at("2027-02-01T10:00:00Z"),
    released_at: null
  },
  {
    member_id: 1,
    selection_id: 8,
    category_id: 200,
    acquired_at: at("2026-12-01T03:00:00Z"),
    released_at: null
  },
  {
    member_id: 2,
    selection_id: 9,
    category_id: 100,
    acquired_at: at("2026-12-01T03:00:00Z"),
    released_at: null
  }
];

const msBefore = (d: Date) => new Date(d.getTime() - 1);

describe("ownership intervals", () => {
  it("are half-open: the acquirer holds at the boundary, the releaser does not", () => {
    expect(ownerAt(HISTORY, 7, msBefore(NOMINATIONS))).toBe(1);
    expect(ownerAt(HISTORY, 7, NOMINATIONS)).toBe(2);
    expect(isHeldAt(HISTORY[0]!, NOMINATIONS)).toBe(false);
    expect(isHeldAt(HISTORY[1]!, NOMINATIONS)).toBe(true);
  });

  it("has no owner before the first acquisition", () => {
    expect(ownerAt(HISTORY, 7, at("2026-11-30T00:00:00Z"))).toBeNull();
    expect(ownerAt(HISTORY, 7, at("2026-12-01T03:00:00Z"))).toBe(1);
  });

  it("returns a re-acquired selection to its former owner", () => {
    const back = at("2027-02-01T10:00:00Z");
    expect(ownerAt(HISTORY, 7, msBefore(back))).toBe(2);
    expect(ownerAt(HISTORY, 7, back)).toBe(1);
    expect(ownerAt(HISTORY, 7, at("2027-03-14T08:00:00Z"))).toBe(1);
  });

  it("has no owner while released and not yet taken", () => {
    const gap: OwnershipInterval[] = [
      {
        member_id: 3,
        selection_id: 5,
        acquired_at: at("2027-01-01T00:00:00Z"),
        released_at: at("2027-01-05T00:00:00Z")
      },
      {
        member_id: 4,
        selection_id: 5,
        acquired_at: at("2027-01-06T00:00:00Z"),
        released_at: null
      }
    ];
    expect(ownerAt(gap, 5, at("2027-01-05T12:00:00Z"))).toBeNull();
    expect(ownerAt(gap, 5, at("2027-01-06T00:00:00Z"))).toBe(4);
  });

  it("uses the Pacific instant across a DST change", () => {
    // Acquired at 00:00 PST on 2027-03-14; daylight saving starts at 02:00.
    const change: OwnershipInterval[] = [
      {
        member_id: 1,
        selection_id: 3,
        acquired_at: instantOfDay("2027-03-01"),
        released_at: instantOfDay("2027-03-14")
      },
      {
        member_id: 2,
        selection_id: 3,
        acquired_at: instantOfDay("2027-03-14"),
        released_at: null
      }
    ];
    // 07:30Z is 23:30 PST on the 13th: still member 1.
    expect(ownerAt(change, 3, at("2027-03-14T07:30:00Z"))).toBe(1);
    expect(ownerAt(change, 3, at("2027-03-14T08:00:00Z"))).toBe(2);
    // A UTC-7 reading of the date would be an hour early.
    expect(ownerAt(change, 3, at("2027-03-14T07:00:00Z"))).toBe(1);
  });

  it("lists open intervals per member and per category", () => {
    expect(openIntervals(HISTORY).map((i) => i.selection_id)).toEqual([7, 8, 9]);
    const byMember = openIntervalsByMember(HISTORY);
    expect(byMember.get(1)?.map((i) => i.selection_id)).toEqual([7, 8]);
    expect(byMember.get(2)?.map((i) => i.selection_id)).toEqual([9]);
    expect([...openCountByCategory(HISTORY, 1)]).toEqual([
      [100, 1],
      [200, 1]
    ]);
    expect([...openCountByCategory(HISTORY, 2)]).toEqual([[100, 1]]);
  });
});

describe("transaction shape", () => {
  const base = {
    addSelectionId: 1,
    dropSelectionId: null,
    draftPickId: null,
    claimId: null
  };

  it("accepts each kind's shape", () => {
    expect(() => assertTransactionShape({ ...base, kind: "FREE_AGENT" })).not.toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "FREE_AGENT", dropSelectionId: 2 })
    ).not.toThrow();
    expect(() =>
      assertTransactionShape({
        ...base,
        kind: "DROP",
        addSelectionId: null,
        dropSelectionId: 2
      })
    ).not.toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "DRAFT", draftPickId: 9 })
    ).not.toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "WAIVER", claimId: 4, dropSelectionId: 2 })
    ).not.toThrow();
  });

  it("refuses malformed rows", () => {
    expect(() =>
      assertTransactionShape({ ...base, kind: "DROP", dropSelectionId: 2 })
    ).toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "FREE_AGENT", addSelectionId: null })
    ).toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "FREE_AGENT", dropSelectionId: 1 })
    ).toThrow();
    expect(() => assertTransactionShape({ ...base, kind: "DRAFT" })).toThrow();
    expect(() =>
      assertTransactionShape({
        ...base,
        kind: "DRAFT",
        draftPickId: 9,
        dropSelectionId: 2
      })
    ).toThrow();
    expect(() => assertTransactionShape({ ...base, kind: "WAIVER" })).toThrow();
    expect(() =>
      assertTransactionShape({ ...base, kind: "FREE_AGENT", claimId: 4 })
    ).toThrow();
  });
});

describe("acquisition checks", () => {
  const held = [
    { selection_id: 1, category_id: 10 },
    { selection_id: 2, category_id: 10 },
    { selection_id: 3, category_id: 20 }
  ];
  const fits = (over: Partial<Parameters<typeof assertAcquisitionFits>[0]>) => () =>
    assertAcquisitionFits({
      held,
      add: { selection_id: 9, category_id: 30 },
      dropSelectionId: null,
      rosterSize: 4,
      maxOwned: null,
      ...over
    });
  const code = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (err) {
      return (err as { code?: string }).code;
    }
  };

  it("adds below capacity", () => {
    expect(code(fits({}))).toBeNull();
  });

  it("refuses an add at capacity without a drop, and takes it with one", () => {
    expect(code(fits({ rosterSize: 3 }))).toBe("CIRCUIT_ROSTER_FULL");
    expect(code(fits({ rosterSize: 3, dropSelectionId: 3 }))).toBeNull();
  });

  it("enforces the category limit, counting the drop out first", () => {
    const add = { selection_id: 9, category_id: 10 };
    expect(code(fits({ add, maxOwned: 2 }))).toBe("CIRCUIT_CATEGORY_FULL");
    expect(code(fits({ add, maxOwned: 3 }))).toBeNull();
    expect(code(fits({ add, maxOwned: 2, dropSelectionId: 1 }))).toBeNull();
    // Dropping from another category frees a roster spot, not a category one.
    expect(code(fits({ add, maxOwned: 2, dropSelectionId: 3 }))).toBe(
      "CIRCUIT_CATEGORY_FULL"
    );
  });

  it("refuses dropping a selection the member does not hold", () => {
    expect(code(() => assertHolds(held, 3))).toBeNull();
    expect(code(() => assertHolds(held, 4))).toBe("CIRCUIT_SELECTION_NOT_OWNED");
  });

  it("allows adds and drops only in season", () => {
    expect(code(() => assertCircuitLeagueInSeason({ status: "IN_SEASON" }))).toBeNull();
    for (const status of ["SETUP", "INITIALIZED", "DRAFTING", "COMPLETE"]) {
      expect(code(() => assertCircuitLeagueInSeason({ status }))).toBe(
        "CIRCUIT_LEAGUE_NOT_IN_SEASON"
      );
    }
  });
});
