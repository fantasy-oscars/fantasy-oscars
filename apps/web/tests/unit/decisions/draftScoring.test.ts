import { describe, expect, it } from "vitest";
import type { Snapshot } from "@/lib/types";
import {
  buildCategoryWeightByCategoryId,
  buildPointsByNominationId,
  buildRosterBoardSeats,
  buildSeatScoreBySeatNumber,
  buildWinnerCountBySeat,
  buildWinnerSet,
  computeResultsPodium,
  computeResultsWinnerLabel,
  computeTimerRemainingMs
} from "@/decisions/draft/scoring";
import { buildCursorSpyCursors } from "@/decisions/draft/boards";
import { formatNameList } from "@/decisions/draft/pool";

function makeSnapshot(overrides: Partial<Record<string, unknown>> = {}): Snapshot {
  return {
    draft: { status: "COMPLETED", pick_timer_seconds: 60, pick_deadline_at: null },
    seats: [
      { seat_number: 1, username: "ann", user_id: 11 },
      { seat_number: 2, username: "bob", user_id: 12 },
      { seat_number: 3, username: null, user_id: 13 }
    ],
    picks: [
      { pick_number: 1, seat_number: 1, nomination_id: 101 },
      { pick_number: 2, seat_number: 2, nomination_id: 102 },
      { pick_number: 3, seat_number: 3, nomination_id: 103 },
      { pick_number: 4, seat_number: 1, nomination_id: 104 }
    ],
    nominations: [
      { id: 101, category_edition_id: 1 },
      { id: 102, category_edition_id: 2 },
      { id: 103, category_edition_id: 2 },
      { id: 104, category_edition_id: 1 }
    ],
    ...overrides
  } as unknown as Snapshot;
}

const winners = [{ nomination_id: 101 }, { nomination_id: 104 }, { nomination_id: 102 }];

