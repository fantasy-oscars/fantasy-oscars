import { describe, expect, it } from "vitest";
import { getSnakeSeatForPick } from "./draftOrder.js";

describe("getSnakeSeatForPick", () => {
  it("throws on invalid inputs", () => {
    expect(() => getSnakeSeatForPick(0, 1)).toThrow();
    expect(() => getSnakeSeatForPick(2, 0)).toThrow();
    expect(() => getSnakeSeatForPick(-1, 1)).toThrow();
  });

  it("returns correct seat for first two rounds (4 seats)", () => {
    const seats = [1, 2, 3, 4];
    const picksRound1 = seats.map((_, i) => getSnakeSeatForPick(4, i + 1));
    expect(picksRound1).toEqual([1, 2, 3, 4]);

    const picksRound2 = seats.map((_, i) => getSnakeSeatForPick(4, 4 + i + 1));
    expect(picksRound2).toEqual([4, 3, 2, 1]);
  });

  it("alternates correctly across multiple rounds (3 seats)", () => {
    const expected = [
      1,
      2,
      3, // round 1
      3,
      2,
      1, // round 2
      1,
      2,
      3 // round 3
    ];
    const results = expected.map((_, i) => getSnakeSeatForPick(3, i + 1));
    expect(results).toEqual(expected);
  });

  it("works for large pick numbers", () => {
    expect(getSnakeSeatForPick(5, 25)).toBe(1); // end of round 5 (odd -> reverse, last seat)
    expect(getSnakeSeatForPick(5, 26)).toBe(1); // start of round 6 (even -> forward, first seat)
  });
});
