/*
 * Circuit domain (ADR 0006, which supersedes parts of ADR 0005). Pure: no IO.
 *
 * Admins define a Circuit's events (groups of ceremonies) and its categories
 * (built from category templates); nothing here fixes either list.
 */

export const circuitStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type CircuitStatus = (typeof circuitStatuses)[number];

export type CircuitCategoryKind = "FILM" | "ACTING";

/**
 * A Circuit category's kind, from its template's default unit kind. Song
 * templates have no kind: selection identity has no song (ADR 0005, section 5).
 */
export function circuitCategoryKindForUnitKind(
  unitKind: string
): CircuitCategoryKind | null {
  if (unitKind === "FILM") return "FILM";
  if (unitKind === "PERFORMANCE") return "ACTING";
  return null;
}

/** Lowercase letters, digits and single dashes, from any label. */
export function codeFromLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `base`, or `base-2`, `base-3`... when taken. Codes are unique within one
 * Circuit; comparison ignores case so a generated code never shadows an older
 * upper-case one.
 */
export function uniqueCode(base: string, taken: Iterable<string>, fallback = "item") {
  const used = new Set([...taken].map((c) => c.toLowerCase()));
  const root = base || fallback;
  if (!used.has(root.toLowerCase())) return root;
  for (let n = 2; ; n += 1) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** True when `ids` lists every one of `current` exactly once. */
export function isFullOrdering(ids: readonly number[], current: readonly number[]) {
  if (ids.length !== current.length) return false;
  const expected = new Set(current);
  return new Set(ids).size === ids.length && ids.every((id) => expected.has(id));
}

/**
 * The Circuit category to pre-select for a ceremony category: the one built
 * from the same template. None when the template is unknown or more than one
 * Circuit category shares it. A suggestion is never saved by itself.
 */
export function suggestCircuitCategoryId(
  familyId: number | null,
  categories: ReadonlyArray<{ id: number; category_family_id: number | null }>
): number | null {
  if (familyId === null) return null;
  const matches = categories.filter((c) => c.category_family_id === familyId);
  return matches.length === 1 ? matches[0]!.id : null;
}

/** An associated ceremony with the dates that drive its scoring occasions. */
export type CircuitCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
  event_code: string;
  event_sort_index: number;
  /** Whole day, `YYYY-MM-DD`. */
  nominations_on: string | null;
  /** Whole day, `YYYY-MM-DD`. */
  results_on: string | null;
};

export type MissingCeremonyDates = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  missing: Array<"nominations_on" | "results_on">;
};

function byEventThenCeremony(a: CircuitCeremonyDates, b: CircuitCeremonyDates) {
  return a.event_sort_index - b.event_sort_index || a.ceremony_id - b.ceremony_id;
}

/**
 * Soft readiness check for activation: the associated ceremonies that lack a
 * nominations or results date. Activation never depends on the result.
 */
export function findCeremoniesMissingDates(
  ceremonies: CircuitCeremonyDates[]
): MissingCeremonyDates[] {
  return [...ceremonies].sort(byEventThenCeremony).flatMap((c) => {
    const missing: MissingCeremonyDates["missing"] = [];
    if (!c.nominations_on) missing.push("nominations_on");
    if (!c.results_on) missing.push("results_on");
    if (missing.length === 0) return [];
    return [
      {
        ceremony_id: c.ceremony_id,
        ceremony_code: c.ceremony_code,
        ceremony_name: c.ceremony_name,
        missing
      }
    ];
  });
}

export type ScoringOccasionKind = "NOMINATION" | "WIN";

/** A `(ceremony, kind)` pair; derived from the ceremony and its dates, never stored. */
export type ScoringOccasion = {
  ceremony_id: number;
  ceremony_code: string | null;
  ceremony_name: string | null;
  circuit_event_id: number;
  event_code: string;
  kind: ScoringOccasionKind;
  /** Whole day, `YYYY-MM-DD`; null until an admin sets it. */
  date: string | null;
};

/**
 * Every associated ceremony has a nomination and a win occasion. Dated
 * occasions come first in date order, then undated ones in event order.
 * On a shared date occasions follow event order, and a ceremony's nomination
 * sorts before its win.
 */
export function listScoringOccasions(
  ceremonies: CircuitCeremonyDates[]
): ScoringOccasion[] {
  const order = new Map<number, number>();
  const occasions = [...ceremonies].sort(byEventThenCeremony).flatMap((c, i) => {
    order.set(c.ceremony_id, i);
    const base = {
      ceremony_id: c.ceremony_id,
      ceremony_code: c.ceremony_code,
      ceremony_name: c.ceremony_name,
      circuit_event_id: c.circuit_event_id,
      event_code: c.event_code
    };
    return [
      { ...base, kind: "NOMINATION" as const, date: c.nominations_on },
      { ...base, kind: "WIN" as const, date: c.results_on }
    ];
  });
  const kindRank = (k: ScoringOccasionKind) => (k === "NOMINATION" ? 0 : 1);
  return occasions.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return (
      (order.get(a.ceremony_id) ?? 0) - (order.get(b.ceremony_id) ?? 0) ||
      kindRank(a.kind) - kindRank(b.kind)
    );
  });
}
