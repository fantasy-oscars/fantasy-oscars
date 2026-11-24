import { describe, expect, it } from "vitest";
import {
  adminCeremonyDatesBody,
  adminCircuitAssociationBody,
  adminCircuitCategoryCreateBody,
  adminCircuitCategoryIconBody,
  adminCircuitCategoryOrderBody,
  adminCircuitCeremonyPositionBody,
  adminCircuitCreateBody,
  adminCircuitEventCeremonyOrderBody,
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

  it("takes a category icon by code and requires one", () => {
    expect(adminCircuitCategoryIconBody.parse({ icon: " movie " })).toEqual({
      icon: "movie"
    });
    expect(adminCircuitCategoryIconBody.safeParse({}).error?.issues[0]?.message).toBe(
      "Choose an icon"
    );
  });

  it("dates set or clear the nominations date only", () => {
    expect(adminCeremonyDatesBody.parse({ nominations_on: "2027-01-21" })).toEqual({
      nominations_on: "2027-01-21"
    });
    expect(adminCeremonyDatesBody.parse({ nominations_on: "" })).toEqual({
      nominations_on: null
    });
    // The results date is derived from the ceremony datetime, never entered.
    expect(
      adminCeremonyDatesBody.parse({ nominations_on: null, results_on: "2027-03-14" })
    ).toEqual({ nominations_on: null });
    expect(adminCeremonyDatesBody.safeParse({}).error?.issues[0]?.message).toBe(
      "No fields to update"
    );
    expect(
      adminCeremonyDatesBody.safeParse({ results_on: "2027-03-14" }).error?.issues[0]
        ?.message
    ).toBe("No fields to update");
    expect(
      adminCeremonyDatesBody.safeParse({ nominations_on: "21/01/2027" }).error?.issues[0]
        ?.message
    ).toBe("Enter the nominations date as YYYY-MM-DD");
  });

  it("ceremony position takes a group or the top level, and an index", () => {
    expect(adminCircuitCeremonyPositionBody.parse({ group_id: "4", index: 2 })).toEqual({
      group_id: 4,
      index: 2
    });
    expect(
      adminCircuitCeremonyPositionBody.parse({ group_id: null, index: "0" })
    ).toEqual({ group_id: null, index: 0 });
    expect(adminCircuitCeremonyPositionBody.parse({ index: 1 })).toEqual({
      group_id: null,
      index: 1
    });
    expect(
      adminCircuitCeremonyPositionBody.safeParse({ index: -1 }).error?.issues[0]?.message
    ).toBe("Choose a position");
    expect(
      adminCircuitCeremonyPositionBody.safeParse({ group_id: 0, index: 1 }).error
        ?.issues[0]?.message
    ).toBe("Choose a group in this Circuit");
  });

  it("group ceremony order lists each ceremony once", () => {
    expect(adminCircuitEventCeremonyOrderBody.parse({ ceremony_ids: [3, "1"] })).toEqual({
      ceremony_ids: [3, 1]
    });
    expect(
      adminCircuitEventCeremonyOrderBody.safeParse({ ceremony_ids: [1, 1] }).error
        ?.issues[0]?.message
    ).toBe("List every ceremony of this group once");
  });
});
