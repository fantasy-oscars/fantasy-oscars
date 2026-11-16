/*
 * Circuit admin decisions (ADR 0006). Pure: no IO.
 *
 * Structural edits (ceremonies, events, categories and mappings) stay open
 * after activation, but an ACTIVE Circuit asks the admin to confirm them
 * first. Only an ARCHIVED Circuit is read-only.
 */

export type CircuitDateField = "nominations_on" | "results_on";

export const CIRCUIT_DATE_LABELS: Record<CircuitDateField, string> = {
  nominations_on: "Nominations date",
  results_on: "Results date"
};

export function circuitStatusLabel(status: string | null | undefined): string {
  return String(status || "DRAFT").toUpperCase();
}

export function isCircuitEditable(status: string | null | undefined): boolean {
  return circuitStatusLabel(status) !== "ARCHIVED";
}

export function canActivateCircuit(status: string | null | undefined): boolean {
  return circuitStatusLabel(status) === "DRAFT";
}

/** Owner question 6: structural edits on an ACTIVE Circuit are confirmed first. */
export function needsStructuralEditConfirm(status: string | null | undefined): boolean {
  return circuitStatusLabel(status) === "ACTIVE";
}

export function ceremonyLabel(c: {
  ceremony_name?: string | null;
  ceremony_code?: string | null;
  ceremony_id?: number;
}): string {
  return c.ceremony_name || c.ceremony_code || `Ceremony ${c.ceremony_id ?? ""}`.trim();
}

/** One line per ceremony that lacks a date, e.g. "BAFTA 2027: results date". */
export function describeMissingDates(
  missing: Array<{
    ceremony_id: number;
    ceremony_name?: string | null;
    ceremony_code?: string | null;
    missing: CircuitDateField[];
  }>
): string[] {
  return missing.map((m) => {
    const fields = m.missing.map((f) => CIRCUIT_DATE_LABELS[f].toLowerCase()).join(", ");
    return `${ceremonyLabel(m)}: ${fields}`;
  });
}

/** The ceremonies an admin can still add to a Circuit: those not yet associated. */
export function unassociatedCeremonies<T extends { id: number }>(
  all: T[],
  associatedIds: number[]
): T[] {
  const taken = new Set(associatedIds);
  return all.filter((c) => !taken.has(c.id));
}

/** Each event with its ceremonies, in the order events are given. */
export function ceremoniesByEvent<
  E extends { id: number },
  C extends { circuit_event_id: number }
>(events: E[], ceremonies: C[]): Array<{ event: E; ceremonies: C[] }> {
  return events.map((event) => ({
    event,
    ceremonies: ceremonies.filter((c) => c.circuit_event_id === event.id)
  }));
}

/** Category editions grouped under their ceremony, in the order ceremonies are given. */
export function groupEditionsByCeremony<
  C extends { ceremony_id: number },
  E extends { ceremony_id: number }
>(ceremonies: C[], editions: E[]): Array<{ ceremony: C; editions: E[] }> {
  return ceremonies.map((ceremony) => ({
    ceremony,
    editions: editions.filter((e) => e.ceremony_id === ceremony.ceremony_id)
  }));
}

/**
 * The ids in a new order with `id` moved one place up (-1) or down (+1);
 * null when it is already at that end or not listed.
 */
export function moveInOrder(ids: number[], id: number, delta: -1 | 1): number[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function circuitCategoryKindLabel(kind: string): string {
  return kind === "ACTING" ? "Acting" : "Film";
}

/**
 * The category templates a Circuit category can be built from. Song
 * templates are left out: a Circuit selection is a film or a performance.
 */
export function circuitTemplateOptions<
  T extends { id: number; name: string; default_unit_kind: string }
>(templates: T[]): T[] {
  return templates.filter((t) => t.default_unit_kind !== "SONG");
}

/** An admin's unsaved mapping choices, by category edition id; null means "not mapped". */
export type MappingChoices = Record<number, number | null>;

type MappableEdition = {
  id: number;
  circuit_category_id: number | null;
  suggested_circuit_category_id: number | null;
};

/**
 * The Circuit category shown for a ceremony category: the admin's unsaved
 * choice, else the saved mapping, else the template suggestion. A choice that
 * points at a category that no longer exists shows as unmapped.
 */
export function effectiveMapping(
  edition: MappableEdition,
  choices: MappingChoices,
  circuitCategoryIds: number[]
): number | null {
  const value =
    edition.id in choices
      ? (choices[edition.id] ?? null)
      : (edition.circuit_category_id ?? edition.suggested_circuit_category_id);
  return value !== null && circuitCategoryIds.includes(value) ? value : null;
}

/** True when the shown mapping differs from what is saved. */
export function isMappingUnsaved(
  edition: MappableEdition,
  choices: MappingChoices,
  circuitCategoryIds: number[]
): boolean {
  return (
    effectiveMapping(edition, choices, circuitCategoryIds) !== edition.circuit_category_id
  );
}

/** The writes a save sends: one per ceremony category whose shown mapping is unsaved. */
export function pendingMappingChanges(
  editions: MappableEdition[],
  choices: MappingChoices,
  circuitCategoryIds: number[]
): Array<{ categoryEditionId: number; circuitCategoryId: number | null }> {
  return editions
    .filter((e) => isMappingUnsaved(e, choices, circuitCategoryIds))
    .map((e) => ({
      categoryEditionId: e.id,
      circuitCategoryId: effectiveMapping(e, choices, circuitCategoryIds)
    }));
}

/**
 * Each Circuit category with the ceremony categories shown as mapped to it,
 * so a many-to-one mapping reads at a glance.
 */
export function mappedCeremonyCategories<
  K extends { id: number },
  C extends { ceremony_id: number },
  E extends MappableEdition & { ceremony_id: number }
>(
  categories: K[],
  ceremonies: C[],
  editions: E[],
  choices: MappingChoices
): Array<{
  category: K;
  mapped: Array<{ ceremony: C; edition: E; unsaved: boolean }>;
}> {
  const ids = categories.map((c) => c.id);
  return categories.map((category) => ({
    category,
    mapped: groupEditionsByCeremony(ceremonies, editions).flatMap((g) =>
      g.editions
        .filter((e) => effectiveMapping(e, choices, ids) === category.id)
        .map((edition) => ({
          ceremony: g.ceremony,
          edition,
          unsaved: isMappingUnsaved(edition, choices, ids)
        }))
    )
  }));
}

export function occasionKindLabel(kind: string): string {
  return kind === "NOMINATION" ? "Nominations" : "Results";
}

/** Whole-day dates are shown as stored (`YYYY-MM-DD`) so no time zone shifts them. */
export function dateOnlyLabel(value: string | null | undefined): string {
  return value ? value : "No date";
}
