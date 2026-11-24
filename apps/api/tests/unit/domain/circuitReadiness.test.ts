import { describe, expect, it } from "vitest";
import {
  categoryIconGaps,
  circuitCoverage,
  isCircuitReady,
  readinessGaps
} from "../../../src/domain/circuitReadiness.js";

const ceremony = (id: number) => ({
  ceremony_id: id,
  ceremony_code: `c${id}`,
  ceremony_name: `Ceremony ${id}`,
  circuit_event_id: id * 10
});
const category = (id: number) => ({ id, code: `cat${id}`, name: `Category ${id}` });
const edition = (id: number, ceremonyId: number, categoryId: number | null) => ({
  id,
  ceremony_id: ceremonyId,
  code: `e${id}`,
  name: `Edition ${id}`,
  circuit_category_id: categoryId
});

describe("circuitCoverage", () => {
  it("groups editions by the Circuit category they supply, in Circuit order", () => {
    const coverage = circuitCoverage(
      [ceremony(1)],
      [category(5), category(6)],
      [edition(1, 1, 6), edition(2, 1, 5), edition(3, 1, 5)]
    );
    expect(coverage.ceremonies[0]!.supplies).toEqual([
      expect.objectContaining({ circuit_category_id: 5, edition_ids: [2, 3] }),
      expect.objectContaining({ circuit_category_id: 6, edition_ids: [1] })
    ]);
    expect(coverage.ceremonies[0]!.edition_count).toBe(3);
  });

  it("lists unmapped editions and categories no ceremony supplies", () => {
    const coverage = circuitCoverage(
      [ceremony(1), ceremony(2)],
      [category(5), category(6)],
      [edition(1, 1, 5), edition(2, 1, null), edition(3, 2, null), edition(4, 3, 5)]
    );
    expect(coverage.ceremonies[0]!.unmapped_editions.map((e) => e.id)).toEqual([2]);
    expect(coverage.ceremonies[1]!.supplies).toEqual([]);
    expect(coverage.ceremonies[1]!.unmapped_editions.map((e) => e.id)).toEqual([3]);
    expect(coverage.categories_without_ceremony.map((c) => c.id)).toEqual([6]);
  });

  it("does not count editions of ceremonies outside the Circuit", () => {
    const coverage = circuitCoverage([ceremony(1)], [category(5)], [edition(4, 3, 5)]);
    expect(coverage.ceremonies[0]!.edition_count).toBe(0);
    expect(coverage.categories_without_ceremony.map((c) => c.id)).toEqual([5]);
  });
});

describe("isCircuitReady", () => {
  const covered = circuitCoverage([ceremony(1)], [category(5)], [edition(1, 1, 5)]);

  it("needs a ceremony, every date and every ceremony and category covered", () => {
    expect(isCircuitReady(1, readinessGaps(covered, []))).toBe(true);
    expect(isCircuitReady(0, readinessGaps(covered, []))).toBe(false);
    expect(
      isCircuitReady(
        1,
        readinessGaps(covered, [
          {
            ceremony_id: 1,
            ceremony_code: "c1",
            ceremony_name: "Ceremony 1",
            missing: ["nominations_on"]
          }
        ])
      )
    ).toBe(false);
  });

  it("is not blocked by unmapped editions alone", () => {
    const withExtra = circuitCoverage(
      [ceremony(1)],
      [category(5)],
      [edition(1, 1, 5), edition(2, 1, null)]
    );
    const gaps = readinessGaps(withExtra, []);
    expect(gaps.unmapped_edition_count).toBe(1);
    expect(isCircuitReady(1, gaps)).toBe(true);
  });

  it("is blocked by a ceremony with no mapping or a category with no ceremony", () => {
    const bare = circuitCoverage(
      [ceremony(1), ceremony(2)],
      [category(5)],
      [edition(1, 1, 5)]
    );
    expect(isCircuitReady(2, readinessGaps(bare, []))).toBe(false);
    const orphan = circuitCoverage(
      [ceremony(1)],
      [category(5), category(6)],
      [edition(1, 1, 5)]
    );
    expect(isCircuitReady(1, readinessGaps(orphan, []))).toBe(false);
  });
});

describe("categoryIconGaps", () => {
  const withIcon = (id: number, icon_code: string | null) => ({
    ...category(id),
    icon_code
  });

  it("lists categories without an icon and icons more than one category uses", () => {
    expect(
      categoryIconGaps([
        withIcon(1, "movie"),
        withIcon(2, null),
        withIcon(3, "face"),
        withIcon(4, "movie")
      ])
    ).toEqual({
      categories_without_icon: [category(2)],
      shared_icons: [{ icon_code: "movie", categories: [category(1), category(4)] }]
    });
  });

  it("is empty when every category has its own icon", () => {
    expect(categoryIconGaps([withIcon(1, "movie"), withIcon(2, "face")])).toEqual({
      categories_without_icon: [],
      shared_icons: []
    });
  });
});
