import { describe, expect, it, vi } from "vitest";
import {
  defaultScoringStrategy,
  scoreDraft,
  ScoringError,
  ScoringStrategy
} from "../../src/domain/scoring.js";

const picks = [
  { pick_number: 1, seat_number: 1, nomination_id: "nom-1" },
  { pick_number: 2, seat_number: 2, nomination_id: "nom-2" },
  { pick_number: 3, seat_number: 1, nomination_id: "nom-3" }
];

const results = [
  { nomination_id: "nom-1", won: true, points: 3 },
  { nomination_id: "nom-2", won: false },
  { nomination_id: "nom-3", won: true }
];

describe("scoreDraft", () => {
  it("uses the default strategy to score winners", () => {
    const scores = scoreDraft({ picks, results });
    expect(scores).toEqual([
      { seat_number: 1, points: 2 },
      { seat_number: 2, points: 0 }
    ]);
  });

  it("accepts a swappable strategy without changing callers", () => {
    const strategy: ScoringStrategy = {
      score: vi.fn().mockReturnValue([{ seat_number: 99, points: 10 }])
    };
    const scores = scoreDraft({ picks, results, strategy });
    expect(strategy.score).toHaveBeenCalledWith({ picks, results });
    expect(scores).toEqual([{ seat_number: 99, points: 10 }]);
  });

  it("throws on invalid inputs", () => {
    // @ts-expect-error - intentional bad input
    expect(() => scoreDraft({ picks: null, results })).toThrow(ScoringError);
    // @ts-expect-error - intentional bad input
    expect(() => scoreDraft({ picks, results: null })).toThrow(ScoringError);
  });
});

describe("defaultScoringStrategy", () => {
  it("returns empty scores when no winners are present", () => {
    const scores = defaultScoringStrategy.score({
      picks,
      results: results.map((r) => ({ ...r, won: false }))
    });
    expect(scores).toEqual([
      { seat_number: 1, points: 0 },
      { seat_number: 2, points: 0 }
    ]);
  });
});
