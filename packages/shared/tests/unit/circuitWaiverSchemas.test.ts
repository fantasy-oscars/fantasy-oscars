import { describe, expect, it } from "vitest";
import {
  circuitClaimBody,
  circuitClaimEditBody,
  circuitClaimOrderBody,
  circuitClaimParams
} from "../../src/schemas/index.js";

const message = (result: { error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("circuit waiver schemas", () => {
  it("a claim takes a selection, an optional drop and an optional chip", () => {
    expect(circuitClaimBody.parse({ selection_id: "4" })).toEqual({
      selection_id: 4,
      drop_selection_id: null,
      chip_id: null
    });
    expect(
      circuitClaimBody.parse({ selection_id: 4, drop_selection_id: "7", chip_id: 2 })
    ).toEqual({ selection_id: 4, drop_selection_id: 7, chip_id: 2 });
    expect(message(circuitClaimBody.safeParse({ chip_id: 2 }))).toBe(
      "Choose a contender to claim"
    );
  });

  it("refuses dropping the contender being claimed", () => {
    expect(
      message(circuitClaimBody.safeParse({ selection_id: 4, drop_selection_id: 4 }))
    ).toBe("Choose a different contender to drop");
  });

  it("an edit keeps omitted fields and clears null ones", () => {
    expect(circuitClaimEditBody.parse({ chip_id: null })).toEqual({ chip_id: null });
    expect(circuitClaimEditBody.parse({ drop_selection_id: "9" })).toEqual({
      drop_selection_id: 9
    });
    expect(message(circuitClaimEditBody.safeParse({}))).toBe(
      "Choose a drop or a chip to change"
    );
  });

  it("an order lists claim ids, and params take the claim id", () => {
    expect(circuitClaimOrderBody.parse({ claim_ids: [3, "1"] })).toEqual({
      claim_ids: [3, 1]
    });
    expect(circuitClaimOrderBody.safeParse({ claim_ids: ["x"] }).success).toBe(false);
    expect(circuitClaimParams.parse({ id: "5", claimId: "8" })).toEqual({
      id: 5,
      claimId: 8
    });
  });
});