describe("draft scoring decisions", () => {
  it("counts winners per seat", () => {
    const snapshot = makeSnapshot();
    const winnerSet = buildWinnerSet(winners as Snapshot["winners"]);
    const counts = buildWinnerCountBySeat(snapshot, winnerSet);
    expect(Object.fromEntries(counts)).toEqual({ 1: 2, 2: 1, 3: 0 });
  });

  it("parses only valid category weights", () => {
    const m = buildCategoryWeightByCategoryId({
      "1": 3,
      "2": -2,
      "0": 5,
      "3": 100,
      "4": 1.5,
      x: 2
    } as unknown as Snapshot["category_weights"]);
    expect(Object.fromEntries(m)).toEqual({ 1: 3, 2: -2 });
  });

  it("weights points by category only for the weighted strategy", () => {
    const snapshot = makeSnapshot();
    const weights = new Map([[1, 5]]);
    const weighted = buildPointsByNominationId({
      snapshot,
      scoringStrategyName: "category_weighted",
      categoryWeightByCategoryId: weights
    });
    expect(weighted.get(101)).toBe(5);
    expect(weighted.get(102)).toBe(1);
    const fixed = buildPointsByNominationId({
      snapshot,
      scoringStrategyName: "fixed",
      categoryWeightByCategoryId: weights
    });
    expect(fixed.get(101)).toBe(1);
  });

  it("builds a podium with ties and orders ascending for the negative strategy", () => {
    const snapshot = makeSnapshot();
    const winnerSet = buildWinnerSet(winners as Snapshot["winners"]);
    const winnerCountBySeat = buildWinnerCountBySeat(snapshot, winnerSet);
    const seatScoreBySeatNumber = buildSeatScoreBySeatNumber({
      snapshot,
      winnerSet,
      pointsForNominationId: new Map()
    });
    const fixed = computeResultsPodium({
      snapshot,
      isFinalResults: true,
      scoringStrategyName: "fixed",
      seatScoreBySeatNumber,
      winnerCountBySeat
    });
    expect(fixed).toEqual([
      { place: 1, names: ["ann"] },
      { place: 2, names: ["bob"] },
      { place: 3, names: ["Seat 3"] }
    ]);
    const negative = computeResultsPodium({
      snapshot,
      isFinalResults: true,
      scoringStrategyName: "negative",
      seatScoreBySeatNumber,
      winnerCountBySeat
    });
    expect(negative[0]).toEqual({ place: 1, names: ["Seat 3"] });
    expect(
      computeResultsPodium({
        snapshot,
        isFinalResults: false,
        scoringStrategyName: "fixed",
        seatScoreBySeatNumber,
        winnerCountBySeat
      })
    ).toEqual([]);
  });

  it("labels ties and null when not final", () => {
    expect(
      computeResultsWinnerLabel({
        isFinalResults: true,
        resultsPodium: [{ place: 1, names: ["a", "b"] }]
      })
    ).toBe("Tie: a, b");
    expect(
      computeResultsWinnerLabel({
        isFinalResults: true,
        resultsPodium: [{ place: 1, names: ["a"] }]
      })
    ).toBe("a");
    expect(
      computeResultsWinnerLabel({ isFinalResults: false, resultsPodium: [] })
    ).toBeNull();
  });

  it("sorts roster board seats by standing once final", () => {
    const snapshot = makeSnapshot();
    const winnerSet = buildWinnerSet(winners as Snapshot["winners"]);
    const winnerCountBySeat = buildWinnerCountBySeat(snapshot, winnerSet);
    const seatScoreBySeatNumber = new Map<number, number>();
    const final = buildRosterBoardSeats({
      snapshot,
      isFinalResults: true,
      scoringStrategyName: "fixed",
      winnerCountBySeat,
      seatScoreBySeatNumber
    });
    expect(final.map((s) => s.seatNumber)).toEqual([1, 2, 3]);
    const negative = buildRosterBoardSeats({
      snapshot,
      isFinalResults: true,
      scoringStrategyName: "negative",
      winnerCountBySeat,
      seatScoreBySeatNumber
    });
    expect(negative.map((s) => s.seatNumber)).toEqual([3, 2, 1]);
  });

  it("clamps the remaining timer and returns null without a live timer", () => {
    const snapshot = makeSnapshot({
      draft: {
        status: "IN_PROGRESS",
        pick_timer_seconds: 60,
        pick_deadline_at: new Date(10_000 + 90_000).toISOString()
      }
    });
    expect(computeTimerRemainingMs(snapshot, 10_000)).toBe(60_000);
    expect(computeTimerRemainingMs(snapshot, 10_000 + 90_000 + 5)).toBe(0);
    expect(computeTimerRemainingMs(makeSnapshot(), 0)).toBeNull();
    expect(computeTimerRemainingMs(null, 0)).toBeNull();
  });
});

describe("draft board decisions", () => {
  it("maps remote cursors to seats and drops invalid users", () => {
    const snapshot = makeSnapshot();
    const cursors = buildCursorSpyCursors({
      snapshot,
      enabled: true,
      remoteCursorByUserId: {
        11: { x: 0.1, y: 0.2, ts: 1 },
        99: { x: 0.5, y: 0.5, ts: 1 },
        0: { x: 0, y: 0, ts: 1 }
      }
    });
    expect(cursors.map((c) => [c.userId, c.seatNumber, c.label])).toEqual([
      [11, 1, "ann"],
      [99, null, "User 99"]
    ]);
    expect(
      buildCursorSpyCursors({ snapshot, enabled: false, remoteCursorByUserId: {} })
    ).toEqual([]);
  });

  it("formats name lists", () => {
    expect(formatNameList([])).toBe("");
    expect(formatNameList(["a"])).toBe("a");
    expect(formatNameList(["a", "b"])).toBe("a and b");
    expect(formatNameList(["a", "b", "c"])).toBe("a, b, and c");
  });
});
