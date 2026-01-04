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
});
