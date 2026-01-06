import { describe, expect, it } from "vitest";
import {
  DraftOrderError,
  computePickAssignment,
  computeSeatForPick
} from "../../src/domain/draftOrder.js";

describe("computeSeatForPick", () => {
  it("computes snake ordering for multiple rounds", () => {
    const seats = Array.from({ length: 6 }, (_, i) =>
      computeSeatForPick({
        draft_order_type: "SNAKE",
        seat_count: 3,
        pick_number: i + 1,
        status: "IN_PROGRESS"
      })
    );
    expect(seats).toEqual([1, 2, 3, 3, 2, 1]);

    const assignments = Array.from({ length: 6 }, (_, i) =>
      computePickAssignment({
        draft_order_type: "SNAKE",
        seat_count: 3,
        pick_number: i + 1,
        status: "IN_PROGRESS"
      })
    );
    expect(assignments.map((a) => a.round_number)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(assignments.map((a) => a.seat_number)).toEqual([1, 2, 3, 3, 2, 1]);
  });

  it("rejects invalid inputs", () => {
    expect(() =>
      computeSeatForPick({
        draft_order_type: "SNAKE",
        seat_count: 0,
        pick_number: 1,
        status: "IN_PROGRESS"
      })
    ).toThrow(DraftOrderError);

    expect(() =>
      computeSeatForPick({
        draft_order_type: "LINEAR",
        seat_count: 3,
        pick_number: 1,
        status: "IN_PROGRESS"
      })
    ).toThrow(DraftOrderError);
  });

  it("rejects computation when draft is not in progress", () => {
    expect(() =>
      computeSeatForPick({
        draft_order_type: "SNAKE",
        seat_count: 3,
        pick_number: 1,
        status: "PENDING"
      })
    ).toThrow(DraftOrderError);
  });

  it("satisfies snake ordering invariants across rounds and seats", () => {
    const seatCounts = [2, 3, 4, 5, 6];
    const rounds = 5;

    for (const seat_count of seatCounts) {
      const picksPerRound = seat_count;
      const totalPicks = picksPerRound * rounds;
      const assignments = Array.from({ length: totalPicks }, (_, i) =>
        computePickAssignment({
          draft_order_type: "SNAKE",
          seat_count,
          pick_number: i + 1,
          status: "IN_PROGRESS"
        })
      );

      // No out-of-range seats
      for (const a of assignments) {
        expect(a.seat_number).toBeGreaterThanOrEqual(1);
        expect(a.seat_number).toBeLessThanOrEqual(seat_count);
      }

      // Per-round invariants
      for (let round = 1; round <= rounds; round++) {
        const roundSeats = assignments
          .filter((a) => a.round_number === round)
          .map((a) => a.seat_number);

        // Each participant once per round
        const sortedSeats = [...roundSeats].sort((a, b) => a - b);
        expect(sortedSeats).toEqual(Array.from({ length: seat_count }, (_, i) => i + 1));

        // Direction alternates per round
        const expectedOrder =
          round % 2 === 1
            ? Array.from({ length: seat_count }, (_, i) => i + 1)
            : Array.from({ length: seat_count }, (_, i) => seat_count - i);
        expect(roundSeats).toEqual(expectedOrder);
      }
    }
  });
});
