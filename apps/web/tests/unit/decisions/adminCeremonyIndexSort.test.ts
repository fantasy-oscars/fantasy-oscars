import { describe, expect, it } from "vitest";
import { sortAdminCeremonyIndex } from "@/decisions/admin/ceremonyIndex";

const row = (id: number, status: string, starts_at: string | null = null) => ({
  id,
  status,
  starts_at
});

describe("sortAdminCeremonyIndex", () => {
  it("orders by status: ACTIVE, LOCKED, PUBLISHED, DRAFT, then ARCHIVED", () => {
    const sorted = sortAdminCeremonyIndex([
      row(1, "ARCHIVED", "2027-03-14T01:00:00Z"),
      row(2, "DRAFT", "2027-03-14T01:00:00Z"),
      row(3, "PUBLISHED", "2027-03-14T01:00:00Z"),
      row(4, "LOCKED", "2027-03-14T01:00:00Z"),
      row(5, "ACTIVE", "2027-03-14T01:00:00Z")
    ]);
    expect(sorted.map((c) => c.status)).toEqual([
      "ACTIVE",
      "LOCKED",
      "PUBLISHED",
      "DRAFT",
      "ARCHIVED"
    ]);
  });

  it("puts the soonest date first within a status, and undated ceremonies last", () => {
    const sorted = sortAdminCeremonyIndex([
      row(1, "PUBLISHED", null),
      row(2, "PUBLISHED", "2027-03-14T01:00:00Z"),
      row(3, "PUBLISHED", "2027-01-11T01:00:00Z"),
      row(4, "DRAFT", null),
      row(5, "DRAFT", "2027-02-01T01:00:00Z")
    ]);
    expect(sorted.map((c) => c.id)).toEqual([3, 2, 1, 5, 4]);
  });

  it("puts the most recent archived ceremony first, undated last", () => {
    const sorted = sortAdminCeremonyIndex([
      row(1, "ARCHIVED", "2025-03-02T01:00:00Z"),
      row(2, "ARCHIVED", null),
      row(3, "ARCHIVED", "2026-03-15T01:00:00Z"),
      row(4, "ACTIVE", "2027-03-14T01:00:00Z")
    ]);
    expect(sorted.map((c) => c.id)).toEqual([4, 3, 1, 2]);
  });

  it("treats a missing status as DRAFT and breaks ties by id", () => {
    const sorted = sortAdminCeremonyIndex([
      { id: 9, starts_at: null },
      row(7, "draft", null),
      row(8, "LOCKED", "not a date")
    ]);
    expect(sorted.map((c) => c.id)).toEqual([8, 7, 9]);
  });

  it("does not change its input", () => {
    const rows = [row(2, "DRAFT"), row(1, "ACTIVE")];
    sortAdminCeremonyIndex(rows);
    expect(rows.map((c) => c.id)).toEqual([2, 1]);
  });
});
