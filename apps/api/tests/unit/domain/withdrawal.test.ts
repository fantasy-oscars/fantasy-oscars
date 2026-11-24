import { describe, expect, it } from "vitest";
import { assertNoSeasonsToWithdraw } from "../../../src/domain/withdrawal.js";

describe("assertNoSeasonsToWithdraw", () => {
  it("allows withdrawing when no season is set up", () => {
    expect(() => assertNoSeasonsToWithdraw("CEREMONY_HAS_SEASONS", 0)).not.toThrow();
  });

  it("refuses with the count of seasons to remove", () => {
    expect(() => assertNoSeasonsToWithdraw("CIRCUIT_HAS_SEASONS", 1)).toThrow(
      expect.objectContaining({
        code: "CIRCUIT_HAS_SEASONS",
        status: 409,
        message: "Remove the 1 season set up for this first",
        details: { season_count: 1 }
      })
    );
    expect(() => assertNoSeasonsToWithdraw("CEREMONY_HAS_SEASONS", 3)).toThrow(
      expect.objectContaining({
        code: "CEREMONY_HAS_SEASONS",
        message: "Remove the 3 seasons set up for this first"
      })
    );
  });
});
