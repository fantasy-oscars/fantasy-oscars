/*
 * Circuit readiness and mapping coverage. Pure: no IO.
 *
 * Coverage answers, for each associated ceremony, which Circuit categories
 * its editions supply and which editions map to nothing. Readiness adds what
 * an admin still has to do before the Circuit can score: dates and mappings.
 * Unmapped editions are reported but never block readiness, since a ceremony
 * may carry categories the Circuit does not score.
 */

import type { MissingCeremonyDates } from "./circuit.js";

export type CoverageCeremony = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
};

export type CoverageCategory = { id: number; code: string; name: string };

export type CoverageEdition = {
  id: number;
  ceremony_id: number;
  code: string;
  name: string;
  circuit_category_id: number | null;
};

export type CeremonyCoverage = CoverageCeremony & {
  /** Circuit categories this ceremony supplies, in Circuit order. */
  supplies: Array<{
    circuit_category_id: number;
    code: string;
    name: string;
    edition_ids: number[];
  }>;
  /** Editions that map to no Circuit category, in ceremony order. */
  unmapped_editions: Array<{ id: number; code: string; name: string }>;
  edition_count: number;
};

export type CircuitCoverage = {
  ceremonies: CeremonyCoverage[];
  /** Circuit categories that no associated ceremony supplies. */
  categories_without_ceremony: CoverageCategory[];
};

export function circuitCoverage(
  ceremonies: readonly CoverageCeremony[],
  categories: readonly CoverageCategory[],
  editions: readonly CoverageEdition[]
): CircuitCoverage {
  const supplied = new Set<number>();
  const rows = ceremonies.map((ceremony): CeremonyCoverage => {
    const own = editions.filter((e) => e.ceremony_id === ceremony.ceremony_id);
    const supplies = categories.flatMap((category) => {
      const ids = own
        .filter((e) => e.circuit_category_id === category.id)
        .map((e) => e.id);
      if (ids.length === 0) return [];
      supplied.add(category.id);
      return [
        {
          circuit_category_id: category.id,
          code: category.code,
          name: category.name,
          edition_ids: ids
        }
      ];
    });
    const known = new Set(categories.map((c) => c.id));
    return {
      ...ceremony,
      supplies,
      unmapped_editions: own
        .filter(
          (e) => e.circuit_category_id === null || !known.has(e.circuit_category_id)
        )
        .map((e) => ({ id: e.id, code: e.code, name: e.name })),
      edition_count: own.length
    };
  });
  return {
    ceremonies: rows,
    categories_without_ceremony: categories.filter((c) => !supplied.has(c.id))
  };
}

export type CircuitReadinessGaps = {
  /** Ceremonies lacking a nominations date or a ceremony datetime. */
  missing_dates: MissingCeremonyDates[];
  /** Ceremonies whose editions supply no Circuit category at all. */
  ceremonies_without_mappings: CoverageCeremony[];
  categories_without_ceremony: CoverageCategory[];
  unmapped_edition_count: number;
};

/** Nothing to do: a Circuit with no ceremonies is not ready. */
export function isCircuitReady(
  ceremonyCount: number,
  gaps: CircuitReadinessGaps
): boolean {
  return (
    ceremonyCount > 0 &&
    gaps.missing_dates.length === 0 &&
    gaps.ceremonies_without_mappings.length === 0 &&
    gaps.categories_without_ceremony.length === 0
  );
}

export function readinessGaps(
  coverage: CircuitCoverage,
  missingDates: MissingCeremonyDates[]
): CircuitReadinessGaps {
  return {
    missing_dates: missingDates,
    ceremonies_without_mappings: coverage.ceremonies
      .filter((c) => c.supplies.length === 0)
      .map((c) => ({
        ceremony_id: c.ceremony_id,
        ceremony_code: c.ceremony_code,
        ceremony_name: c.ceremony_name,
        circuit_event_id: c.circuit_event_id
      })),
    categories_without_ceremony: coverage.categories_without_ceremony,
    unmapped_edition_count: coverage.ceremonies.reduce(
      (sum, c) => sum + c.unmapped_editions.length,
      0
    )
  };
}

export type CategoryIconGaps = {
  /** Categories with no icon: their season pills fall back to a neutral glyph. */
  categories_without_icon: CoverageCategory[];
  /** Icons that more than one category uses, with those categories in Circuit order. */
  shared_icons: Array<{ icon_code: string; categories: CoverageCategory[] }>;
};

/**
 * Icon flags for the readiness report. They never block readiness: a season
 * still plays, but its pills cannot tell those categories apart at a glance.
 */
export function categoryIconGaps(
  categories: ReadonlyArray<CoverageCategory & { icon_code: string | null }>
): CategoryIconGaps {
  const strip = (c: CoverageCategory): CoverageCategory => ({
    id: c.id,
    code: c.code,
    name: c.name
  });
  const byIcon = new Map<string, CoverageCategory[]>();
  for (const c of categories) {
    if (c.icon_code === null) continue;
    byIcon.set(c.icon_code, [...(byIcon.get(c.icon_code) ?? []), strip(c)]);
  }
  return {
    categories_without_icon: categories.filter((c) => c.icon_code === null).map(strip),
    shared_icons: [...byIcon.entries()]
      .filter(([, shared]) => shared.length > 1)
      .map(([icon_code, shared]) => ({ icon_code, categories: shared }))
  };
}
