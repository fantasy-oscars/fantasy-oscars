/*
 * The Circuit editor's Readiness tab. Pure: no IO.
 *
 * Turns the readiness report into the lines an admin works through: what
 * still blocks the Circuit, and per ceremony which Circuit categories it
 * supplies and which of its categories are left unmapped.
 */

import { describeMissingDates, ceremonyLabel } from "./circuit";

type Named = {
  ceremony_id: number;
  ceremony_name: string | null;
  ceremony_code: string | null;
};

export type ReadinessInput = {
  ready: boolean;
  gaps: {
    missing_dates: Array<Named & { missing: Array<"nominations_on" | "results_on"> }>;
    ceremonies_without_mappings: Named[];
    categories_without_ceremony: Array<{ id: number; name: string }>;
    categories_without_icon: Array<{ id: number; name: string }>;
    shared_icons: Array<{ icon_code: string; categories: Array<{ name: string }> }>;
  };
  coverage: {
    ceremonies: Array<
      Named & {
        supplies: Array<{
          circuit_category_id: number;
          name: string;
          edition_ids: number[];
        }>;
        unmapped_editions: Array<{ id: number; name: string }>;
        edition_count: number;
      }
    >;
  };
};

export type ReadinessTodo = { key: string; text: string };

/** What still blocks the Circuit, one line each; empty when it is ready. */
export function readinessTodos(report: ReadinessInput): ReadinessTodo[] {
  const { gaps } = report;
  return [
    ...describeMissingDates(gaps.missing_dates).map((line, i) => ({
      key: `dates-${gaps.missing_dates[i]!.ceremony_id}`,
      text: `Needs a date: ${line}`
    })),
    ...gaps.ceremonies_without_mappings.map((c) => ({
      key: `unmapped-${c.ceremony_id}`,
      text: `Supplies no category: ${ceremonyLabel(c)}`
    })),
    ...gaps.categories_without_ceremony.map((c) => ({
      key: `category-${c.id}`,
      text: `No ceremony supplies ${c.name}`
    }))
  ];
}

/**
 * Category icon flags, one line each. They never block readiness: a season
 * pill shows its category only by icon, so these pills look alike.
 */
export function readinessIconFlags(report: ReadinessInput): ReadinessTodo[] {
  const { gaps } = report;
  return [
    ...gaps.categories_without_icon.map((c) => ({
      key: `no-icon-${c.id}`,
      text: `${c.name} has no icon, so its pills show the neutral trophy`
    })),
    ...gaps.shared_icons.map((s) => ({
      key: `shared-icon-${s.icon_code}`,
      text: `${s.categories.map((c) => c.name).join(", ")} share the icon ${s.icon_code}`
    }))
  ];
}

export type CoverageRow = {
  ceremonyId: number;
  label: string;
  /** Circuit category names with the number of editions feeding each. */
  supplies: Array<{ id: number; name: string; editions: number }>;
  unmapped: Array<{ id: number; name: string }>;
};

export function coverageRows(report: ReadinessInput): CoverageRow[] {
  return report.coverage.ceremonies.map((c) => ({
    ceremonyId: c.ceremony_id,
    label: ceremonyLabel(c),
    supplies: c.supplies.map((s) => ({
      id: s.circuit_category_id,
      name: s.name,
      editions: s.edition_ids.length
    })),
    unmapped: c.unmapped_editions
  }));
}
