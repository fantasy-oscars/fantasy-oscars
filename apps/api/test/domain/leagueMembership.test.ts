import { describe, expect, it } from "vitest";
import {
  ensureJoinAllowed,
  LeagueMembershipError
} from "../../src/domain/leagueMembership.js";

describe("ensureJoinAllowed", () => {
  it("allows join before draft starts", () => {
    expect(() => ensureJoinAllowed({ draft_status: "PENDING" })).not.toThrow();
  });

  it("rejects join after draft starts", () => {
    expect(() => ensureJoinAllowed({ draft_status: "IN_PROGRESS" })).toThrow(
      LeagueMembershipError
    );
    expect(() => ensureJoinAllowed({ draft_status: "COMPLETED" })).toThrow(
      LeagueMembershipError
    );
    expect(() => ensureJoinAllowed({ draft_status: "CANCELLED" })).toThrow(
      LeagueMembershipError
    );
  });
});
