/*
 * Series admin decisions (ADR 0005). Pure: no IO.
 *
 * Structural edits (associations and mappings) stay open after activation, but
 * an ACTIVE Series asks the admin to confirm them first. Only an ARCHIVED
 * Series is read-only.
 */

export type SeriesDateField = "nominations_on" | "results_on";

export const SERIES_DATE_LABELS: Record<SeriesDateField, string> = {
  nominations_on: "Nominations date",
  results_on: "Results date"
};

export function seriesStatusLabel(status: string | null | undefined): string {
  return String(status || "DRAFT").toUpperCase();
}

export function isSeriesEditable(status: string | null | undefined): boolean {
  return seriesStatusLabel(status) !== "ARCHIVED";
}

export function canActivateSeries(status: string | null | undefined): boolean {
  return seriesStatusLabel(status) === "DRAFT";
}

/** Owner question 6: structural edits on an ACTIVE Series are confirmed first. */
export function needsStructuralEditConfirm(status: string | null | undefined): boolean {
  return seriesStatusLabel(status) === "ACTIVE";
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
    missing: SeriesDateField[];
  }>
): string[] {
  return missing.map((m) => {
    const fields = m.missing.map((f) => SERIES_DATE_LABELS[f].toLowerCase()).join(", ");
    return `${ceremonyLabel(m)}: ${fields}`;
  });
}

/** The ceremonies an admin can still add to a Series: those not yet associated. */
export function unassociatedCeremonies<T extends { id: number }>(
  all: T[],
  associatedIds: number[]
): T[] {
  const taken = new Set(associatedIds);
  return all.filter((c) => !taken.has(c.id));
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

export function occasionKindLabel(kind: string): string {
  return kind === "NOMINATION" ? "Nominations" : "Results";
}

/** Whole-day dates are shown as stored (`YYYY-MM-DD`) so no time zone shifts them. */
export function dateOnlyLabel(value: string | null | undefined): string {
  return value ? value : "No date";
}
