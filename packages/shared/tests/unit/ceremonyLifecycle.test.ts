import { describe, expect, it } from "vitest";
import {
  ceremonyStatuses,
  isCeremonyContentEditable,
  isCeremonyOpenForLeagues,
  isCeremonyStatus
} from "../../src/ceremonyLifecycle.js";

describe("ceremonyLifecycle", () => {
  it("lists the lifecycle statuses in order", () => {
    expect(ceremonyStatuses).toEqual([
      "DRAFT",
      "PUBLISHED",
      "ACTIVE",
      "LOCKED",
      "ARCHIVED"
    ]);
  });

  it("recognises only lifecycle statuses", () => {
    ceremonyStatuses.forEach((status) => expect(isCeremonyStatus(status)).toBe(true));
    expect(isCeremonyStatus("COMPLETE")).toBe(false);
    expect(isCeremonyStatus("draft")).toBe(false);
  });

  it.each([
    ["DRAFT", true],
    ["PUBLISHED", true],
    ["ACTIVE", false],
    ["LOCKED", false],
    ["ARCHIVED", false],
    ["UNKNOWN", false]
  ])("content editable in %s: %s", (status, expected) => {
    expect(isCeremonyContentEditable(status)).toBe(expected);
  });

  it.each([
    ["DRAFT", false],
    ["PUBLISHED", false],
    ["ACTIVE", true],
    ["LOCKED", false],
    ["ARCHIVED", false],
    ["UNKNOWN", false]
  ])("open for leagues in %s: %s", (status, expected) => {
    expect(isCeremonyOpenForLeagues(status)).toBe(expected);
  });
});
