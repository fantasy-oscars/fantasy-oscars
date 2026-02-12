import { describe, expect, it } from "vitest";
import { fitWisdomOfCrowds } from "../../../../src/services/benchmarking/wisdomOfCrowds.js";

describe("fitWisdomOfCrowds", () => {
  it("ranks higher-picked nominees higher under all-positive weights", () => {
    const nominations = [
      { id: 1, category_edition_id: 10 },
      { id: 2, category_edition_id: 10 },
      { id: 3, category_edition_id: 10 }
    ];
    const seasons = [
      {
        season_id: 1,
        weights_by_category_id: { 10: 1 },
        draft_order: [1, 2, 3]
      },
      {
        season_id: 2,
        weights_by_category_id: { 10: 1 },
        draft_order: [1, 2, 3]
      }
    ];

    const { scoresByNominationId } = fitWisdomOfCrowds({
      nominations,
      seasons,
      iters: 200
    });
    const s1 = scoresByNominationId.get(1) ?? 0;
    const s2 = scoresByNominationId.get(2) ?? 0;
    const s3 = scoresByNominationId.get(3) ?? 0;
    expect(s1).toBeGreaterThan(s2);
    expect(s2).toBeGreaterThan(s3);
  });

  it("learns inverse preference under all-negative weights (avoid-winner logic)", () => {
    const nominations = [
      { id: 1, category_edition_id: 10 },
      { id: 2, category_edition_id: 10 },
      { id: 3, category_edition_id: 10 }
    ];
    // With negative weights, higher latent strength should reduce utility, so the crowd's
    // earlier picks should correspond to LOWER s.
    const seasons = [
      {
        season_id: 1,
        weights_by_category_id: { 10: -1 },
        draft_order: [3, 2, 1]
      }
    ];

    const { scoresByNominationId } = fitWisdomOfCrowds({
      nominations,
      seasons,
      iters: 200
    });
    const sFirst = scoresByNominationId.get(3) ?? 0;
    const sLast = scoresByNominationId.get(1) ?? 0;
    expect(sFirst).toBeLessThan(sLast);
  });

  it("supports mixed positive and negative category weights", () => {
    const nominations = [
      { id: 1, category_edition_id: 10 }, // positive-weight category
      { id: 2, category_edition_id: 10 },
      { id: 3, category_edition_id: 20 }, // negative-weight category
      { id: 4, category_edition_id: 20 }
    ];
    // In the negative-weight category, the lower-s nominee should be picked earlier.
    const seasons = [
      {
        season_id: 1,
        weights_by_category_id: { 10: 2, 20: -2 },
        draft_order: [1, 4, 2, 3]
      },
      {
        season_id: 2,
        weights_by_category_id: { 10: 2, 20: -2 },
        draft_order: [1, 4, 2, 3]
      }
    ];

    const { scoresByNominationId } = fitWisdomOfCrowds({
      nominations,
      seasons,
      iters: 250
    });
    const sPosA = scoresByNominationId.get(1) ?? 0;
    const sPosB = scoresByNominationId.get(2) ?? 0;
    const sNegHigh = scoresByNominationId.get(3) ?? 0;
    const sNegLow = scoresByNominationId.get(4) ?? 0;

    expect(sPosA).toBeGreaterThan(sPosB);
    expect(sNegHigh).toBeGreaterThan(sNegLow);
  });

  it("reports zero sample size for nominees in always-zero-weight categories", () => {
    const nominations = [
      { id: 1, category_edition_id: 10 },
      { id: 2, category_edition_id: 30 } // always zero
    ];
    const seasons = [
      {
        season_id: 1,
        weights_by_category_id: { 10: 1, 30: 0 },
        draft_order: [1, 2]
      },
      {
        season_id: 2,
        weights_by_category_id: { 10: 1, 30: 0 },
        draft_order: [1, 2]
      }
    ];

    const { sampleSizeByNominationId } = fitWisdomOfCrowds({
      nominations,
      seasons,
      iters: 50
    });
    expect(sampleSizeByNominationId.get(2)).toBe(0);
    expect(sampleSizeByNominationId.get(1)).toBeGreaterThan(0);
  });
});
