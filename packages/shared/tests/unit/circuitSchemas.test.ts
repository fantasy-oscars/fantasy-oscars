import { describe, expect, it } from "vitest";
import {
  adminCeremonyDatesBody,
  adminCircuitAssociationBody,
  adminCircuitCategoryCreateBody,
  adminCircuitCategoryOrderBody,
  adminCircuitCreateBody,
  adminCircuitEventCreateBody,
  adminCircuitEventOrderBody,
  adminCircuitEventUpdateBody,
  isIsoDateOnly
} from "../../src/schemas/index.js";

describe("circuit schemas", () => {
  it("accepts only real calendar days as dates", () => {
    expect(isIsoDateOnly("2027-01-21")).toBe(true);
    expect(isIsoDateOnly("2028-02-29")).toBe(true);
    expect(isIsoDateOnly("2027-02-29")).toBe(false);
    expect(isIsoDateOnly("2027-1-21")).toBe(false);
    expect(isIsoDateOnly("2027-01-21T00:00:00Z")).toBe(false);
  });

  it("create trims fields, requires code and name, and checks the code", () => {
    expect(
      adminCircuitCreateBody.parse({ code: " 2026-27 ", name: " Circuit ", opens_on: "" })
    ).toEqual({ code: "2026-27", name: "Circuit", opens_on: null });
    expect(
      adminCircuitCreateBody.safeParse({ name: "x" }).error?.issues[0]?.message
    ).toBe("Code is required");
    expect(
      adminCircuitCreateBody.safeParse({ code: "Bad Code", name: "x" }).error?.issues[0]
        ?.message
    ).toBe("Code must be lowercase letters/numbers/dashes only");
  });

  it("association takes an event id, or none for a one-ceremony event", () => {
    expect(adminCircuitAssociationBody.parse({ circuit_event_id: "4" })).toEqual({
      circuit_event_id: 4
    });
    expect(adminCircuitAssociationBody.parse({})).toEqual({ circuit_event_id: null });
    expect(adminCircuitAssociationBody.parse({ circuit_event_id: null })).toEqual({
      circuit_event_id: null
    });
    expect(adminCircuitAssociationBody.safeParse({ circuit_event_id: "x" }).success).toBe(
      false
    );
  });

  it("event create requires a name, checks an optional code and dedupes ceremonies", () => {
    expect(
      adminCircuitEventCreateBody.parse({ name: " Guilds ", ceremony_ids: [3, "3", 4] })
    ).toEqual({ name: "Guilds", code: undefined, ceremony_ids: [3, 4] });
    expect(adminCircuitEventCreateBody.parse({ name: "Guilds", code: "" })).toEqual({
      name: "Guilds",
      code: undefined,
      ceremony_ids: []
    });
    expect(
      adminCircuitEventCreateBody.safeParse({ name: "x", code: "GUILDS" }).error
        ?.issues[0]?.message
    ).toBe("Code must be lowercase letters/numbers/dashes only");
    expect(adminCircuitEventCreateBody.safeParse({ name: " " }).success).toBe(false);
  });

  it("event update needs a field and rejects a blank name", () => {
    expect(adminCircuitEventUpdateBody.parse({ name: " Guild Awards " })).toEqual({
      name: "Guild Awards",
      code: undefined
    });
    expect(adminCircuitEventUpdateBody.safeParse({}).error?.issues[0]?.message).toBe(
      "No fields to update"
    );
    expect(
      adminCircuitEventUpdateBody.safeParse({ name: "" }).error?.issues[0]?.message
    ).toBe("Name is required");
  });

  it("orderings list each id once", () => {
    expect(adminCircuitEventOrderBody.parse({ event_ids: [2, "1"] })).toEqual({
      event_ids: [2, 1]
    });
    expect(adminCircuitEventOrderBody.safeParse({ event_ids: [1, 1] }).success).toBe(
      false
    );
    expect(adminCircuitCategoryOrderBody.safeParse({ category_ids: [] }).success).toBe(
      false
    );
  });

  it("category create takes a template id", () => {
    expect(adminCircuitCategoryCreateBody.parse({ category_family_id: "7" })).toEqual({
      category_family_id: 7
    });
    expect(adminCircuitCategoryCreateBody.safeParse({}).error?.issues[0]?.message).toBe(
      "Choose a category template"
    );
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
