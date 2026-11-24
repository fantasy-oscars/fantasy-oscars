import { describe, expect, it } from "vitest";
import { HERO_TAGLINE, formatUpdateDate } from "../../../src/decisions/landing";

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

describe("HERO_TAGLINE", () => {
  it("is the production tagline", () => {
    expect(HERO_TAGLINE).toBe("Draft night, but for awards.");
  });
});
