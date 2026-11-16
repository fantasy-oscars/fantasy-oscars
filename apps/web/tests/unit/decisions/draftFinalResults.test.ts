import { describe, expect, it } from "vitest";
import { isFinalResults } from "@/decisions/draft/finalResults";

const FINALIZED_AT = "2027-03-15T05:00:00.000Z";

describe("isFinalResults", () => {
  it("is final for a completed draft once results are finalized", () => {
    expect(
      isFinalResults({ draftStatus: "COMPLETED", resultsFinalizedAt: FINALIZED_AT })
    ).toBe(true);
  });

  it.each([null, undefined, ""])(
    "is not final for a completed draft when results_finalized_at is %s",
    (r) => {
      expect(isFinalResults({ draftStatus: "COMPLETED", resultsFinalizedAt: r })).toBe(
        false
      );
    }
  );

  it.each(["IN_PROGRESS", "PAUSED", "PENDING", "CANCELLED", null, undefined])(
    "is never final for draft %s, even when results are finalized",
    (d) => {
      expect(isFinalResults({ draftStatus: d, resultsFinalizedAt: FINALIZED_AT })).toBe(
        false
      );
    }
  );
});
