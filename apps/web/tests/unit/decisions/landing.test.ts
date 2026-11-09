import { describe, expect, it } from "vitest";
import {
  HERO_FALLBACK_TAGLINE,
  computeHeroTitleTier,
  formatUpdateDate,
  titleCase
} from "../../../src/decisions/landing";

describe("titleCase", () => {
  it("capitalises every word", () => {
    expect(titleCase("draft not started")).toBe("Draft Not Started");
    expect(titleCase("DRAFT   LIVE")).toBe("Draft Live");
  });
});

describe("computeHeroTitleTier", () => {
  it.each([
    ["Fantasy Oscars", "display"],
    ["Fantasy Oscars 2027", "display"],
    ["The Ninety-Ninth Academy Awards", "medium"],
    ["Cinematography", "long"],
    ["A".repeat(61), "long"],
    ["Fantasy Oscars for everyone and everything here", "long"]
  ])("classifies %s as %s", (title, tier) => {
    expect(computeHeroTitleTier(title)).toBe(tier);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(computeHeroTitleTier("🎬".repeat(8))).toBe("display");
  });

  it("treats the length limits as inclusive", () => {
    expect(
      computeHeroTitleTier(`${"a".repeat(8)} ${"b".repeat(8)} ${"c".repeat(6)}`)
    ).toBe("display");
    expect(
      computeHeroTitleTier(`${"a".repeat(8)} ${"b".repeat(8)} ${"c".repeat(7)}`)
    ).toBe("medium");
  });
});

describe("formatUpdateDate", () => {
  it("formats an ISO date in the medium style", () => {
    expect(formatUpdateDate("2026-01-31T12:00:00Z")).toMatch(/2026/);
    expect(formatUpdateDate("2026-01-31T12:00:00Z")).toMatch(/31/);
  });

  it("returns an empty string for a missing or invalid date", () => {
    expect(formatUpdateDate(null)).toBe("");
    expect(formatUpdateDate("not a date")).toBe("");
  });
});

describe("HERO_FALLBACK_TAGLINE", () => {
  it("is the stated fallback copy", () => {
    expect(HERO_FALLBACK_TAGLINE).toBe("Draft night, but for awards.");
  });
});
