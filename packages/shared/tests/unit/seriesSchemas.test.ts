import { describe, expect, it } from "vitest";
import {
  adminCeremonyDatesBody,
  adminSeriesAssociationBody,
  adminSeriesCreateBody,
  isIsoDateOnly
} from "../../src/schemas/index.js";

describe("series schemas", () => {
  it("accepts only real calendar days as dates", () => {
    expect(isIsoDateOnly("2027-01-21")).toBe(true);
    expect(isIsoDateOnly("2028-02-29")).toBe(true);
    expect(isIsoDateOnly("2027-02-29")).toBe(false);
    expect(isIsoDateOnly("2027-1-21")).toBe(false);
    expect(isIsoDateOnly("2027-01-21T00:00:00Z")).toBe(false);
  });

  it("create trims fields, requires code and name, and checks the code", () => {
    expect(
      adminSeriesCreateBody.parse({ code: " 2026-27 ", name: " Series ", opens_on: "" })
    ).toEqual({ code: "2026-27", name: "Series", opens_on: null });
    expect(adminSeriesCreateBody.safeParse({ name: "x" }).error?.issues[0]?.message).toBe(
      "Code is required"
    );
    expect(
      adminSeriesCreateBody.safeParse({ code: "Bad Code", name: "x" }).error?.issues[0]
        ?.message
    ).toBe("Code must be lowercase letters/numbers/dashes only");
  });

  it("association takes a numeric or numeric-string event id", () => {
    expect(adminSeriesAssociationBody.parse({ series_event_id: "4" })).toEqual({
      series_event_id: 4
    });
    expect(adminSeriesAssociationBody.safeParse({}).success).toBe(false);
  });

  it("dates distinguish absent, cleared and set", () => {
    expect(adminCeremonyDatesBody.parse({ nominations_on: "2027-01-21" })).toEqual({
      nominations_on: "2027-01-21",
      results_on: undefined
    });
    expect(adminCeremonyDatesBody.parse({ results_on: null })).toEqual({
      nominations_on: undefined,
      results_on: null
    });
    expect(adminCeremonyDatesBody.safeParse({}).error?.issues[0]?.message).toBe(
      "No fields to update"
    );
    expect(
      adminCeremonyDatesBody.safeParse({ results_on: "21/01/2027" }).error?.issues[0]
        ?.message
    ).toBe("Enter the results date as YYYY-MM-DD");
  });
});
