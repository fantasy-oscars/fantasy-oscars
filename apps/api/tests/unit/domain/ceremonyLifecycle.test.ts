import { describe, expect, it } from "vitest";
import {
  assertCeremonyOpenForLeagues,
  assertCeremonyOpenForSeasons
} from "../../../src/domain/ceremonyLifecycle.js";
import { AppError } from "../../../src/errors.js";

const refusal = (status: string) =>
  expect.objectContaining({
    code: "CEREMONY_NOT_ACTIVE",
    status: 409,
    details: { status }
  });

describe("assertCeremonyOpenForSeasons", () => {
  it.each(["PUBLISHED", "ACTIVE"])("allows season setup in %s", (status) => {
    expect(() => assertCeremonyOpenForSeasons(status)).not.toThrow();
  });

  it.each(["DRAFT", "LOCKED", "ARCHIVED"])("refuses season setup in %s", (status) => {
    expect(() => assertCeremonyOpenForSeasons(status)).toThrow(AppError);
    expect(() => assertCeremonyOpenForSeasons(status)).toThrow(refusal(status));
  });
});

describe("assertCeremonyOpenForLeagues", () => {
  it("allows drafts only once the ceremony is open for leagues", () => {
    expect(() => assertCeremonyOpenForLeagues("ACTIVE")).not.toThrow();
    for (const status of ["DRAFT", "PUBLISHED", "LOCKED", "ARCHIVED"]) {
      expect(() => assertCeremonyOpenForLeagues(status)).toThrow(refusal(status));
    }
  });
});
