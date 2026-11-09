import { describe, expect, it } from "vitest";
import { canManageSeason } from "../../../src/decisions/seasons/canManageSeason";

const member = (user_id: number, role: string) => ({ user_id, role });

describe("canManageSeason", () => {
  it("allows season owners and co-owners", () => {
    expect(
      canManageSeason({
        userId: 1,
        seasonMembers: [member(1, "OWNER")],
        isSuperAdmin: false
      })
    ).toBe(true);
    expect(
      canManageSeason({
        userId: 1,
        seasonMembers: [member(1, "CO_OWNER")],
        isSuperAdmin: false
      })
    ).toBe(true);
  });

  it("allows a league commissioner when the league roster is known", () => {
    expect(
      canManageSeason({
        userId: 1,
        seasonMembers: [member(1, "MEMBER")],
        leagueMembers: [member(1, "OWNER")],
        isSuperAdmin: false
      })
    ).toBe(true);
  });

  it("allows a super admin who is not a member", () => {
    expect(canManageSeason({ userId: 9, seasonMembers: [], isSuperAdmin: true })).toBe(
      true
    );
  });

  it("denies plain members, strangers and unknown viewers", () => {
    expect(
      canManageSeason({
        userId: 2,
        seasonMembers: [member(1, "OWNER"), member(2, "MEMBER")],
        isSuperAdmin: false
      })
    ).toBe(false);
    expect(
      canManageSeason({
        userId: 3,
        seasonMembers: [member(1, "OWNER")],
        isSuperAdmin: false
      })
    ).toBe(false);
    expect(
      canManageSeason({
        userId: Number.NaN,
        seasonMembers: [member(1, "OWNER")],
        isSuperAdmin: false
      })
    ).toBe(false);
  });
});
