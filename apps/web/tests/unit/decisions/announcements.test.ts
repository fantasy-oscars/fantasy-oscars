import { describe, expect, it } from "vitest";
import {
  announcementStatusLabel,
  announcementTypeForKey,
  filterAnnouncements,
  homeAnnouncementToReplace,
  parseAnnouncementFilter,
  sortAnnouncements
} from "@/decisions/adminContent";

const row = (
  id: number,
  key: string,
  status: string,
  updated_at = "2026-11-01T00:00:00Z"
) => ({
  id,
  key,
  status,
  updated_at
});

describe("announcement types", () => {
  it("maps each dynamic key to its type", () => {
    expect(announcementTypeForKey("home_main")).toBe("home");
    expect(announcementTypeForKey("banner")).toBe("banner");
    expect(announcementTypeForKey("about")).toBeNull();
  });

  it("parses the type filter, defaulting to all", () => {
    expect(parseAnnouncementFilter("home")).toBe("home");
    expect(parseAnnouncementFilter("banner")).toBe("banner");
    expect(parseAnnouncementFilter(null)).toBe("all");
    expect(parseAnnouncementFilter("home_main")).toBe("all");
  });

  it("labels status as published or draft", () => {
    expect(announcementStatusLabel("PUBLISHED")).toBe("Published");
    expect(announcementStatusLabel("DRAFT")).toBe("Draft");
  });
});

describe("filterAnnouncements", () => {
  const entries = [
    row(1, "home_main", "DRAFT"),
    row(2, "banner", "PUBLISHED"),
    row(3, "banner", "DRAFT")
  ];

  it("keeps every entry for all", () => {
    expect(filterAnnouncements(entries, "all").map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("keeps only the chosen type", () => {
    expect(filterAnnouncements(entries, "home").map((e) => e.id)).toEqual([1]);
    expect(filterAnnouncements(entries, "banner").map((e) => e.id)).toEqual([2, 3]);
  });
});

describe("sortAnnouncements", () => {
  it("orders by last update, newest first, across both types", () => {
    const sorted = sortAnnouncements([
      row(1, "home_main", "DRAFT", "2026-11-01T00:00:00Z"),
      row(2, "banner", "DRAFT", "2026-11-03T00:00:00Z"),
      row(3, "home_main", "PUBLISHED", "2026-11-02T00:00:00Z")
    ]);
    expect(sorted.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("breaks ties with the higher id and does not mutate the input", () => {
    const input = [row(4, "banner", "DRAFT"), row(9, "home_main", "DRAFT")];
    expect(sortAnnouncements(input).map((e) => e.id)).toEqual([9, 4]);
    expect(input.map((e) => e.id)).toEqual([4, 9]);
  });
});

describe("homeAnnouncementToReplace", () => {
  const entries = [
    row(1, "home_main", "PUBLISHED"),
    row(2, "home_main", "DRAFT"),
    row(3, "banner", "PUBLISHED"),
    row(4, "banner", "DRAFT")
  ];

  it("returns the published Home entry when publishing another Home entry", () => {
    expect(homeAnnouncementToReplace(entries, 2)?.id).toBe(1);
  });

  it("replaces nothing when the entry is already the published one", () => {
    expect(homeAnnouncementToReplace(entries, 1)).toBeNull();
  });

  it("replaces nothing when no Home entry is published", () => {
    expect(homeAnnouncementToReplace([row(2, "home_main", "DRAFT")], 2)).toBeNull();
  });

  it("never replaces anything for banners, which can run together", () => {
    expect(homeAnnouncementToReplace(entries, 4)).toBeNull();
  });

  it("replaces nothing for an unknown entry", () => {
    expect(homeAnnouncementToReplace(entries, 99)).toBeNull();
  });
});
